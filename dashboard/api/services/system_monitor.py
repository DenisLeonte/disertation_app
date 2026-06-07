from __future__ import annotations

import subprocess
import time
from dataclasses import dataclass, field


@dataclass
class GpuInfo:
    index: int
    name: str
    utilization: float | None = None
    memory_used_mb: float | None = None
    memory_total_mb: float | None = None
    temperature_c: float | None = None
    backend: str = "unknown"


@dataclass
class SystemMetrics:
    cpu_percent_per_core: list[float] = field(default_factory=list)
    cpu_percent_total: float = 0.0
    cpu_freq_mhz: float | None = None
    cpu_cores_physical: int = 0
    cpu_cores_logical: int = 0
    memory_used_gb: float = 0.0
    memory_total_gb: float = 0.0
    memory_percent: float = 0.0
    disk_used_gb: float = 0.0
    disk_total_gb: float = 0.0
    gpus: list[GpuInfo] = field(default_factory=list)
    gpu_backend: str = "none"
    timestamp: float = 0.0


def collect_metrics() -> SystemMetrics:
    import psutil
    import shutil

    cpu_per_core = psutil.cpu_percent(interval=0.3, percpu=True)
    cpu_total = sum(cpu_per_core) / len(cpu_per_core) if cpu_per_core else 0.0
    freq = psutil.cpu_freq()
    mem = psutil.virtual_memory()
    disk = shutil.disk_usage('/')

    metrics = SystemMetrics(
        cpu_percent_per_core=cpu_per_core,
        cpu_percent_total=round(cpu_total, 1),
        cpu_freq_mhz=round(freq.current, 0) if freq else None,
        cpu_cores_physical=psutil.cpu_count(logical=False) or 0,
        cpu_cores_logical=psutil.cpu_count(logical=True) or 0,
        memory_used_gb=round(mem.used / 1e9, 2),
        memory_total_gb=round(mem.total / 1e9, 2),
        memory_percent=mem.percent,
        disk_used_gb=round(disk.used / 1e9, 2),
        disk_total_gb=round(disk.total / 1e9, 2),
        timestamp=time.time(),
    )

    metrics.gpus, metrics.gpu_backend = _detect_gpus()
    return metrics


def _detect_gpus() -> tuple[list[GpuInfo], str]:
    gpus = _try_nvidia_smi()
    if gpus:
        return gpus, "cuda"

    gpus = _try_rocm_smi()
    if gpus:
        return gpus, "rocm"

    gpus = _try_directml()
    if gpus:
        return gpus, "directml"

    return [], "none"


def _try_nvidia_smi() -> list[GpuInfo]:
    try:
        result = subprocess.run(
            ['nvidia-smi', '--query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu',
             '--format=csv,noheader,nounits'],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode != 0:
            return []
        gpus = []
        for line in result.stdout.strip().split('\n'):
            if not line.strip():
                continue
            parts = [p.strip() for p in line.split(',')]
            gpus.append(GpuInfo(
                index=int(parts[0]),
                name=parts[1],
                utilization=float(parts[2]) if parts[2] != '[N/A]' else None,
                memory_used_mb=float(parts[3]) if parts[3] != '[N/A]' else None,
                memory_total_mb=float(parts[4]) if parts[4] != '[N/A]' else None,
                temperature_c=float(parts[5]) if parts[5] != '[N/A]' else None,
                backend="cuda",
            ))
        return gpus
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return []


def _try_rocm_smi() -> list[GpuInfo]:
    try:
        result = subprocess.run(
            ['rocm-smi', '--showuse', '--showmeminfo', 'vram', '--showtemp', '--csv'],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode != 0:
            return []
        gpus = []
        lines = result.stdout.strip().split('\n')
        for i, line in enumerate(lines[1:]):
            parts = [p.strip() for p in line.split(',')]
            if len(parts) < 2:
                continue
            gpus.append(GpuInfo(
                index=i,
                name=parts[0] if parts[0] else f"GPU {i}",
                utilization=_safe_float(parts[1]) if len(parts) > 1 else None,
                temperature_c=_safe_float(parts[-1]) if len(parts) > 2 else None,
                backend="rocm",
            ))
        return gpus
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return []


def _try_directml() -> list[GpuInfo]:
    try:
        import torch_directml
        n = torch_directml.device_count()
        return [
            GpuInfo(
                index=i,
                name=torch_directml.device_name(i),
                backend="directml",
            )
            for i in range(n)
        ]
    except (ImportError, Exception):
        return []


def _safe_float(s: str) -> float | None:
    try:
        return float(s)
    except (ValueError, TypeError):
        return None
