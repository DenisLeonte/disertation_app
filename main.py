"""
ERA5 Rome — Neuroevolution Training
=====================================
Evolves a population of ConvNets using a (μ+λ) genetic algorithm.

Stop conditions (set at least one; both can be active simultaneously):
  MAX_GENERATIONS : hard cap
  PATIENCE        : stop if best val loss hasn't improved for this many generations

Each generation:
  1. Train each individual for EPOCHS_PER_GEN epochs
  2. Rank by val MSE
  3. Keep top N_SURVIVORS (elitist)
  4. Fill population by mutating survivors
  5. Log to training_log.csv

Distributed mode (Ray):
  When multiple DirectML / CUDA devices are detected and Ray is installed,
  genomes are dispatched round-robin to per-GPU worker actors so all devices
  train in parallel.  Falls back to single-device mode automatically.
"""

import random
from pathlib import Path

import torch
import torch.nn as nn
from torch.utils.data import TensorDataset, DataLoader

from era5_dataset import get_splits
from genome import Genome
from evolution import Population, Logger, eval_loss, plateau_detected, save_checkpoint, load_checkpoint


# ── Device helpers ─────────────────────────────────────────────────────────────

def detect_devices() -> tuple[list, int]:
    """Return (list-of-device-objects, count) for all available accelerators."""
    try:
        import torch_directml
        n = torch_directml.device_count()
        devices = [torch_directml.device(i) for i in range(n)]
        names   = [torch_directml.device_name(i) for i in range(n)]
        print(f"Backend : DirectML  |  {n} device(s) found")
        for i, name in enumerate(names):
            print(f"  [{i}] {name}")
        return devices, n
    except ImportError:
        pass

    if torch.cuda.is_available():
        n = torch.cuda.device_count()
        devices = [torch.device(f"cuda:{i}") for i in range(n)]
        print(f"Backend : CUDA  |  {n} device(s) found")
        return devices, n

    print("Backend : CPU")
    return [torch.device("cpu")], 1


