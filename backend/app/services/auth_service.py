import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from backend.app.config import settings
from backend.app.database import get_db
from backend.app.models import User

logger = logging.getLogger(__name__)

security_optional = HTTPBearer(auto_error=False)
security_required = HTTPBearer(auto_error=True)

class AuthService:
    @staticmethod
    def hash_password(password: str) -> str:
        """Securely hashes a plain-text password using bcrypt."""
        if not password:
            raise ValueError("Password cannot be empty")
        salt = bcrypt.gensalt(rounds=12)
        return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        """Verifies plain text password against bcrypt hash."""
        if not plain_password or not hashed_password:
            return False
        try:
            return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
        except Exception as e:
            logger.warning(f"Password verification notice: {e}")
            return False

    @staticmethod
    def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
        """Generates a secure signed JWT access token."""
        to_encode = data.copy()
        now = datetime.now(timezone.utc)
        expire = now + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
        to_encode.update({"iat": now, "exp": expire})
        return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

    @staticmethod
    def decode_access_token(token: str) -> Optional[dict]:
        """Decodes and validates JWT token signature and expiration."""
        try:
            payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
            return payload
        except jwt.ExpiredSignatureError:
            logger.info("Access token has expired.")
            return None
        except jwt.PyJWTError as e:
            logger.warning(f"JWT decode notice: {e}")
            return None

def get_current_user_optional(
    auth_header: Optional[HTTPAuthorizationCredentials] = Depends(security_optional),
    db: Session = Depends(get_db)
) -> User:
    """
    Resolves the authenticated user if token is provided.
    If no token is supplied, defaults to Workspace User (ID=1)
    to preserve 100% backward compatibility for offline PWA, native Android, and automated tests.
    """
    if auth_header and auth_header.credentials:
        token = auth_header.credentials.strip()
        payload = AuthService.decode_access_token(token)
        if payload and "sub" in payload:
            try:
                user_id = int(payload["sub"])
                user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
                if user:
                    return user
            except (ValueError, TypeError):
                # sub might be email
                user = db.query(User).filter(User.email == payload["sub"], User.is_active == True).first()
                if user:
                    return user

    # Fallback to default user
    default_user = db.query(User).filter(User.id == 1).first()
    if not default_user:
        salt = bcrypt.gensalt(rounds=10)
        default_user = User(
            id=1,
            email="guest@youtuberecall.local",
            hashed_password=bcrypt.hashpw(b"guest123", salt).decode("utf-8"),
            full_name="Default Workspace",
            is_active=True
        )
        db.add(default_user)
        db.commit()
        db.refresh(default_user)
    return default_user

def get_current_user_required(
    auth_header: HTTPAuthorizationCredentials = Depends(security_required),
    db: Session = Depends(get_db)
) -> User:
    """
    Enforces strict authentication requirement for user-sensitive endpoints.
    """
    if not auth_header or not auth_header.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    token = auth_header.credentials.strip()
    payload = AuthService.decode_access_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_id = int(payload["sub"])
        user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    except (ValueError, TypeError):
        user = db.query(User).filter(User.email == payload["sub"], User.is_active == True).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found or deactivated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user
