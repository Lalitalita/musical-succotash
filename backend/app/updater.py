"""Self-update: checks GitHub for a newer commit on the deployed branch and,
on request, backs up the database + user files and rebuilds the stack.

Opt-in and only functional when docker-compose.selfupdate.yml has been
layered in (mounts /var/run/docker.sock and the real host project
directory into this container) - see README. Rebuilding this very
container from inside itself would kill the process running the update
partway through, so the actual work (backup, git pull, `docker compose up
-d --build`) runs in a short-lived SIBLING container we launch detached
via the Docker socket, which survives this backend container being
recreated.
"""
import json
import os
import subprocess
import threading
from datetime import datetime
from urllib.parse import urlparse

import httpx

from app.config import get_settings

settings = get_settings()

_lock = threading.Lock()
_running = False


def _status_path() -> str:
    os.makedirs(settings.update_backup_dir, exist_ok=True)
    return os.path.join(settings.update_backup_dir, "last_update_status.json")


def read_last_run() -> dict:
    try:
        with open(_status_path()) as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}


def _current_commit() -> str | None:
    if not settings.host_project_dir or not os.path.isdir(settings.host_project_dir):
        return None
    try:
        out = subprocess.run(
            ["git", "-C", settings.host_project_dir, "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            timeout=10,
            check=True,
        )
        return out.stdout.strip()
    except (subprocess.CalledProcessError, OSError):
        return None


def _latest_commit() -> str | None:
    if not settings.update_github_repo:
        return None
    try:
        resp = httpx.get(
            f"https://api.github.com/repos/{settings.update_github_repo}/commits/{settings.update_git_branch}",
            headers={"Accept": "application/vnd.github+json"},
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()["sha"]
    except (httpx.HTTPError, KeyError, ValueError, TypeError):
        return None


def is_available() -> bool:
    return bool(settings.self_update_enabled and settings.host_project_dir and settings.update_github_repo)


def get_status() -> dict:
    return {
        "enabled": is_available(),
        "repo": settings.update_github_repo,
        "branch": settings.update_git_branch,
        "current_commit": _current_commit(),
        "latest_commit": _latest_commit(),
        "running": _running,
        "last_run": read_last_run(),
    }


def _pg_user_db() -> tuple[str, str]:
    url = urlparse(settings.database_url.replace("postgresql+psycopg2://", "postgresql://"))
    return url.username or "webdesktop", (url.path or "/webdesktop").lstrip("/")


def _run_detached_updater() -> None:
    global _running
    pg_user, pg_db = _pg_user_db()
    script = (
        "set -e; "
        "apk add --no-cache git docker-cli-compose tar >/dev/null 2>&1 || true; "
        "trap 'echo \"{\\\"status\\\":\\\"error\\\",\\\"finished_at\\\":\\\"$(date -Iseconds)\\\"}\" "
        "> /data/backups/last_update_status.json' ERR; "
        "ts=$(date +%Y%m%d-%H%M%S); "
        f"cd '{settings.host_project_dir}'; "
        f"docker compose exec -T postgres pg_dump -U {pg_user} {pg_db} > /data/backups/db-$ts.sql; "
        "tar czf /data/backups/data-$ts.tar.gz -C /data uploads userfiles browser_state; "
        f"git fetch origin '{settings.update_git_branch}'; "
        f"git checkout '{settings.update_git_branch}'; "
        f"git pull origin '{settings.update_git_branch}'; "
        "docker compose up -d --build; "
        "echo \"{\\\"status\\\":\\\"success\\\",\\\"finished_at\\\":\\\"$(date -Iseconds)\\\",\\\"backup\\\":\\\"$ts\\\"}\" "
        "> /data/backups/last_update_status.json"
    )
    try:
        subprocess.run(
            [
                "docker",
                "run",
                "-d",
                "--rm",
                "--name",
                "webdesktop-updater",
                "-v",
                "/var/run/docker.sock:/var/run/docker.sock",
                "-v",
                f"{settings.host_project_dir}:{settings.host_project_dir}",
                "-v",
                "backend-uploads:/data/uploads:ro",
                "-v",
                "backend-userfiles:/data/userfiles:ro",
                "-v",
                "backend-browser-state:/data/browser_state:ro",
                "-v",
                "backend-backups:/data/backups",
                "docker:cli",
                "sh",
                "-c",
                script,
            ],
            check=True,
            timeout=30,
        )
    except (subprocess.CalledProcessError, OSError, subprocess.TimeoutExpired) as exc:
        with open(_status_path(), "w") as f:
            json.dump({"status": "error", "finished_at": datetime.utcnow().isoformat(), "error": str(exc)}, f)
    finally:
        _running = False


def start_update() -> bool:
    global _running
    if not is_available():
        return False
    with _lock:
        if _running:
            return False
        _running = True
    with open(_status_path(), "w") as f:
        json.dump({"status": "running", "started_at": datetime.utcnow().isoformat()}, f)
    threading.Thread(target=_run_detached_updater, daemon=True).start()
    return True