def extract_tensors(loader: DataLoader) -> tuple[torch.Tensor, torch.Tensor]:
    """Concatenate all batches from a DataLoader into two CPU tensors."""
    xs, ys = zip(*list(loader))
    return torch.cat(xs), torch.cat(ys)


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    # ── Config ────────────────────────────────────────────────────────────────
    POP_SIZE        = 16
    N_SURVIVORS     = 8
    MAX_GENERATIONS = None     # no hard cap — runs until plateau
    PATIENCE        = 10       # generations without improvement before stopping
    EPOCHS_PER_GEN  = 50       # training epochs per individual per generation
    BATCH_SIZE      = 1024
    LR              = 1e-3
    LOOKBACK        = 1
    SEED            = 42
    LOG_PATH        = Path("training_log.csv")
    CKPT            = Path("best_model.pth")
    RESUME_CKPT     = Path("evolution_checkpoint.pth")

    assert MAX_GENERATIONS is not None or PATIENCE is not None, \
        "Set at least one stop condition (MAX_GENERATIONS or PATIENCE)"

    rng = random.Random(SEED)
    torch.manual_seed(SEED)

    # ── Device detection ──────────────────────────────────────────────────────
    devices, n_devices = detect_devices()
    device = devices[0]   # primary device (used for single-GPU path + final eval)

    # ── Data — extracted as CPU tensors once, then sent to device(s) ──────────
    train_loader, val_loader, test_loader = get_splits(
        lookback=LOOKBACK, batch_size=BATCH_SIZE, num_workers=0,
    )
    stats = train_loader.dataset.stats

    print("\nExtracting data tensors …")
    train_X, train_Y = extract_tensors(train_loader)
    val_X,   val_Y   = extract_tensors(val_loader)
    test_X,  test_Y  = extract_tensors(test_loader)

    # ── Ray setup (multi-GPU) ─────────────────────────────────────────────────
    workers   = None
    use_ray   = False

    if n_devices > 1:
        try:
            import ray
            from ray_workers import GPUWorker, run_generation_distributed
            ray.init(ignore_reinit_error=True)
            print(f"\nRay  |  spawning {n_devices} GPU workers …")
            workers = [
                GPUWorker.remote(i, train_X, train_Y, val_X, val_Y, BATCH_SIZE)
                for i in range(n_devices)
            ]
            use_ray = True
            print("Workers ready.\n")
        except ImportError:
            print("Ray not installed — falling back to single-device mode.")
            print("  Install with:  pip install ray\n")

    # Single-device: move data to GPU now
    if not use_ray:
        print(f"Moving data to {device} …")
        train_loader = DataLoader(
            TensorDataset(train_X.to(device), train_Y.to(device)),
            batch_size=BATCH_SIZE, shuffle=True,
        )
        val_loader = DataLoader(
            TensorDataset(val_X.to(device), val_Y.to(device)),
            batch_size=BATCH_SIZE, shuffle=False,
        )

    # Test loader always on primary device (used only for final evaluation)
    test_loader = DataLoader(
        TensorDataset(test_X.to(device), test_Y.to(device)),
        batch_size=BATCH_SIZE, shuffle=False,
    )

    # ── Initial population (or resume) ───────────────────────────────────────
    criterion = nn.MSELoss()

    if RESUME_CKPT.exists():
        print(f"Resuming from {RESUME_CKPT} …")
        pop, gen, best_ever, best_history = load_checkpoint(RESUME_CKPT, rng)
        logger = Logger(LOG_PATH, append=True)
        print(f"  Resumed at generation {gen}  |  Best so far: {best_ever:.5f}")
    else:
        pop          = Population([Genome.random(rng) for _ in range(POP_SIZE)])
        logger       = Logger(LOG_PATH)
        best_history = []
        best_ever    = float("inf")
        gen          = 0

    mode = f"Ray ({n_devices} GPUs)" if use_ray else f"single device ({device})"
    print(f"\nPopulation : {POP_SIZE}  |  Survivors : {N_SURVIVORS}"
          f"  |  Patience : {PATIENCE}  |  Mode : {mode}")

    # ── Evolution loop ────────────────────────────────────────────────────────
    while True:
        gen += 1
        print(f"\n{'─' * 60}")
        print(f"  Generation {gen}")
        print(f"{'─' * 60}")

        if use_ray:
            train_losses = run_generation_distributed(pop, workers, EPOCHS_PER_GEN, LR)
        else:
            train_losses = pop.run_generation(train_loader, val_loader, device,
                                              EPOCHS_PER_GEN, LR, criterion)

        best_genome, best_val = pop.best()
        best_history.append(best_val)

        if best_val < best_ever:
            best_ever = best_val
            torch.save({
                "generation": gen,
                "specs":      best_genome.specs,
                "blocks":     best_genome._blocks,
                "head":       best_genome._head,
                "val_loss":   best_val,
                "stats":      stats,
            }, CKPT)
            print(f"\n  ★ New best: val MSE {best_val:.5f}  →  {CKPT}")

        print(f"  Overall best: {best_ever:.5f}")

        # Log AFTER best_ever is updated so the CSV row reflects the post-gen state.
        logger.log(gen, pop, train_losses, best_ever)

        # Save evolution state so an interrupted run can resume
        pop = pop.evolve(N_SURVIVORS, rng)
        save_checkpoint(RESUME_CKPT, pop, gen, best_ever, best_history, rng)

        # Stop conditions
        if MAX_GENERATIONS is not None and gen >= MAX_GENERATIONS:
            print(f"\nReached MAX_GENERATIONS ({MAX_GENERATIONS}). Stopping.")
            break
        if PATIENCE is not None and plateau_detected(best_history, PATIENCE):
            print(f"\nPlateau: no improvement over {PATIENCE} generations. Stopping.")
            break

    # Clean up resume checkpoint — training finished cleanly
    if RESUME_CKPT.exists():
        RESUME_CKPT.unlink()

    if use_ray:
        import ray
        ray.shutdown()

    # ── Test evaluation ───────────────────────────────────────────────────────
    print(f"\n{'=' * 60}")
    ckpt        = torch.load(CKPT, map_location=device, weights_only=False)
    best_genome = Genome(ckpt["specs"], ckpt["blocks"], ckpt["head"])
    model       = best_genome.build_model(device)
    test_mse    = eval_loss(model, test_loader, criterion)

    print(f"  Test MSE   : {test_mse:.5f}")
    print(f"  Best gen   : {ckpt['generation']}")
    print(f"  Arch       : {best_genome.describe()}")
    print(f"  Params     : {best_genome.n_params / 1e6:.2f}M")
    print(f"  Log        : {LOG_PATH}")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
