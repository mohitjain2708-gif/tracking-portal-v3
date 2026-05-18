from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import auth, uploads, templates, jobs, shipments
from app.core.bootstrap import seed_test_users
from app.core.config import settings
from app.core.database import Base, SessionLocal, engine

Base.metadata.create_all(bind=engine)

app = FastAPI(title=settings.app_name)

cors_origins = settings.cors_origins_list or ["http://localhost:5173", "http://127.0.0.1:5173"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if "*" in cors_origins else cors_origins,
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
    settings.validate_runtime_settings()
    db = SessionLocal()
    try:
        seed_test_users(db)
    finally:
        db.close()


@app.get("/api/health")
def health():
    return {"status": "ok", "environment": settings.app_env}
