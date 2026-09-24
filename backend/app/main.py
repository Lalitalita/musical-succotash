import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.full_browser import manager as full_browser_manager
from app.init_db import init_db
from app.routers import (
    admin,
    admin_update,
    admin_users,
    auth,
    bookmarks,
    browser_proxy,
    desktop,
    diagnostics,
    events,
    files,
    full_browser,
    security,
    uploads,
)

logging.basicConfig(level=logging.INFO)
settings = get_settings()

app = FastAPI(title=settings.app_name, docs_url=None, redoc_url=None)

if settings.cors_origins_list:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


@app.on_event("startup")
async def on_startup():
    init_db()
    await full_browser_manager.start()


@app.on_event("shutdown")
async def on_shutdown():
    await full_browser_manager.stop()
    browser_proxy.close_http_client()


@app.get("/api/health")
def health():
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(admin_users.router)
app.include_router(browser_proxy.router)
app.include_router(bookmarks.router)
app.include_router(desktop.router)
app.include_router(uploads.router)
app.include_router(events.router)
app.include_router(full_browser.router)
app.include_router(files.router)
app.include_router(diagnostics.router)
app.include_router(admin_update.router)
app.include_router(security.router)
