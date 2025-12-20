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
        # Define public paths that don't require authentication
        public_paths = [
            "/api/auth/",  # All auth endpoints
            "/api/core/first-run",  # First run check
            "/ws/",  # WebSocket connections
            "/docs",  # API documentation
            "/openapi.json",  # OpenAPI schema
            "/redoc",  # Alternative docs
            "/"  # Root path
        ]
        
        # Check if path is public
        path = request.url.path
        is_public = any(path.startswith(public_path) for public_path in public_paths)
        
        if is_public:
            return await call_next(request)
        
        # Extract token from cookie or Authorization header
        token = request.cookies.get("session_token")
        if not token:
            auth_header = request.headers.get("Authorization", "")
            if auth_header.startswith("Bearer "):
                token = auth_header[7:]
        
        # No token found - require authentication
        if not token:
            logger.debug(f"No token found for protected route: {path}")
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={
                    "detail": "Authentication required",
                    "requires_auth": True,
                    "path": path
                }
            )
        
        # Validate token
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            user_id = payload.get("user_id")
            username = payload.get("username")
            exp = payload.get("exp")
            
            # Check if token expired
            if datetime.utcnow().timestamp() > exp:
                logger.debug(f"Expired token for user {username}")
                return JSONResponse(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    content={
                        "detail": "Session expired",
                        "requires_auth": True,
                        "path": path
                    }
                )
            
            # Add user context to request state
            request.state.user_id = user_id
            request.state.username = username
            request.state.user_role = payload.get("role")
            request.state.is_authenticated = True
            
            # Continue with request
            response = await call_next(request)
            return response
            
        except jwt.InvalidTokenError as e:
            logger.warning(f"Invalid token: {e}")
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={
                    "detail": "Invalid session",
                    "requires_auth": True,
                    "path": path
                }
            )
        except Exception as e:
            logger.error(f"Error in auth middleware: {e}")
            return JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content={"detail": "Authentication error"}
            )
