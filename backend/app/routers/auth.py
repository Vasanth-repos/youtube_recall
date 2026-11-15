import logging
import re
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models import User
from backend.app.schemas import (
    UserRegisterRequest,
    UserLoginRequest,
    UserResponse,
    TokenResponse,
    UserProfileUpdateRequest
)
from backend.app.services.auth_service import AuthService, get_current_user_optional, get_current_user_required

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

EMAIL_REGEX = r'^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$'

@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register_user(req: UserRegisterRequest, db: Session = Depends(get_db)):
    """Registers a new user account and returns a JWT access token."""
    email_clean = req.email.strip().lower()
    if not re.match(EMAIL_REGEX, email_clean):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid email format."
        )

    if len(req.password.strip()) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 6 characters long."
        )

    existing = db.query(User).filter(User.email == email_clean).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email already exists."
        )

    hashed_pw = AuthService.hash_password(req.password.strip())
    new_user = User(
        email=email_clean,
        hashed_password=hashed_pw,
        full_name=req.full_name.strip() if req.full_name else email_clean.split("@")[0],
        is_active=True
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    token = AuthService.create_access_token({"sub": str(new_user.id), "email": new_user.email})
    logger.info(f"New user registered: {new_user.email} (ID: {new_user.id})")
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=new_user
    )

@router.post("/login", response_model=TokenResponse)
def login_user(req: UserLoginRequest, db: Session = Depends(get_db)):
    """Authenticates a user with email and password, returning a JWT token."""
    email_clean = req.email.strip().lower()
    user = db.query(User).filter(User.email == email_clean).first()

    if not user or not AuthService.verify_password(req.password.strip(), user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password."
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated."
        )

    token = AuthService.create_access_token({"sub": str(user.id), "email": user.email})
    logger.info(f"User logged in: {user.email} (ID: {user.id})")
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=user
    )

@router.get("/me", response_model=UserResponse)
def get_current_user_profile(user: User = Depends(get_current_user_optional)):
    """Returns the authenticated user profile or the active default workspace user."""
    return user

@router.put("/profile", response_model=UserResponse)
def update_user_profile(
    req: UserProfileUpdateRequest,
    user: User = Depends(get_current_user_required),
    db: Session = Depends(get_db)
):
    """Updates user profile settings and personal Gemini API key."""
    if req.full_name is not None:
        user.full_name = req.full_name.strip()
    if req.api_key_gemini is not None:
        user.api_key_gemini = req.api_key_gemini.strip()

    db.commit()
    db.refresh(user)
    return user
