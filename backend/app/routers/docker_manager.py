"""Docker control panel: admin+LAN-gated, shells out to the `docker` CLI
(already installed in this image for the self-update feature - see the
Dockerfile) against the Docker socket, which docker-compose.yml mounts into
this container by default (see its `backend` service's `volumes:`). If
`docker version` still fails here, it's almost always one of: (1) the
container hasn't been recreated since pulling this version (the socket
mount is new - `docker compose up -d --build` picks it up), or (2) the
HOST's Docker daemon uses rootless mode or UID-remapping, in which case
this container's root doesn't map to the host's socket owner and the
mount's permissions block it - run this project's own Docker normally
(no userns-remap) for Terminal/Docker to work out of the box.

WARNING (see the README's "Terminal et Docker" section): mounting the
Docker socket gives whoever can reach these endpoints root-equivalent
control of the HOST, not just this container - start/stop/restart/logs for
ANY container on the machine, this one included. Gated the same way every
other high-privilege endpoint in this app is (admin + LAN-only) - there is
no separate opt-in flag for it, that trade-off was made deliberately (see
docker-compose.yml's comment on the mount).
"""
import asyncio
import json
import re

from fastapi import APIRouter, Depends, HTTPException, status

from app.deps import get_current_admin, require_lan_or_whitelisted
from app.models import User

router = APIRouter(prefix="/api/admin/docker", tags=["admin-docker"])

# Real Docker container/image name charset - validated before ever going
# into a subprocess argv (never a shell, so injection isn't actually
# possible here either way, but a clear 400 beats a confusing Docker CLI
# error for a typo'd name).
_NAME_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$")


def _validate_name(name: str) -> str:
    if not _NAME_RE.match(name):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nom de conteneur invalide.")
    return name


async def _run(*args: str, timeout: float = 15.0) -> tuple[int, str, str]:
    try:
        proc = await asyncio.create_subprocess_exec(
            "docker", *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except FileNotFoundError:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Le CLI docker est introuvable dans ce conteneur.")
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        raise HTTPException(status.HTTP_504_GATEWAY_TIMEOUT, "Docker n'a pas répondu à temps.")
    return proc.returncode, stdout.decode("utf-8", "replace"), stderr.decode("utf-8", "replace")


@router.get("/status")
async def docker_status(user: User = Depends(get_current_admin), _ip: str = Depends(require_lan_or_whitelisted)):
    code, out, _err = await _run("version", "--format", "{{.Server.Version}}", timeout=5)
    return {"available": code == 0, "server_version": out.strip() if code == 0 else None}


@router.get("/containers")
async def list_containers(user: User = Depends(get_current_admin), _ip: str = Depends(require_lan_or_whitelisted)):
    code, out, err = await _run("ps", "-a", "--format", "{{json .}}", timeout=10)
    if code != 0:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Docker n'est pas accessible depuis ce conteneur. Si le conteneur backend n'a pas été "
            "recréé depuis la mise à jour (docker compose up -d --build), c'est probablement ça. "
            "Sinon, vérifiez que le démon Docker de l'hôte n'utilise pas le mode rootless / "
            "userns-remap (voir le README) : " + (err.strip()[:300] or "erreur inconnue"),
        )
    containers = []
    for line in out.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            containers.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return containers


@router.get("/containers/{name}/logs")
async def container_logs(
    name: str,
    tail: int = 300,
    user: User = Depends(get_current_admin),
    _ip: str = Depends(require_lan_or_whitelisted),
):
    _validate_name(name)
    tail = max(1, min(tail, 2000))
    code, out, err = await _run("logs", "--tail", str(tail), "--timestamps", name, timeout=15)
    if code != 0:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, err.strip()[:1000] or "Erreur Docker.")
    # Cap response size for a very chatty container - this is a quick log
    # tail for troubleshooting, not a log aggregator.
    return {"logs": out[-200_000:]}


@router.get("/containers/{name}/stats")
async def container_stats(
    name: str, user: User = Depends(get_current_admin), _ip: str = Depends(require_lan_or_whitelisted)
):
    _validate_name(name)
    code, out, err = await _run("stats", "--no-stream", "--format", "{{json .}}", name, timeout=10)
    if code != 0:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, err.strip()[:500] or "Erreur Docker.")
    first_line = out.strip().splitlines()[0] if out.strip() else "{}"
    try:
        return json.loads(first_line)
    except json.JSONDecodeError:
        return {}


@router.post("/containers/{name}/start")
async def start_container(
    name: str, user: User = Depends(get_current_admin), _ip: str = Depends(require_lan_or_whitelisted)
):
    _validate_name(name)
    code, _out, err = await _run("start", name, timeout=30)
    if code != 0:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, err.strip()[:500] or "Erreur Docker.")
    return {"ok": True}


@router.post("/containers/{name}/stop")
async def stop_container(
    name: str, user: User = Depends(get_current_admin), _ip: str = Depends(require_lan_or_whitelisted)
):
    _validate_name(name)
    code, _out, err = await _run("stop", name, timeout=30)
    if code != 0:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, err.strip()[:500] or "Erreur Docker.")
    return {"ok": True}


@router.post("/containers/{name}/restart")
async def restart_container(
    name: str, user: User = Depends(get_current_admin), _ip: str = Depends(require_lan_or_whitelisted)
):
    _validate_name(name)
    code, _out, err = await _run("restart", name, timeout=30)
    if code != 0:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, err.strip()[:500] or "Erreur Docker.")
    return {"ok": True}
