#!/bin/sh
# Starts a virtual X display for full-browser mode's headed Chromium, then
# runs the backend. Deliberately NOT using xvfb-run: its readiness handshake
# (parent process blocks waiting for Xvfb to send it SIGUSR1) depends on
# signal delivery that is unreliable inside Docker's process namespace and
# can hang forever with no error at all. Polling for the actual X11 socket
# file is simpler and can't hang past the timeout below.
set -e

Xvfb :99 -screen 0 1280x800x24 -ac -nolisten tcp >/var/log/xvfb.log 2>&1 &

i=0
while [ ! -e /tmp/.X11-unix/X99 ] && [ "$i" -lt 100 ]; do
    i=$((i + 1))
    sleep 0.1
done
if [ ! -e /tmp/.X11-unix/X99 ]; then
    echo "entrypoint: Xvfb did not start within 10s, see /var/log/xvfb.log" >&2
    cat /var/log/xvfb.log >&2 || true
    exit 1
fi

export DISPLAY=:99
exec python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
