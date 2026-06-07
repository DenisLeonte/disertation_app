from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
from collections import deque
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[3]
PID_FILE = PROJECT_ROOT / "training.pid"


def _pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except (OSError, ProcessLookupError):
        return False


class TrainingManager:
    def __init__(self):
        self.process: subprocess.Popen | None = None
        self.stdout_lines: deque[str] = deque(maxlen=1000)
        self._reader_thread: threading.Thread | None = None

    @property
    def is_running(self) -> bool:
        if self.process is not None and self.process.poll() is None:
            return True
        return self.external_running

    @property
    def external_running(self) -> bool:
        if not PID_FILE.exists():
            return False
        try:
            pid = int(PID_FILE.read_text().strip())
            return _pid_alive(pid)
        except (ValueError, OSError):
            return False

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

        cmd = [sys.executable, "-u", str(PROJECT_ROOT / "main.py")]
        if config:
            config_path = PROJECT_ROOT / ".dashboard_run_config.json"
            config_path.write_text(json.dumps(config))
            cmd.extend(["--config", str(config_path)])

        self.stdout_lines.clear()
        env = {**os.environ, "PYTHONUNBUFFERED": "1"}
        self.process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            cwd=str(PROJECT_ROOT),
            bufsize=1,
            env=env,
        )
        self._reader_thread = threading.Thread(target=self._read_output, daemon=True)
        self._reader_thread.start()

    def stop(self, force: bool = False) -> None:
        if not self.is_running:
            return
        if force:
            if self.process is not None and self.process.poll() is None:
                self.process.kill()
            elif self.external_running:
                try:
                    pid = int(PID_FILE.read_text().strip())
                    os.kill(pid, 9)
                except (ValueError, OSError, ProcessLookupError):
                    pass
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
