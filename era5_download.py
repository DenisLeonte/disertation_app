"""
ERA5 Download Pipeline — Rome, Italy
=====================================
Downloads ERA5 daily reanalysis data via the Copernicus CDS API.

One-time setup:
  1. Register at  https://cds.climate.copernicus.eu
  2. Accept the ERA5 licence on the CDS website (required before any download)
  3. Create the file  ~/.cdsapirc  (Windows: C:/Users/<you>/.cdsapirc) with:
         url: https://cds.climate.copernicus.eu/api/v2
         key: <UID>:<API-KEY>
     Find your UID and API key on your CDS profile page.
  4. pip install -r requirements.txt

Notes on precipitation:
  ERA5 'total_precipitation' is a 1-hour accumulation ending at the requested
  time.  Downloading at 12 UTC gives a snapshot, not a true daily total.
  This is a standard approximation for daily-resolution ML forecasting.
  For exact daily totals you would need to sum 24 hourly downloads — much
  larger downloads and beyond the scope of this pipeline.

Download time estimate (CDS queue dependent):
  ~1-5 minutes per year per variable group.  24 years × 2 groups ≈ 2-4 hours
  total (varies heavily with CDS queue load).
"""

import cdsapi
import zipfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path


def _unzip_if_needed(path: Path) -> None:
    """If the downloaded file is a ZIP, extract the .nc inside and replace it."""
    with open(path, "rb") as f:
        magic = f.read(4)
    if magic[:2] != b"PK":
        return   # already a real NetCDF
    print(f"  Unzipping {path.name} …")
    with zipfile.ZipFile(path) as zf:
        nc_names = [n for n in zf.namelist() if n.endswith(".nc")]
        if not nc_names:
            raise RuntimeError(f"No .nc file found inside {path}")
        zf.extract(nc_names[0], path.parent)
    extracted = path.parent / nc_names[0]
    path.unlink()               # delete zip-disguised file first (Windows requires this)
    extracted.rename(path)      # rename extracted file into place

# ── Region: Rome, Italy ────────────────────────────────────────────────────────
# 0.25° native ERA5 grid → 5 latitude × 5 longitude points
# Lats: 41.5 41.75 42.0 42.25 42.5   Lons: 12.0 12.25 12.5 12.75 13.0
AREA = [42.5, 12.0, 41.5, 13.0]   # [North, West, South, East]
GRID = [0.25, 0.25]

# ── Time range ─────────────────────────────────────────────────────────────────
# Recommended split:  train 2000-2018 | val 2019-2020 | test 2021-2023
TRAIN_YEARS = list(range(2010, 2019))   # 9 years — sufficient for forecasting
VAL_YEARS   = [2019, 2020]
TEST_YEARS  = [2021, 2022]
ALL_YEARS   = TRAIN_YEARS + VAL_YEARS + TEST_YEARS

MONTHS = [f"{m:02d}" for m in range(1, 13)]
DAYS   = [f"{d:02d}" for d in range(1, 32)]   # CDS silently ignores invalid dates
TIME   = "12:00"                                # 12 UTC snapshot as daily representative

# ── Variables ──────────────────────────────────────────────────────────────────
SINGLE_LEVEL_VARS = [
    "2m_temperature",
    "2m_dewpoint_temperature",
    "10m_u_component_of_wind",
    "10m_v_component_of_wind",
    "mean_sea_level_pressure",
    "surface_pressure",
    "total_precipitation",
    "total_cloud_cover",
]

PRESSURE_LEVEL_VARS = [
    "geopotential",
    "temperature",
    "specific_humidity",
    "u_component_of_wind",
    "v_component_of_wind",
]
PRESSURE_LEVELS = ["500", "700", "850"]

# ── Output directories ─────────────────────────────────────────────────────────
DATA_DIR = Path("data/era5")
SL_DIR   = DATA_DIR / "single_level"
PL_DIR   = DATA_DIR / "pressure_level"


# CDS allows 2 active requests per user; more threads just queue faster on their side.
# Raise to 4-6 if your account has a higher limit (check your CDS profile).
MAX_WORKERS = 4

# Thread-local storage so each worker thread gets its own cdsapi.Client.
_tls = threading.local()
_print_lock = threading.Lock()


