import logging
import time
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import OperationalError

from app.api.routes import auth, uploads, templates, jobs, shipments
from app.core.bootstrap import seed_test_users
from app.core.config import settings
from app.core.database import Base, SessionLocal, engine, is_database_available

logger = logging.getLogger(__name__)

DATABASE_UNAVAILABLE_MESSAGE = "The portal database is temporarily unavailable. Please try again shortly."


@asynccontextmanager
async def lifespan(app_instance: FastAPI):
    settings.validate_runtime_settings()
    try:
        Base.metadata.create_all(bind=engine)
        db = SessionLocal()
        try:
            seed_test_users(db)
        finally:
            db.close()
        app_instance.state.database_startup_error = ""
    except Exception as exc:
        app_instance.state.database_startup_error = str(exc)
        logger.exception("Database unavailable during application startup")
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.state.database_startup_error = ""

cors_origins = settings.cors_origins_list or ["http://localhost:5173", "http://127.0.0.1:5173"]

app.add_middleware(GZipMiddleware, minimum_size=1024)

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


@app.middleware("http")
async def apply_security_headers(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or uuid4().hex
    start = time.perf_counter()
    try:
        response = await call_next(request)
    except OperationalError:
        logger.warning(
            "Database unavailable while handling request",
            extra={"request_id": request_id, "path": request.url.path},
        )
        return JSONResponse(
            status_code=503,
            content={"detail": DATABASE_UNAVAILABLE_MESSAGE},
            headers={"X-Request-ID": request_id, "Retry-After": "30"},
        )
    except Exception:
        logger.exception("Unhandled API error", extra={"request_id": request_id, "path": request.url.path})
        return JSONResponse(
            status_code=500,
            content={"detail": "The service hit an unexpected problem. Please try again shortly."},
            headers={"X-Request-ID": request_id},
        )

    duration_ms = (time.perf_counter() - start) * 1000
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Process-Time-Ms"] = f"{duration_ms:.2f}"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    if request.url.path.startswith("/api/auth"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/api/health")
def health():
    database_ready, _database_error = is_database_available()
    if not database_ready:
        return JSONResponse(
            status_code=503,
            content={
                "status": "degraded",
                "environment": settings.app_env,
                "database": "unavailable",
                "detail": DATABASE_UNAVAILABLE_MESSAGE,
            },
            headers={"Retry-After": "30"},
        )
    return {"status": "ok", "environment": settings.app_env, "database": "ok"}
