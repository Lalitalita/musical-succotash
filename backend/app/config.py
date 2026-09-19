"""Central application settings, sourced entirely from environment variables."""
from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    # --- Core ---
    app_name: str = "WebDesktop"
    environment: str = "production"
    secret_key: str = "change-me-in-env"
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = 60 * 12
    mfa_pending_ttl_minutes: int = 5

    # --- Database ---
    database_url: str = "postgresql+psycopg2://webdesktop:webdesktop@postgres:5432/webdesktop"

    # --- Redis (rate limiting / lockouts) ---
    redis_url: str = "redis://redis:6379/0"

    # --- Reverse proxy / trusted headers ---
    # Number of trusted reverse-proxy hops in front of this stack
    # (e.g. 2 = external Nginx TLS terminator + the frontend's internal Nginx).
    trusted_proxy_hops: int = 2

    # --- Admin / LAN restriction ---
    # Comma separated list of CIDRs allowed to reach admin endpoints,
    # in addition to standard RFC1918 / loopback / link-local ranges.
    admin_ip_whitelist: str = ""

    # --- Rate limiting ---
    login_max_attempts_per_window: int = 5
    login_window_seconds: int = 300
    lockout_base_seconds: int = 30
    lockout_max_seconds: int = 3600
    mfa_alert_failure_threshold: int = 3

    # --- SMTP alerting ---
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_use_tls: bool = True
    smtp_from: str = "alerts@webdesktop.local"
    smtp_alert_to: str = ""

    # --- GeoIP ---
    geoip_db_path: str = "/app/geoip/GeoLite2-City.mmdb"

    # --- User uploads (avatars, bookmark icons) ---
    uploads_dir: str = "/app/uploads"
    upload_max_bytes: int = 2 * 1024 * 1024

    # --- Browser proxy ---
    browser_proxy_timeout_seconds: int = 12
    browser_proxy_max_bytes: int = 3 * 1024 * 1024
    # Safety cap on a single streamed asset (images/video/audio/fonts), well
    # above any real file so it only ever bites a pathological response.
    browser_proxy_max_stream_bytes: int = 1024 * 1024 * 1024
    browser_proxy_user_agent: str = "Mozilla/5.0 (X11; Linux x86_64) WebDesktopTextProxy/1.0"
    # Hostnames the SSRF guard allows even though they resolve to a private
    # IP - for first-party services we ourselves deployed on the internal
    # network (e.g. "roundcube"), never for arbitrary user-supplied URLs.
    internal_proxy_allowlist: str = "roundcube"

    # --- Full-browser mode (Playwright), opt-in per tab ---
    full_browser_enabled: bool = True
    full_browser_max_sessions: int = 3
    full_browser_idle_timeout_seconds: int = 300
    full_browser_max_lifetime_seconds: int = 3600
    # Frame rate while the user is actively interacting (mouse/keyboard/nav
    # in the last full_browser_active_window_seconds).
    full_browser_frame_interval_ms: int = 350
    # Much slower frame rate the rest of the time - a screenshot every
    # 350ms whether anything moved or not is wasted CPU/bandwidth for a tab
    # just sitting open in the background.
    full_browser_idle_frame_interval_ms: int = 2000
    full_browser_active_window_seconds: float = 2.0

    # --- Bootstrap admin (first run only, ignored if any user exists) ---
    bootstrap_admin_username: str = "admin"
    bootstrap_admin_email: str = "admin@webdesktop.local"
    bootstrap_admin_password: str = ""

    # --- CORS (only relevant if frontend is served from a different origin) ---
    cors_allowed_origins: str = ""

    # --- File explorer: local per-user storage ---
    local_files_root: str = "/app/userfiles"

    # --- File explorer: SMB share (single shared household NAS share) ---
    smb_host: str = ""
    smb_port: int = 445
    smb_share: str = ""
    smb_username: str = ""
    smb_password: str = ""
    smb_domain: str = ""

    @property
    def admin_whitelist_list(self) -> List[str]:
        return [c.strip() for c in self.admin_ip_whitelist.split(",") if c.strip()]

    @property
    def cors_origins_list(self) -> List[str]:
        return [c.strip() for c in self.cors_allowed_origins.split(",") if c.strip()]

    @property
    def internal_proxy_allowlist_set(self) -> set:
        return {h.strip().lower() for h in self.internal_proxy_allowlist.split(",") if h.strip()}


@lru_cache
def get_settings() -> Settings:
    return Settings()
