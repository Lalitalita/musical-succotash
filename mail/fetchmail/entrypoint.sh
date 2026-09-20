#!/bin/sh
# fetchmail rereads its rc file only at startup, but the backend rewrites it
# whenever the user's mail accounts change (app/mail_config.py) - this loop
# notices the change and restarts fetchmail to pick it up, without needing
# any coordination from the backend beyond writing the shared file.
set -e

SRC=/etc/fetchmail-shared/fetchmailrc
DST="$HOME/.fetchmailrc"
LAST_HASH=""
FETCHMAIL_PID=""

mkdir -p "$HOME"

while true; do
  if [ -f "$SRC" ]; then
    HASH=$(md5sum "$SRC" | cut -d' ' -f1)
    if [ "$HASH" != "$LAST_HASH" ]; then
      echo "fetchmail config changed, reloading..."
      cp "$SRC" "$DST"
      chmod 600 "$DST"
      LAST_HASH="$HASH"

      if [ -n "$FETCHMAIL_PID" ] && kill -0 "$FETCHMAIL_PID" 2>/dev/null; then
        kill "$FETCHMAIL_PID" 2>/dev/null || true
        wait "$FETCHMAIL_PID" 2>/dev/null || true
      fi

      if [ -s "$DST" ] && grep -q "^poll " "$DST"; then
        fetchmail -f "$DST" --pidfile "$HOME/fetchmail.pid" --nodetach &
        FETCHMAIL_PID=$!
      fi
    fi
  fi
  sleep 30
done
