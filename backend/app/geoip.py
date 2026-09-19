"""Best-effort local GeoIP lookups using a MaxMind GeoLite2 database.

The .mmdb file is NOT bundled (MaxMind's license forbids redistribution).
Download GeoLite2-City.mmdb from https://www.maxmind.com/en/geolite2/signup
and mount it at the path configured by GEOIP_DB_PATH (see docker-compose.yml
and .env.example). If the file is missing, lookups simply return unknowns
instead of failing the request.
"""
import ipaddress
import threading
from typing import Optional, Tuple

import geoip2.database
import geoip2.errors

from app.config import get_settings

settings = get_settings()

_reader = None
_reader_lock = threading.Lock()
_load_attempted = False


def _get_reader():
    global _reader, _load_attempted
    if _reader is not None or _load_attempted:
        return _reader
    with _reader_lock:
        if not _load_attempted:
            _load_attempted = True
            try:
                _reader = geoip2.database.Reader(settings.geoip_db_path)
            except (FileNotFoundError, OSError):
                _reader = None
    return _reader


def lookup(ip: str) -> Tuple[Optional[str], Optional[str]]:
    """Return (country, city) for a public IP, or (None, None)."""
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return None, None

    if addr.is_private or addr.is_loopback or addr.is_link_local:
        return "Local", None

    reader = _get_reader()
    if reader is None:
        return None, None

    try:
        result = reader.city(ip)
        return result.country.name, result.city.name
    except (geoip2.errors.AddressNotFoundError, ValueError):
        return None, None
