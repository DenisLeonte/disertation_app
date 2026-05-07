# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

Dissertation project: a **(μ+λ) neuroevolution** pipeline that evolves convolutional next-day weather forecasters on ERA5 reanalysis data over a 5×5 grid centered on Rome. Each "individual" is a `Genome` carrying both an architecture spec and its trained weights (Lamarckian — weights survive across generations).

## Commands

All commands assume the project's `venv` is active.

```bash
# 1. One-time: download ERA5 NetCDF files from Copernicus CDS (~hours, queue-dependent)
#    Requires ~/.cdsapirc with CDS UID + API key (see era5_download.py header)
python era5_download.py

# 2. Repair zip-disguised .nc files if a download was interrupted mid-extract
python unzipper.py

# 3. Smoke test: build splits and print one batch shape
python era5_dataset.py

# 4. Run evolution (Windows shortcut: start.bat)
python main.py

# 5. Inspect a completed (or interrupted) run for anomalies
python analyze_log.py                    # defaults to training_log.csv
python analyze_log.py path/to/other.csv  # explicit path
```

There is no test suite, linter, or build step — this is a research codebase. Validation is by running `main.py` and inspecting `training_log.csv` / printed val MSE.

### Resuming an interrupted run

`main.py` writes `evolution_checkpoint.pth` after every generation. If that file exists at startup, training resumes from it (Logger appends to `training_log.csv`). The checkpoint is **deleted on clean finish** — so its presence specifically means "the last run did not terminate cleanly." The best model so far is always in `best_model.pth`.

### Docker

`dockerfile` + `run.sh` exist but are **CPU-only** on Windows (Docker Desktop has no AMD GPU passthrough). For real training on this machine, run natively so DirectML can see the GPU. The `run.sh` flags target a ROCm/Linux host.

## Architecture

The evolution loop in `main.py` orchestrates four modules. Read them in this order to understand the system:

### `genome.py` — what an individual is

- `LayerSpec(out_channels, kernel_size)` — one hidden conv block. The head is always a 1×1 projection to `N_TARGETS=5`.
- `DynamicConvNet` — `Conv2d → BatchNorm2d → GELU` repeated per spec, then 1×1 head. No spatial reduction (5×5 stays 5×5).
- `BlockWeights` / `HeadWeights` — CPU tensor containers extracted from a trained model. **A genome's weights live on CPU between generations** and are re-injected via `_inject()` whenever a model is built for training.
- Mutations:
  - `mutate_weights` — Gaussian noise, σ ∈ [0.0005, 0.005] (60% of mutations)
  - `add_layer` — insert a *near-identity* conv (15%) so the new architecture starts behaving like its parent
  - `remove_layer` — drop a layer and **repair channel mismatch** in the successor or head (13%)
  - `resize_layer` — change a layer's width and resize neighbouring weight tensors via crop/pad (12%)
- The single best genome each generation is **carried through unmutated** (see `Population.evolve`) — the champion is protected from accidental destruction.

### `evolution.py` — population, logging, stop conditions

- `Population.run_generation` — single-device path: trains each genome for `EPOCHS_PER_GEN` epochs with AdamW(weight_decay=1e-4), evaluates on val, syncs weights back into the genome.
- `plateau_detected(history, patience)` — stops training when best val loss has not improved by `min_delta=1e-4` over `patience` generations.
- `save_checkpoint` / `load_checkpoint` — persists the entire population + RNG state. Use `weights_only=False` because checkpoints contain Python dataclasses (`LayerSpec`, `BlockWeights`, `HeadWeights`).
- `Logger` writes one CSV row per individual per generation (`training_log.csv`).

### `ray_workers.py` — multi-GPU path

- `GPUWorker` is a stateful Ray actor: it owns one DirectML/CUDA device and holds the entire dataset on it (avoids re-transferring tensors each generation).
- `run_generation_distributed` uses **dynamic dispatch** (`ray.wait(num_returns=1)` + immediate re-feed) rather than pre-sharding the population. This lets heterogeneous GPUs self-balance.
- `main.py` only takes the Ray path if `n_devices > 1` AND `import ray` succeeds; otherwise falls back silently to single-device mode.

### `era5_dataset.py` — data layer

