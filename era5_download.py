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


def download_single_level(year: int, month: str, client: cdsapi.Client) -> None:
    """Download single-level surface variables for one year-month."""
    out = SL_DIR / f"era5_sl_{year}_{month}.nc"
    if out.exists():
        print(f"  [skip] {out.name} already exists")
        return
    print(f"  Downloading single-level {year}-{month} …")
    client.retrieve(
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
        str(out),
    )
    _unzip_if_needed(out)
    print(f"  Saved -> {out}")


def download_pressure_level(year: int, month: str, client: cdsapi.Client) -> None:
    """Download upper-atmosphere pressure-level variables for one year-month."""
    out = PL_DIR / f"era5_pl_{year}_{month}.nc"
    if out.exists():
        print(f"  [skip] {out.name} already exists")
        return
    print(f"  Downloading pressure-level {year}-{month} …")
    client.retrieve(
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
        str(out),
    )
    _unzip_if_needed(out)
    print(f"  Saved -> {out}")


def main():
    SL_DIR.mkdir(parents=True, exist_ok=True)
    PL_DIR.mkdir(parents=True, exist_ok=True)

    client = cdsapi.Client()

    print(f"ERA5 download — Rome, Italy  |  {len(ALL_YEARS)} years")
    print(f"Region : N={AREA[0]}  W={AREA[1]}  S={AREA[2]}  E={AREA[3]}")
    print(f"Time   : daily snapshot at {TIME} UTC")
    print(f"Split  : train {TRAIN_YEARS[0]}-{TRAIN_YEARS[-1]}  "
          f"| val {VAL_YEARS[0]}-{VAL_YEARS[-1]}  "
          f"| test {TEST_YEARS[0]}-{TEST_YEARS[-1]}\n")

    for year in ALL_YEARS:
        for month in MONTHS:
            print(f"── {year}-{month} " + "─" * 36)
            download_single_level(year, month, client)
            download_pressure_level(year, month, client)

    sl_count = len(list(SL_DIR.glob("*.nc")))
    pl_count = len(list(PL_DIR.glob("*.nc")))
    print(f"\nDone.  Single-level: {sl_count} files  |  Pressure-level: {pl_count} files")


if __name__ == "__main__":
    main()