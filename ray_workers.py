"""
Ray distributed genome training.

Each GPUWorker actor owns one DirectML device and its copy of the data.
The head process (main.py) dispatches genomes round-robin and collects results.
"""

from __future__ import annotations

import time
import torch
import torch.nn as nn
from torch.utils.data import TensorDataset, DataLoader

import ray

from genome import Genome
from evolution import train_epoch, eval_loss


# ── Worker actor ───────────────────────────────────────────────────────────────

@ray.remote
class GPUWorker:
    """Stateful actor: owns one GPU and holds the full dataset on it."""

    def __init__(
        self,
        device_id: int,
        train_X: torch.Tensor, train_Y: torch.Tensor,
        val_X:   torch.Tensor, val_Y:   torch.Tensor,
        batch_size: int,
    ):
        try:
            import torch_directml
            self.device = torch_directml.device(device_id)
            name = torch_directml.device_name(device_id)
        except ImportError:
            n_cuda = torch.cuda.device_count()
            self.device = torch.device(f"cuda:{device_id}" if n_cuda > device_id else "cpu")
            name = str(self.device)

        self.device_id = device_id
        self.criterion = nn.MSELoss()

        self.train_loader = DataLoader(
            TensorDataset(train_X.to(self.device), train_Y.to(self.device)),
            batch_size=batch_size, shuffle=True,
        )
        self.val_loader = DataLoader(
            TensorDataset(val_X.to(self.device), val_Y.to(self.device)),
            batch_size=batch_size, shuffle=False,
        )
        print(f"[Worker {device_id}] ready  —  {name}")

    def train_genome(self, genome_state: dict, epochs: int, lr: float) -> dict:
        genome = Genome(genome_state["specs"], genome_state["blocks"], genome_state["head"])
        model  = genome.build_model(self.device)
        opt    = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)

        t0 = time.perf_counter()
        for _ in range(epochs):
            train_epoch(model, self.train_loader, opt, self.criterion)

        val = eval_loss(model, self.val_loader, self.criterion)
        genome.sync_from(model)

        return {
            "specs":     genome.specs,
            "blocks":    genome._blocks,
            "head":      genome._head,
            "val_loss":  val,
            "elapsed":   time.perf_counter() - t0,
            "device_id": self.device_id,
        }


# ── Distributed generation ─────────────────────────────────────────────────────

def run_generation_distributed(pop, workers: list, epochs_per_gen: int, lr: float):
    """Train all genomes in *pop* across Ray workers; updates pop in-place.

    Uses dynamic dispatch: each worker is fed one genome at a time so faster
    GPUs naturally pick up more work instead of idling after their fixed share.
    """

    pending = list(enumerate(pop.genomes))   # [(idx, genome), ...]
    fut_to_worker: dict = {}                 # future -> (genome_idx, worker)

    def _dispatch(worker):
        if not pending:
            return
        idx, genome = pending.pop(0)
        state = {"specs": genome.specs, "blocks": genome._blocks, "head": genome._head}
        fut = worker.train_genome.remote(state, epochs_per_gen, lr)
        fut_to_worker[fut] = (idx, worker)

    # Seed — one genome per worker
    for w in workers:
        _dispatch(w)

    while fut_to_worker:
        done, _ = ray.wait(list(fut_to_worker.keys()), num_returns=1)
        for fut in done:
            idx, worker = fut_to_worker.pop(fut)
            result = ray.get(fut)
            pop.genomes[idx] = Genome(result["specs"], result["blocks"], result["head"])
            pop.scores[idx]  = result["val_loss"]
            print(
                f"    [{idx+1:02d}/{len(pop)}]  val={result['val_loss']:.5f}"
                f"  params={pop.genomes[idx].n_params/1e6:.2f}M"
                f"  layers={len(pop.genomes[idx].specs)}"
                f"  gpu={result['device_id']}"
                f"  {result['elapsed']:.1f}s"
            )
            _dispatch(worker)   # immediately feed the freed worker its next genome

    best_genome, best_val = pop.best()
    print(f"  → generation best: {best_val:.5f}  arch: {best_genome.describe()}")
