from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from dashboard.api.services.training_manager import training_manager

router = APIRouter(prefix="/api/run")


class StartRequest(BaseModel):
    pop_size: int | None = None
    n_survivors: int | None = None
    max_generations: int | None = None
    patience: int | None = None
    epochs_per_gen: int | None = None
    batch_size: int | None = None
    lr: float | None = None


class RunStatus(BaseModel):
    running: bool
    return_code: int | None = None
    output_lines: int = 0


class OutputResponse(BaseModel):
    lines: list[str]


@router.post("/start", response_model=RunStatus)
def start_training(req: StartRequest):
    if training_manager.is_running:
        raise HTTPException(409, "Training is already running")
    config = {k: v for k, v in req.model_dump().items() if v is not None}
    training_manager.start(config if config else None)
    return RunStatus(
        running=True,
        output_lines=len(training_manager.stdout_lines),
    )


@router.post("/stop", response_model=RunStatus)
def stop_training(force: bool = False):
    if not training_manager.is_running:
        raise HTTPException(409, "No training is running")
    training_manager.stop(force=force)
    return RunStatus(
        running=training_manager.is_running,
        return_code=training_manager.return_code,
        output_lines=len(training_manager.stdout_lines),
    )


@router.get("/status", response_model=RunStatus)
def run_status():
    return RunStatus(
        running=training_manager.is_running,
        return_code=training_manager.return_code,
        output_lines=len(training_manager.stdout_lines),
    )


@router.get("/output", response_model=OutputResponse)
def run_output(last_n: int | None = None):
    return OutputResponse(lines=training_manager.get_output(last_n))