def _client() -> cdsapi.Client:
    if not hasattr(_tls, "client"):
        _tls.client = cdsapi.Client(quiet=True)
    return _tls.client


def _log(msg: str) -> None:
    with _print_lock:
        print(msg, flush=True)


def _download_with_retry(dataset: str, request: dict, out: Path, label: str,
                         retries: int = 3) -> str:
    """Submit one CDS request, retry on transient errors. Returns a status string."""
    if out.exists():
        return f"[skip] {out.name}"
    client = _client()
    for attempt in range(1, retries + 1):
        try:
            _log(f"  → queued  {label}")
            client.retrieve(dataset, request, str(out))
            _unzip_if_needed(out)
            return f"[done]  {out.name}"
        except Exception as exc:
            if attempt == retries:
                return f"[FAIL]  {out.name} — {exc}"
            wait = 2 ** attempt
            _log(f"  [retry {attempt}/{retries}] {label} — {exc}  (wait {wait}s)")
            time.sleep(wait)


def _make_tasks() -> list[tuple[str, dict, Path, str]]:
    """Build the full list of (dataset, request, output_path, label) tuples."""
    tasks = []
    for year in ALL_YEARS:
        for month in MONTHS:
            sl_out = SL_DIR / f"era5_sl_{year}_{month}.nc"
            tasks.append((
                "reanalysis-era5-single-levels",
                {
                    "product_type": "reanalysis",
                    "variable":     SINGLE_LEVEL_VARS,
                    "year":         str(year),
                    "month":        month,
                    "day":          DAYS,
                    "time":         TIME,
                    "area":         AREA,
                    "grid":         GRID,
                    "format":       "netcdf",
                },
                sl_out,
                f"sl {year}-{month}",
            ))
            pl_out = PL_DIR / f"era5_pl_{year}_{month}.nc"
            tasks.append((
                "reanalysis-era5-pressure-levels",
                {
                    "product_type":   "reanalysis",
                    "variable":       PRESSURE_LEVEL_VARS,
                    "pressure_level": PRESSURE_LEVELS,
                    "year":           str(year),
                    "month":          month,
                    "day":            DAYS,
                    "time":           TIME,
                    "area":           AREA,
                    "grid":           GRID,
                    "format":         "netcdf",
                },
                pl_out,
                f"pl {year}-{month}",
            ))
    return tasks


def main():
    SL_DIR.mkdir(parents=True, exist_ok=True)
    PL_DIR.mkdir(parents=True, exist_ok=True)

    tasks = _make_tasks()
    pending = [(ds, req, out, lbl) for ds, req, out, lbl in tasks if not out.exists()]
    skipped = len(tasks) - len(pending)

    print(f"ERA5 download — Rome, Italy  |  {len(ALL_YEARS)} years")
    print(f"Region : N={AREA[0]}  W={AREA[1]}  S={AREA[2]}  E={AREA[3]}")
    print(f"Time   : daily snapshot at {TIME} UTC")
    print(f"Split  : train {TRAIN_YEARS[0]}-{TRAIN_YEARS[-1]}  "
          f"| val {VAL_YEARS[0]}-{VAL_YEARS[-1]}  "
          f"| test {TEST_YEARS[0]}-{TEST_YEARS[-1]}")
    print(f"Tasks  : {len(pending)} to download, {skipped} already on disk "
          f"(workers={MAX_WORKERS})\n")

    if not pending:
        print("Nothing to do — all files present.")
        return

    failures = []
    completed = 0
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {
            pool.submit(_download_with_retry, ds, req, out, lbl): lbl
            for ds, req, out, lbl in pending
        }
        for fut in as_completed(futures):
            result = fut.result()
            completed += 1
            _log(f"  ({completed}/{len(pending)}) {result}")
            if result.startswith("[FAIL]"):
                failures.append(result)

    sl_count = len(list(SL_DIR.glob("*.nc")))
    pl_count = len(list(PL_DIR.glob("*.nc")))
    print(f"\nDone.  Single-level: {sl_count} files  |  Pressure-level: {pl_count} files")
    if failures:
        print(f"\n{len(failures)} failure(s):")
        for f in failures:
            print(f"  {f}")


if __name__ == "__main__":
    main()