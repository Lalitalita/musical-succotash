"""SSRF-safe URL validation for the outbound text-mode browser proxy.

Every URL the backend is asked to fetch on the user's behalf -- including
every hop of a redirect chain -- must be re-validated. Without this, the
"remote browser" would be a trivial way to reach internal Docker services,
the cloud metadata endpoint, or anything else on the internal network.
"""
import ipaddress
import socket
from urllib.parse import urlparse

ALLOWED_SCHEMES = {"http", "https"}


class UnsafeUrlError(Exception):
    pass


def _is_blocked_ip(ip_str: str) -> bool:
    addr = ipaddress.ip_address(ip_str)
    return (
        addr.is_private
        or addr.is_loopback
        or addr.is_link_local
        or addr.is_multicast
        or addr.is_reserved
        or addr.is_unspecified
    )


def validate_url(url: str) -> str:
    """Raise UnsafeUrlError if the URL is malformed or resolves to a
    non-public address. Returns the normalized URL on success."""
    parsed = urlparse(url)
    if parsed.scheme not in ALLOWED_SCHEMES:
        raise UnsafeUrlError("Only http/https URLs are allowed.")
    if not parsed.hostname:
        raise UnsafeUrlError("Missing hostname.")
    if parsed.username or parsed.password:
        raise UnsafeUrlError("Credentials in URL are not allowed.")

    try:
        infos = socket.getaddrinfo(parsed.hostname, None)
    except socket.gaierror as exc:
        raise UnsafeUrlError(f"Could not resolve host: {exc}") from exc

    if not infos:
        raise UnsafeUrlError("Could not resolve host.")

    for family, _, _, _, sockaddr in infos:
        ip_str = sockaddr[0]
        try:
            if _is_blocked_ip(ip_str):
                raise UnsafeUrlError("Target address is not a public host.")
        except ValueError:
            raise UnsafeUrlError("Invalid resolved address.")

    return url
