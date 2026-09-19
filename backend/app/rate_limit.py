"""Redis-backed rate limiting and progressive account/IP lockout.

Two independent counters are tracked per login attempt: one keyed by
source IP, one keyed by target username. Either one tripping is enough to
reject the request. On top of the sliding-window counters, a *progressive*
lockout is applied: every additional failure doubles the lockout duration
(capped), so repeat offenders get slower rather than just "blocked/not
blocked".
"""
from dataclasses import dataclass

import redis

from app.config import get_settings

settings = get_settings()
_redis = redis.Redis.from_url(settings.redis_url, decode_responses=True)


def get_redis() -> redis.Redis:
    return _redis


@dataclass
class LimitResult:
    allowed: bool
    retry_after_seconds: int = 0
    reason: str = ""


def _window_key(prefix: str, key: str) -> str:
    return f"rl:{prefix}:{key}"


def _lock_key(prefix: str, key: str) -> str:
    return f"lock:{prefix}:{key}"


def _fail_count_key(prefix: str, key: str) -> str:
    return f"fails:{prefix}:{key}"


def check_locked(prefix: str, key: str) -> LimitResult:
    ttl = _redis.ttl(_lock_key(prefix, key))
    if ttl and ttl > 0:
        return LimitResult(False, ttl, "locked")
    return LimitResult(True)


def register_window_hit(prefix: str, key: str) -> LimitResult:
    """Sliding-window style counter: N attempts allowed per window."""
    rkey = _window_key(prefix, key)
    pipe = _redis.pipeline()
    pipe.incr(rkey, 1)
    pipe.expire(rkey, settings.login_window_seconds, nx=True)
    count, _ = pipe.execute()
    if count > settings.login_max_attempts_per_window:
        ttl = _redis.ttl(rkey) or settings.login_window_seconds
        return LimitResult(False, ttl, "rate_limited")
    return LimitResult(True)


def register_failure_and_maybe_lock(prefix: str, key: str) -> LimitResult:
    """Increment the consecutive-failure counter and apply progressive lockout."""
    fkey = _fail_count_key(prefix, key)
    fails = _redis.incr(fkey, 1)
    _redis.expire(fkey, settings.lockout_max_seconds)

    if fails < 3:
        return LimitResult(True)

    lockout_seconds = min(
        settings.lockout_base_seconds * (2 ** (fails - 3)),
        settings.lockout_max_seconds,
    )
    _redis.setex(_lock_key(prefix, key), lockout_seconds, "1")
    return LimitResult(False, lockout_seconds, "locked")


def reset_failures(prefix: str, key: str) -> None:
    _redis.delete(_fail_count_key(prefix, key))
    _redis.delete(_lock_key(prefix, key))


def consecutive_failures(prefix: str, key: str) -> int:
    val = _redis.get(_fail_count_key(prefix, key))
    return int(val) if val else 0


def list_active_locks() -> list[dict]:
    """Scan for every currently-active lockout, for the security dashboard."""
    locks = []
    for raw_key in _redis.scan_iter(match="lock:*:*", count=100):
        ttl = _redis.ttl(raw_key)
        if not ttl or ttl <= 0:
            continue
        _, scope, key = raw_key.split(":", 2)
        locks.append({"scope": scope, "key": key, "retry_after_seconds": ttl})
    return sorted(locks, key=lambda l: -l["retry_after_seconds"])


def unlock(prefix: str, key: str) -> bool:
    """Clear every lock/failure-count/rate-window key for one scope+key
    (e.g. prefix="ip", key="203.0.113.5"). Returns True if anything was
    actually removed. Used by `python -m app.cli unlock` when someone is
    locked out and can't reach the (login-gated) security dashboard."""
    deleted = _redis.delete(_lock_key(prefix, key), _fail_count_key(prefix, key), _window_key(prefix, key))
    return deleted > 0


def unlock_all() -> int:
    """Clear every lock/failure/rate-window key in use by this app.
    Returns how many keys were removed."""
    total = 0
    for pattern in ("lock:*", "fails:*", "rl:*"):
        keys = list(_redis.scan_iter(match=pattern, count=200))
        if keys:
            total += _redis.delete(*keys)
    return total
