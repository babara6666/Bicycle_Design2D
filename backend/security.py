"""
security.py — JWT authentication, password hashing, role guards,
              and file-path whitelist validation for IBDS Bicycle2D.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated

import bcrypt as _bcrypt

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy.orm import Session

# ── JWT settings ──────────────────────────────────────────────────────────
# Secret and expiry are read lazily from config.settings so they can be
# overridden via the .env file / environment variables.
JWT_ALGORITHM: str = "HS256"


def _jwt_secret() -> str:
    from .config import settings

    return settings.jwt_secret


def _jwt_expire() -> int:
    from .config import settings

    return settings.jwt_expire_minutes


# ── OAuth2 bearer scheme ──────────────────────────────────────────────────
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


# ── Pydantic token models ─────────────────────────────────────────────────
class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str


class TokenPayload(BaseModel):
    sub: str  # username
    role: str
    exp: int | None = None


# ── Password helpers ──────────────────────────────────────────────────────


def hash_password(plain: str) -> str:
    return _bcrypt.hashpw(plain.encode(), _bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return _bcrypt.checkpw(plain.encode(), hashed.encode())


# ── Token creation ────────────────────────────────────────────────────────


def create_access_token(username: str, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=_jwt_expire())
    payload = {"sub": username, "role": role, "exp": expire}
    return jwt.encode(payload, _jwt_secret(), algorithm=JWT_ALGORITHM)


# ── FastAPI dependency: current authenticated user ────────────────────────


class CurrentUser(BaseModel):
    username: str
    role: str  # viewer | editor | admin


def _decode_token(token: str) -> CurrentUser:
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, _jwt_secret(), algorithms=[JWT_ALGORITHM])
        username: str | None = payload.get("sub")
        role: str = payload.get("role", "viewer")
        if not username:
            raise credentials_exc
        return CurrentUser(username=username, role=role)
    except JWTError:
        raise credentials_exc


def get_current_user(token: Annotated[str, Depends(oauth2_scheme)] = "") -> CurrentUser:
    # AUTH DISABLED — always return admin
    return CurrentUser(username="dev", role="admin")


# ── Role guards ───────────────────────────────────────────────────────────


def require_editor(
    user: Annotated[CurrentUser, Depends(get_current_user)],
) -> CurrentUser:
    """Allow editor or admin only."""
    if user.role not in ("editor", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Editor or Admin role required",
        )
    return user


def require_admin(
    user: Annotated[CurrentUser, Depends(get_current_user)],
) -> CurrentUser:
    """Allow admin only."""
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required",
        )
    return user


# ── Path whitelist validation ─────────────────────────────────────────────


def validate_path(path: str | Path, allowed_base: str | Path) -> bool:
    """Return True iff `path` is inside `allowed_base` after resolving."""
    resolved = Path(path).resolve()
    base = Path(allowed_base).resolve()
    try:
        resolved.relative_to(base)
        return True
    except ValueError:
        return False


def assert_source_path(path: str | Path) -> None:
    """Raise 403 if path is not inside the allowed source DWG directory."""
    from .config import settings

    if not validate_path(path, settings.allowed_source_dir) and not validate_path(
        path, settings.dxf_source_dir
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access to path '{path}' is not permitted.",
        )


def assert_output_path(path: str | Path) -> None:
    """Raise 403 if path is not inside the allowed output directory."""
    from .config import settings

    if not validate_path(path, settings.allowed_output_dir):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access to path '{path}' is not permitted.",
        )


# ── DB helper: lookup user ────────────────────────────────────────────────


def authenticate_user(db: Session, username: str, password: str):
    """Return User ORM object if credentials are valid, else None."""
    from .models import User
    from sqlalchemy import select

    user = db.scalars(select(User).where(User.username == username)).first()
    if user is None or not user.is_active:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user
