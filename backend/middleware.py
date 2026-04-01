"""
Authentication middleware for session management
"""
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from fastapi import status
from datetime import datetime
import jwt
import os
import logging

logger = logging.getLogger(__name__)

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change-this-secret-key-in-production")
ALGORITHM = "HS256"
SESSION_TIMEOUT_MINUTES = 30


class AuthenticationMiddleware(BaseHTTPMiddleware):
    """
    Middleware to check authentication on protected routes.
    
    - Allows public routes (auth, first-run, websocket, docs)
    - Checks for valid session token in cookies or Authorization header
    - Validates token and checks if user needs full password (daily requirement)
    - Adds user context to request.state for use in route handlers
    """
    
    async def dispatch(self, request: Request, call_next):
        # Allow OPTIONS requests through for CORS preflight
        if request.method == "OPTIONS":
            return await call_next(request)
        
        # Define public paths that don't require authentication
        public_paths = [
            "/api/auth/first-run",  # First run check and setup
            "/api/auth/login",  # Login endpoint
            "/api/auth/verify-pin",  # PIN verification
            "/api/auth/users/available",  # Available users for login
            "/api/auth/account/login",  # Account login (Layer 1)
            "/api/auth/account/access",  # Account access (password optional, single account)
            "/api/auth/session",  # Session check (can return 401)
            "/api/core/first-run",  # First run check (legacy)
            "/ws/",  # WebSocket connections
            "/api/readers/ws/",  # Reader device WebSocket (auth via encryption key after connect)
            "/docs",  # API documentation
            "/openapi.json",  # OpenAPI schema
            "/redoc",  # Alternative docs
            "/"  # Root path
        ]
        
        # Check if path is public
        path = request.url.path
        # Exact match for "/" or startswith for other paths
        is_public = path == "/" or any(
            path.startswith(public_path) 
            for public_path in public_paths if public_path != "/"
        )
        
        if is_public:
            return await call_next(request)
        
        # Extract token from cookie or Authorization header
        token = request.cookies.get("session_token")
        if not token:
            auth_header = request.headers.get("Authorization", "")
            if auth_header.startswith("Bearer "):
                token = auth_header[7:]

        # Try to decode the primary session token
        payload = self._decode_token(token) if token else None

        # If the session token is missing or expired, fall back to the long-lived
        # account_token cookie so the browser stays at account-level auth (user
        # select) instead of being kicked back to the password prompt.
        if payload is None:
            account_token = request.cookies.get("account_token")
            if account_token:
                payload = self._decode_token(account_token)

        # No valid token at all — require authentication
        if payload is None:
            logger.debug(f"No valid token for protected route: {path}")
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={
                    "detail": "Authentication required",
                    "requires_auth": True,
                    "path": path
                }
            )

        # Extract fields from whichever token was valid
        user_id = payload.get("user_id")
        username = payload.get("username")
        account_id = payload.get("account_id")
        auth_level = payload.get("auth_level", "full")
        read_restricted = payload.get("read_restricted", False)

        # Add user context to request state AND scope (for BaseHTTPMiddleware compatibility)
        request.state.user_id = user_id
        request.state.username = username
        request.state.user_role = payload.get("role")
        request.state.is_authenticated = True
        request.state.account_id = account_id
        request.state.auth_level = auth_level
        request.state.read_restricted = read_restricted

        # Also add to scope for persistence
        request.scope["user_id"] = user_id
        request.scope["username"] = username
        request.scope["user_role"] = payload.get("role")
        request.scope["account_id"] = account_id
        request.scope["auth_level"] = auth_level
        request.scope["read_restricted"] = read_restricted

        # Continue with request
        try:
            response = await call_next(request)
            return response
        except Exception as e:
            logger.error(f"Error processing request: {e}")
            return JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content={"detail": "Internal server error"}
            )

    @staticmethod
    def _decode_token(token: str) -> dict | None:
        """Decode and validate a JWT token.  Returns the payload dict or None."""
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            if not isinstance(payload, dict):
                return None
            if datetime.utcnow().timestamp() > payload.get("exp", 0):
                return None
            return payload
        except jwt.InvalidTokenError:
            return None
        except Exception as e:
            logger.error(f"Error decoding token: {e}")
            return None
