from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from analyze_log import load_log, by_generation


def _clean_row(row: dict) -> dict:
    return {k: (None if v == '' else v) for k, v in row.items()}


def get_log_data(log_path: Path) -> tuple[list[dict], dict[int, list[dict]]] | None:
    if not log_path.exists():
        return None
    rows = load_log(log_path)
    if not rows:
        return None
    rows = [_clean_row(r) for r in rows]
    return rows, by_generation(rows)


def filter_rows(rows: list[dict], from_gen: int | None = None,
                to_gen: int | None = None) -> list[dict]:
    filtered = rows
    if from_gen is not None:
        filtered = [r for r in filtered if r['generation'] >= from_gen]
    if to_gen is not None:
        filtered = [r for r in filtered if r['generation'] <= to_gen]
    return filtered
