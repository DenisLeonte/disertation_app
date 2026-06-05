from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

from dashboard.api.schemas import (
    ClustersResponse,
    DiversityResponse,
    LogRow,
    RegressionResponse,
    StatusResponse,
    SummaryResponse,
    TrajectoryResponse,
)
from dashboard.api.services.analysis import (
    best_ever_trajectory,
    champion_regression,
    diversity_collapse,
    duplicate_clusters,
    run_summary,
)
from dashboard.api.services.log_parser import filter_rows, get_log_data

router = APIRouter(prefix="/api")

PROJECT_ROOT = Path(__file__).resolve().parents[3]
LOG_PATH = PROJECT_ROOT / "training_log.csv"
CHECKPOINT_PATH = PROJECT_ROOT / "evolution_checkpoint.pth"
BEST_MODEL_PATH = PROJECT_ROOT / "best_model.pth"


def _load_or_404():
    data = get_log_data(LOG_PATH)
    if data is None:
        raise HTTPException(404, "No training log found or log is empty")
    return data


@router.get("/status", response_model=StatusResponse)
def get_status():
    has_log = LOG_PATH.exists()
    result = StatusResponse(
        has_log=has_log,
        has_checkpoint=CHECKPOINT_PATH.exists(),
        has_best_model=BEST_MODEL_PATH.exists(),
    )
    if has_log:
        data = get_log_data(LOG_PATH)
        if data:
            rows, gens = data
            result.n_generations = len(gens)
            best_row = min(rows, key=lambda r: r['val_loss'])
            result.best_ever = best_row['val_loss']
            pop_sizes = {len(v) for v in gens.values()}
            result.pop_size = next(iter(pop_sizes)) if len(pop_sizes) == 1 else max(pop_sizes)
    return result


@router.get("/log", response_model=list[LogRow])
def get_log(
    from_gen: int | None = Query(None, description="Filter: minimum generation"),
    to_gen: int | None = Query(None, description="Filter: maximum generation"),
):
    rows, _ = _load_or_404()
    filtered = filter_rows(rows, from_gen=from_gen, to_gen=to_gen)
    return filtered


@router.get("/log/latest", response_model=list[LogRow])
def get_log_latest():
    rows, gens = _load_or_404()
    last_gen = max(gens)
    return gens[last_gen]


@router.get("/analysis/summary", response_model=SummaryResponse)
def get_summary():
    rows, gens = _load_or_404()
    return run_summary(rows, gens)


@router.get("/analysis/trajectory", response_model=TrajectoryResponse)
def get_trajectory():
    _, gens = _load_or_404()
    return best_ever_trajectory(gens)


@router.get("/analysis/champion-regression", response_model=RegressionResponse)
def get_champion_regression():
    _, gens = _load_or_404()
    return champion_regression(gens)


@router.get("/analysis/diversity", response_model=DiversityResponse)
def get_diversity():
    _, gens = _load_or_404()
    return diversity_collapse(gens)


@router.get("/analysis/clusters", response_model=ClustersResponse)
def get_clusters():
    _, gens = _load_or_404()
    return duplicate_clusters(gens)
