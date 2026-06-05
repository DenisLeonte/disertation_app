from __future__ import annotations

import json
import subprocess
import sys
import threading
from collections import deque
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[3]


class TrainingManager:
    def __init__(self):
        self.process: subprocess.Popen | None = None
        self.stdout_lines: deque[str] = deque(maxlen=1000)
        self._reader_thread: threading.Thread | None = None

    @property
    def is_running(self) -> bool:
        return self.process is not None and self.process.poll() is None

    @property
    def return_code(self) -> int | None:
        if self.process is None:
            return None
        return self.process.poll()

    def start(self, config: dict | None = None) -> None:
        if self.is_running:
            raise RuntimeError("Training is already running")

        stop_flag = PROJECT_ROOT / "stop_training.flag"
        if stop_flag.exists():
            stop_flag.unlink()

        cmd = [sys.executable, str(PROJECT_ROOT / "main.py")]
        if config:
            config_path = PROJECT_ROOT / ".dashboard_run_config.json"
            config_path.write_text(json.dumps(config))
            cmd.extend(["--config", str(config_path)])

        self.stdout_lines.clear()
        self.process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            cwd=str(PROJECT_ROOT),
            bufsize=1,
        )
        self._reader_thread = threading.Thread(target=self._read_output, daemon=True)
        self._reader_thread.start()

    def stop(self, force: bool = False) -> None:
        if not self.is_running:
            return
        if force:
            self.process.kill()
        else:
            (PROJECT_ROOT / "stop_training.flag").write_text("stop")

    def get_output(self, last_n: int | None = None) -> list[str]:
        lines = list(self.stdout_lines)
        if last_n is not None:
            return lines[-last_n:]
        return lines

    def _read_output(self) -> None:
        try:
            for line in self.process.stdout:
                self.stdout_lines.append(line.rstrip('\n'))
        except (ValueError, OSError):
            pass


training_manager = TrainingManager()
