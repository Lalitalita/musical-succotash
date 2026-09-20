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
RUN apt-get update && apt-get install -y --no-install-recommends \
        libxml2 libxslt1.1 curl git docker.io \
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

ENV PYTHONUNBUFFERED=1

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
    CMD curl -fs http://localhost:8000/api/health || exit 1

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
