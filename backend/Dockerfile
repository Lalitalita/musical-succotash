# Pinned to bookworm (Debian 12), not the floating "slim" tag: Playwright's
# `--with-deps` only knows how to map a handful of specific distros to their
# system package lists (bookworm is one), and breaks on newer ones like
# trixie (Debian 13) that it doesn't recognize yet - it falls back to a
# guess that references packages renamed/removed on the real distro.
FROM python:3.12-slim-bookworm

# git + docker.io (Docker CLI only, no daemon) are here for the opt-in
# self-update feature (see app/updater.py) - harmless if unused, since it
# only does anything when the Docker socket is actually mounted in
# (docker-compose.selfupdate.yml).
# xvfb + x11vnc: full-browser mode gives every open tab its own private
# virtual display (Xvfb) with a real, headed Chromium attached to it
# (several sites, Google's login flow being the most notorious, actively
# fingerprint headless Chrome and refuse to sign in on it) and streams that
# display to the client over VNC (x11vnc) - see app/full_browser.py and
# routers/full_browser.py. Both are launched dynamically per tab by the
# backend itself, not started here; nothing is ever actually displayed
# anywhere, and x11vnc only ever binds to localhost, never leaving the
# container except through the backend's own authenticated WebSocket.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libxml2 libxslt1.1 curl git docker.io xvfb x11vnc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Full-browser mode (Playwright + Chromium): only pulled in for sites that
# genuinely need JavaScript, opted into per-tab from the desktop. This is
# the heaviest part of the image - `--with-deps` installs the many system
# libraries Chromium needs via apt.
RUN playwright install --with-deps chromium

COPY app ./app
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV PYTHONUNBUFFERED=1

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
    CMD curl -fs http://localhost:8000/api/health || exit 1

CMD ["/entrypoint.sh"]
