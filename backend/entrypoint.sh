#!/bin/sh
# Full-browser mode used to need a shared virtual display started here
# before the app itself; each full-mode tab now gets its own private Xvfb +
# x11vnc pair, launched and torn down dynamically by the backend itself
# (see app/full_browser.py) - so there is nothing left to bootstrap here.
set -e
exec python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
