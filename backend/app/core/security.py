from datetime import datetime, timedelta, timezone
from jose import jwt
from passlib.context import CryptContext
from fastapi import HTTPException
from app.core.config import settings

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
ALGORITHM = "HS256"
MAX_PASSWORD_BYTES = 1024

def _validate_password_length(password: str) -> None:
    if password is None:
        raise HTTPException(status_code=400, detail="Password is required")
    if len(password.encode("utf-8")) > MAX_PASSWORD_BYTES:
        raise HTTPException(status_code=400, detail="Password is too long.")

def hash_password(password: str) -> str:
    _validate_password_length(password)
    return pwd_context.hash(password)

def verify_password(password: str, password_hash: str) -> bool:
    _validate_password_length(password)
    return pwd_context.verify(password, password_hash)

def create_access_token(subject: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": subject, "exp": expire}
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)
