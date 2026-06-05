"""
ERA5 PyTorch Dataset — Rome, Italy
====================================
Loads the NetCDF files produced by era5_download.py and exposes them as a
standard PyTorch Dataset for next-day weather forecasting.

Data layout after download:
    data/era5/
        single_level/   era5_sl_2000.nc … era5_sl_2023.nc
        pressure_level/ era5_pl_2000.nc … era5_pl_2023.nc

Channel layout  (23 channels total):
    0-7   Single-level : t2m d2m u10 v10 msl sp tp tcc
    8-22  Pressure-level: z/t/q/u/v at 500, 700, 850 hPa  (5 vars × 3 levels)

Input  X : (C, H, W)  or  (lookback, C, H, W) when lookback > 1
           C=23  H=5 lat-points  W=5 lon-points  (Rome 0.25° grid)
Target y : (5, H, W)
           channels = [t2m, msl, tp, u10, v10]  (physical units, normalised)

Normalisation is always computed from the training set and passed to val/test
to prevent data leakage.  Use get_splits() to obtain consistent splits.
"""

import numpy as np
import torch
from torch.utils.data import Dataset, DataLoader
from pathlib import Path
import xarray as xr

# ── Variable names as stored in ERA5 NetCDF files ─────────────────────────────
SL_VARS      = ["t2m", "d2m", "u10", "v10", "msl", "sp", "tp", "tcc"]
TARGET_VARS  = ["t2m", "msl", "tp", "u10", "v10"]   # first 5 of SL_VARS
PL_VARS      = ["z", "t", "q", "u", "v"]
PL_LEVELS    = [500, 700, 850]

N_SL       = len(SL_VARS)                       # 8
N_PL       = len(PL_VARS) * len(PL_LEVELS)      # 15
N_CHANNELS = N_SL + N_PL                        # 23
N_TARGETS  = len(TARGET_VARS)                   # 5

# ── Recommended year splits ───────────────────────────────────────────────────
TRAIN_YEARS = list(range(2010, 2019))
VAL_YEARS   = [2019, 2020]
TEST_YEARS  = [2021, 2022]


