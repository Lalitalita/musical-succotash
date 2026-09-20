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
# xvfb: full-browser mode launches Chromium in normal (headed) mode into
# this virtual display instead of --headless - several sites (Google's
# login flow being the most notorious) actively fingerprint headless
# Chrome and refuse to sign in on it, and a handful of internal differences
# between headless and headed rendering remain even with "the new headless
# mode". Nothing is ever actually displayed anywhere; it's a framebuffer
# that only exists so Chromium believes it has a real screen. Started
# directly by entrypoint.sh, not via the xvfb-run wrapper: xvfb-run's
# "wait for Xvfb to signal it's ready" handshake relies on a SIGUSR1
# reaching its parent process, which is unreliable enough inside Docker's
# process namespace that it can hang forever with no error at all.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libxml2 libxslt1.1 curl git docker.io xvfb \
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
