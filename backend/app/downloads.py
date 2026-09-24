"""Server-side downloads: the backend fetches a URL itself and saves it
straight into the user's Downloads folder (see app/local_storage.py) -
useful for pulling a large file down without it ever having to round-trip
through the client's own connection first (a slow phone link, wanting it
to land directly in the file explorer instead of the browser's download
folder, etc).

Every URL goes through the exact same SSRF guard as the text-mode browser
proxy (app/browser_ssrf.py), re-checked after following redirects, so this
can't be used to reach internal services any more than the browser can.
"""
import asyncio
import logging
from urllib.parse import urlparse

import httpx

from app.browser_ssrf import UnsafeUrlError, validate_url
from app.database import SessionLocal
from app.local_storage import downloads_dir, unique_path
from app.models import Download, DownloadStatus

logger = logging.getLogger("webdesktop.downloads")

# Safety cap so one runaway download can't fill the disk - well above any
# real personal file, only ever bites a pathological/malicious response.
_MAX_BYTES = 5 * 1024 * 1024 * 1024
_CHUNK_SIZE = 256 * 1024
# Progress is written to the DB at most this often - writing on every 256KB
# chunk would mean thousands of UPDATEs for a large file, for no benefit
# since the frontend only polls the list every couple of seconds anyway.
_PROGRESS_STEP_BYTES = 1024 * 1024


def _filename_from_response(resp: httpx.Response, fallback_url: str) -> str:
    cd = resp.headers.get("content-disposition", "")
    if "filename=" in cd:
        name = cd.split("filename=", 1)[1].strip().strip('"').strip("'").split(";")[0].strip()
        if name:
            return name
    path = urlparse(str(resp.url) or fallback_url).path
    return path.rsplit("/", 1)[-1] or "fichier"


class DownloadManager:
    def __init__(self) -> None:
        self._tasks: dict[str, asyncio.Task] = {}

    def start(self, download_id: str, user_id: str, url: str) -> None:
        self._tasks[download_id] = asyncio.create_task(self._run(download_id, user_id, url))

    def _set(self, db, download_id: str, **fields) -> None:
        db.query(Download).filter(Download.id == download_id).update(fields)
        db.commit()

    async def _run(self, download_id: str, user_id: str, url: str) -> None:
        db = SessionLocal()
        dest_path = None
        try:
            try:
                await asyncio.to_thread(validate_url, url)
            except UnsafeUrlError as exc:
                self._set(db, download_id, status=DownloadStatus.FAILED, error=str(exc)[:500])
                return

            downloaded = 0
            last_reported = 0
            async with httpx.AsyncClient(follow_redirects=True, timeout=30) as client:
                async with client.stream("GET", url) as resp:
                    resp.raise_for_status()
                    # A redirect chain can land somewhere the ORIGINAL
                    # validate_url() call above never saw - re-check the
                    # final URL, same as the text-mode proxy does for its
                    # own redirect chains.
                    await asyncio.to_thread(validate_url, str(resp.url))

                    filename = _filename_from_response(resp, url)
                    dest_path = unique_path(downloads_dir(user_id), filename)
                    total = resp.headers.get("content-length")
                    total_bytes = int(total) if total and total.isdigit() else None
                    self._set(db, download_id, filename=dest_path.name, total_bytes=total_bytes)

                    def _open():
                        return open(dest_path, "wb")

                    f = await asyncio.to_thread(_open)
                    try:
                        async for chunk in resp.aiter_bytes(_CHUNK_SIZE):
                            await asyncio.to_thread(f.write, chunk)
                            downloaded += len(chunk)
                            if downloaded > _MAX_BYTES:
                                raise ValueError("Fichier trop volumineux (> 5 Go).")
                            if downloaded - last_reported >= _PROGRESS_STEP_BYTES:
                                last_reported = downloaded
                                self._set(db, download_id, downloaded_bytes=downloaded)
                    finally:
                        await asyncio.to_thread(f.close)

            self._set(db, download_id, status=DownloadStatus.DONE, downloaded_bytes=downloaded)
        except UnsafeUrlError as exc:
            if dest_path:
                dest_path.unlink(missing_ok=True)
            self._set(db, download_id, status=DownloadStatus.FAILED, error=str(exc)[:500])
        except Exception as exc:  # noqa: BLE001 - always report failure back, never leave "downloading" stuck
            if dest_path:
                dest_path.unlink(missing_ok=True)
            logger.exception("Download %s failed", download_id)
            self._set(db, download_id, status=DownloadStatus.FAILED, error=str(exc)[:500])
        finally:
            self._tasks.pop(download_id, None)
            db.close()


manager = DownloadManager()