class ERA5RomeDataset(Dataset):
    """
    ERA5 daily weather dataset for Rome, Italy.

    Args:
        data_dir  : root directory containing single_level/ and pressure_level/
        years     : list of years to load (default: all available)
        stats     : {"mean": Tensor(C,1,1), "std": Tensor(C,1,1)} for z-score
                    normalisation.  Pass None to compute from this split
                    (always derive from training split, then pass to val/test).
        lookback  : number of consecutive input days  (default 1)
    """

    def __init__(
        self,
        data_dir: str | Path = "data/era5",
        years: list[int] | None = None,
        stats: dict | None = None,
        lookback: int = 1,
    ):
        self.data_dir = Path(data_dir)
        self.lookback = lookback

        if years is None:
            years = TRAIN_YEARS + VAL_YEARS + TEST_YEARS

        print(f"Loading ERA5 — years {min(years)}-{max(years)} …")
        self.data = self._load(years)            # (T, C, H, W) float32

        if stats is None:
            stats = self._compute_stats(self.data)
        self.stats = stats
        self.data  = self._normalise(self.data)

        print(f"  Loaded: {self.data.shape[0]} timesteps  "
              f"| {N_CHANNELS} channels  "
              f"| grid {self.data.shape[2]}×{self.data.shape[3]}")

    # ── Internal loading ───────────────────────────────────────────────────────

    def _load(self, years: list[int]) -> torch.Tensor:
        # Files are named era5_sl_{year}_{month}.nc (4 underscore-tokens)
        # Old yearly files (era5_sl_{year}.nc) are ignored via the length check.
        def _is_monthly(path: Path) -> bool:
            parts = path.stem.split("_")
            return len(parts) == 4 and parts[2].isdigit() and parts[3].isdigit()

        def _year_of(path: Path) -> int:
            return int(path.stem.split("_")[2])

        sl_files = sorted(
            f for f in (self.data_dir / "single_level").glob("era5_sl_*.nc")
            if _is_monthly(f) and _year_of(f) in years
        )
        pl_files = sorted(
            f for f in (self.data_dir / "pressure_level").glob("era5_pl_*.nc")
            if _is_monthly(f) and _year_of(f) in years
        )

        if not sl_files:
            raise FileNotFoundError(
                f"No single-level NetCDF files found for years {years}.\n"
                f"Run era5_download.py first."
            )
        if not pl_files:
            raise FileNotFoundError(
                f"No pressure-level NetCDF files found for years {years}.\n"
                f"Run era5_download.py first."
            )

        sl_ds = xr.open_mfdataset(sl_files, combine="by_coords", engine="netcdf4")
        pl_ds = xr.open_mfdataset(pl_files, combine="by_coords", engine="netcdf4")

        # New CDS API names the time coordinate 'valid_time'; old API used 'time'
        time_dim_sl = "valid_time" if "valid_time" in sl_ds.coords else "time"
        time_dim_pl = "valid_time" if "valid_time" in pl_ds.coords else "time"

        # Align on the common time axis (guards against partial years at boundaries)
        common = np.intersect1d(sl_ds[time_dim_sl].values, pl_ds[time_dim_pl].values)
        sl_ds  = sl_ds.sel({time_dim_sl: common})
        pl_ds  = pl_ds.sel({time_dim_pl: common})

        # Detect pressure-level dimension name (ERA5 NetCDF uses 'pressure_level')
        pl_dim = "pressure_level" if "pressure_level" in pl_ds.dims else "level"

        channels = []

        for var in SL_VARS:
            if var not in sl_ds:
                # Variable absent in this download (e.g. tp not served at 12 UTC)
                T, H, W = sl_ds[time_dim_sl].size, sl_ds.sizes["latitude"], sl_ds.sizes["longitude"]
                channels.append(np.zeros((T, H, W), dtype=np.float32))
                continue
            arr = sl_ds[var].values.astype(np.float32)   # (T, H, W)
            channels.append(arr)

        for var in PL_VARS:
            for level in PL_LEVELS:
                arr = pl_ds[var].sel({pl_dim: level}, method="nearest")
                channels.append(arr.values.astype(np.float32))   # (T, H, W)

        sl_ds.close()
        pl_ds.close()

        stacked = np.stack(channels, axis=1)              # (T, C, H, W)
        return torch.from_numpy(stacked)

    # ── Normalisation ──────────────────────────────────────────────────────────

    @staticmethod
    def _compute_stats(data: torch.Tensor) -> dict:
        """Z-score stats over time and spatial dims, per channel."""
        mean = data.mean(dim=(0, 2, 3))                  # (C,)
        std  = data.std(dim=(0, 2, 3)).clamp(min=1e-6)   # (C,)
        return {
            "mean": mean.view(-1, 1, 1),
            "std" : std.view(-1, 1, 1),
        }

    @staticmethod
    def _normalise(data: torch.Tensor, stats: dict | None = None) -> torch.Tensor:
        if stats is None:
            return data
        return (data - stats["mean"]) / stats["std"]

    def _normalise(self, data: torch.Tensor) -> torch.Tensor:
        return (data - self.stats["mean"]) / self.stats["std"]

    # ── Dataset interface ──────────────────────────────────────────────────────

    def __len__(self) -> int:
        return len(self.data) - self.lookback

    def __getitem__(self, idx: int):
        """
        Returns:
            x : (C, H, W)           when lookback == 1
                (lookback, C, H, W) when lookback  > 1
            y : (5, H, W)           next-day [t2m, msl, tp, u10, v10] normalised
        """
        x = self.data[idx : idx + self.lookback]         # (lookback, C, H, W)
        y = self.data[idx + self.lookback, :N_TARGETS]   # (5, H, W)

        if self.lookback == 1:
            x = x.squeeze(0)                             # (C, H, W)

        return x, y

    # ── Helpers ────────────────────────────────────────────────────────────────

    @property
    def input_shape(self) -> tuple:
        H, W = self.data.shape[2], self.data.shape[3]
        if self.lookback == 1:
            return (N_CHANNELS, H, W)
        return (self.lookback, N_CHANNELS, H, W)

    @property
    def target_shape(self) -> tuple:
        return (N_TARGETS, self.data.shape[2], self.data.shape[3])

    def denormalise_target(self, y_norm: torch.Tensor) -> torch.Tensor:
        """Convert a normalised target tensor back to physical units."""
        mean = self.stats["mean"][:N_TARGETS]
        std  = self.stats["std"][:N_TARGETS]
        return y_norm * std + mean


# ── Convenience factory ────────────────────────────────────────────────────────

def get_splits(
    data_dir: str | Path = "data/era5",
    lookback: int = 1,
    batch_size: int = 32,
    num_workers: int = 0,
) -> tuple[DataLoader, DataLoader, DataLoader]:
    """
    Build train / val / test DataLoaders with consistent normalisation.

    Normalisation stats are derived from the training split only (no leakage).

    Returns:
        train_loader, val_loader, test_loader
    """
    train_ds = ERA5RomeDataset(data_dir, TRAIN_YEARS, lookback=lookback)
    val_ds   = ERA5RomeDataset(data_dir, VAL_YEARS,   stats=train_ds.stats, lookback=lookback)
    test_ds  = ERA5RomeDataset(data_dir, TEST_YEARS,  stats=train_ds.stats, lookback=lookback)

    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True,  num_workers=num_workers)
    val_loader   = DataLoader(val_ds,   batch_size=batch_size, shuffle=False, num_workers=num_workers)
    test_loader  = DataLoader(test_ds,  batch_size=batch_size, shuffle=False, num_workers=num_workers)

    print(f"\nSplits ready:")
    print(f"  Train : {len(train_ds):>5} samples  ->  {len(train_loader):>4} batches")
    print(f"  Val   : {len(val_ds):>5} samples  ->  {len(val_loader):>4} batches")
    print(f"  Test  : {len(test_ds):>5} samples  ->  {len(test_loader):>4} batches")
    print(f"  Input shape  : {train_ds.input_shape}")
    print(f"  Target shape : {train_ds.target_shape}")
    print(f"  Target vars  : {TARGET_VARS}")

    return train_loader, val_loader, test_loader


if __name__ == "__main__":
    train_loader, val_loader, test_loader = get_splits()

    x, y = next(iter(train_loader))
    print(f"\nBatch x : {tuple(x.shape)}  dtype={x.dtype}")
    print(f"Batch y : {tuple(y.shape)}  dtype={y.dtype}")