- 23 input channels: 8 single-level surface vars + 5 pressure-level vars × 3 levels (500/700/850 hPa).
- 5 target channels (next-day): `[t2m, msl, tp, u10, v10]`.
- Files are **monthly** NetCDFs named `era5_{sl,pl}_{year}_{month}.nc`. The loader explicitly skips legacy yearly files (`era5_sl_{year}.nc`) via a 4-token stem check — don't accidentally re-introduce yearly naming.
- Coord name handling: new CDS API uses `valid_time` and `pressure_level`; old API used `time` and `level`. Both are detected.
- Normalisation stats are **always computed from the training split** and passed into val/test splits to prevent leakage. Always use `get_splits()` rather than instantiating `ERA5RomeDataset` directly unless you understand this.

### `era5_download.py` — CDS pipeline

- Downloads at **12 UTC daily snapshots**, per-month files. Note the precipitation caveat in the file header: `tp` is a 1-hour accumulation, not a true daily total — this is an intentional simplification for daily-resolution forecasting.
- CDS sometimes returns a ZIP with a `.nc` extension; `_unzip_if_needed` detects this via PK magic bytes and rewrites the file. On Windows you must `unlink()` before `rename()` (already handled).

### `analyze_log.py` — post-hoc log analysis

Reads `training_log.csv` and prints five analyses:

1. **Run summary** — generations, pop size, schema (legacy 6-col vs extended 11-col), unique architectures seen.
2. **Best-ever trajectory** — per-generation best val loss; warns if stagnation exceeds `patience` (default 10).
3. **Champion regression** — detects generations where the carried-over champion's val got *worse* after re-training (architecture preserved but loss degraded by ≥ 0.01).
4. **Diversity collapse** — warns if a single architecture holds ≥ 60 % of the population for ≥ 5 consecutive generations.
5. **Duplicate-architecture clusters** — top-5 repeated architectures in the final generation with intra-cluster val spread.

Handles both the legacy 6-column schema and the extended 11-column schema (which adds `train_loss`, `best_ever`, `is_champion`, `mutation_type`, `parent_idx`).

## Conventions / gotchas

- **Device backend priority** is DirectML → CUDA → CPU (see `detect_devices` in `main.py`). DirectML is the path that actually works on this Windows + AMD setup; do not assume CUDA.
- `Genome._blocks` and `Genome._head` are accessed by name from `main.py`, `ray_workers.py`, and the checkpoint code. The leading underscore is **not** a privacy hint here — treat them as part of the public surface and update all three sites if renamed.
- `CHANNEL_OPTS` and `KERNEL_OPTS` in `genome.py` define the architecture search space (channel widths up to 1024, kernels in {1, 3}). Changing them changes what mutations can produce but does not invalidate existing checkpoints.
- Every `Genome` carries `mutation_type` and `parent_idx` lineage fields (set by `Population.evolve`; `None` for the initial population). These flow into `training_log.csv` columns and are round-tripped through checkpoints via `.get()` so old checkpoints without them still load cleanly.
- Spatial dims stay 5×5 throughout — no pooling/striding. That's why even 1024-channel layers are tractable on this tiny grid.
- `requirements.txt` does not pin versions and does not include CUDA-specific wheels; on Windows install `torch-directml` for GPU support.

## Verification before claiming done

There is no CI or test suite — the contract below is what "I checked it works" means in this repo.

**Always, for any change:**

```bash
python era5_dataset.py
```

Loads all splits and prints one batch shape. Cheap (~seconds once NetCDFs are cached). Catches dataset, normalisation, and import-graph regressions without touching the GPU.

**Additionally, for changes touching `genome.py`, `evolution.py`, `ray_workers.py`, or `main.py`:** run one full generation end-to-end. There is no CLI flag for this, so:

1. Move any real-run state out of the way so the smoke test can't pollute it or resume from it:
   ```bash
   mv evolution_checkpoint.pth evolution_checkpoint.pth.bak 2>/dev/null || true
   mv training_log.csv         training_log.csv.bak         2>/dev/null || true
   ```
2. In `main.py`, temporarily set `MAX_GENERATIONS = 1` (and consider lowering `POP_SIZE`/`EPOCHS_PER_GEN` if you only need a structural smoke check — defaults are 16 × 50 and take minutes, not seconds).
3. Run `python main.py` and confirm: it prints generation 1 results, writes a row per individual to `training_log.csv`, and exits with a "Test MSE" line (no traceback).
4. Revert the `main.py` edit and restore the `.bak` files.

A passing 1-generation run is the minimum bar — it exercises model build, train, eval, weight extract/inject, mutation, checkpoint round-trip, and (on multi-GPU) Ray dispatch. If you only changed code that this path doesn't touch (e.g. `era5_download.py`), the dataset check alone is sufficient.
