#!/bin/sh
set -e

if [ -z "$SOCKS5_USER" ] || [ -z "$SOCKS5_PASSWORD" ]; then
    echo "entrypoint: SOCKS5_USER and SOCKS5_PASSWORD must both be set - refusing to start an open, unauthenticated proxy." >&2
    exit 1
fi

exec microsocks -p 1080 -u "$SOCKS5_USER" -P "$SOCKS5_PASSWORD"
