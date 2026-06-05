from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from analyze_log import (
    run_summary as _run_summary,
    best_ever_trajectory as _best_ever_trajectory,
    champion_regression as _champion_regression,
    diversity_collapse as _diversity_collapse,
    duplicate_clusters as _duplicate_clusters,
)


def run_summary(rows: list[dict], gens: dict[int, list[dict]]) -> dict:
    result = _run_summary(rows, gens, verbose=False)
    result['log_schema'] = result.pop('schema')
    return result


def best_ever_trajectory(gens: dict[int, list[dict]], patience: int = 10) -> dict:
    return _best_ever_trajectory(gens, patience=patience, verbose=False)


def champion_regression(gens: dict[int, list[dict]], threshold: float = 0.01) -> dict:
    return _champion_regression(gens, threshold=threshold, verbose=False)


def diversity_collapse(gens: dict[int, list[dict]]) -> dict:
    return _diversity_collapse(gens, verbose=False)


def duplicate_clusters(gens: dict[int, list[dict]]) -> dict:
    return _duplicate_clusters(gens, verbose=False)
