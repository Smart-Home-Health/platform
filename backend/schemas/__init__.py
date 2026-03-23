"""
SQLAlchemy Base and common utilities for schema models
"""
# Import Base from db.py to ensure all models share the same metadata registry
from db import Base

__all__ = ['Base']
