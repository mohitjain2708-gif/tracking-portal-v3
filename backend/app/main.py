import importlib.util
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import auth, uploads, templates, jobs
from app.core.bootstrap import seed_test_users
from app.core.config import settings
from app.core.database import Base, SessionLocal, engine

BASE_DIR = Path(__file__).resolve().parent
ROUTES_DIR = BASE_DIR / "api" / "routes"
SHIPMENTS_FILE = ROUTES_DIR / "shipments.py"

if not SHIPMENTS_FILE.exists():
    raise RuntimeError(f"Shipments module file not found: {SHIPMENTS_FILE}")

spec = importlib.util.spec_from_file_location("shipments_dynamic", str(SHIPMENTS_FILE))
shipments = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(shipments)

Base.metadata.create_all(bind=engine)

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(uploads.router, prefix="/api/uploads", tags=["uploads"])
app.include_router(templates.router, prefix="/api/templates", tags=["templates"])
app.include_router(jobs.router, prefix="/api/jobs", tags=["jobs"])
app.include_router(shipments.router, prefix="/api/shipments", tags=["shipments"])


@app.on_event("startup")
def startup_bootstrap():
    db = SessionLocal()
    try:
        seed_test_users(db)
    finally:
        db.close()


@app.get("/api/health")
def health():
    return {"status": "ok", "environment": settings.app_env}
