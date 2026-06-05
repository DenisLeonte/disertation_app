from __future__ import annotations

from pydantic import BaseModel


class LogRow(BaseModel):
    generation: int
    individual: int
    val_loss: float
    n_params: int
    n_layers: int
    architecture: str
    train_loss: float | None = None
    best_ever: float | None = None
    is_champion: bool | None = None
    mutation_type: str | None = None
    parent_idx: int | None = None


class StatusResponse(BaseModel):
    has_log: bool
    has_checkpoint: bool
    has_best_model: bool
    n_generations: int | None = None
    best_ever: float | None = None
    pop_size: int | None = None


class SummaryResponse(BaseModel):
    n_generations: int
    gen_range: list[int]
    pop_size: int | list[int]
    pop_size_variable: bool
    total_rows: int
    log_schema: str
    unique_archs: int


class TrajectoryPoint(BaseModel):
    generation: int
    best_so_far: float
    gen_best_val: float
    is_new_best: bool


class TrajectoryResponse(BaseModel):
    best_ever: float
    best_gen: int
    best_indiv: int
    stagnation: int
    points: list[TrajectoryPoint]


class RegressionEvent(BaseModel):
    prev_gen: int
    cur_gen: int
    prev_val: float
    cur_val: float
    delta: float
    architecture: str


class RegressionResponse(BaseModel):
    count: int
    flagged: list[RegressionEvent]


class DiversityGeneration(BaseModel):
    generation: int
    unique_archs: int
    top_cluster_size: int
    pop_size: int
    top_cluster_frac: float
    is_monoculture: bool


class CollapseEvent(BaseModel):
    start_gen: int
    end_gen: int
    length: int


class DiversityResponse(BaseModel):
    per_generation: list[DiversityGeneration]
    collapse_events: list[CollapseEvent]


class ClusterEntry(BaseModel):
    architecture: str
    count: int
    spread: float
    min_val: float
    max_val: float


class ClustersResponse(BaseModel):
    final_generation: int
    clusters: list[ClusterEntry]
