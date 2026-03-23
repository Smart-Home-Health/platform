"""
UTC datetime utilities for consistent timezone handling.

All datetime operations should use these utilities to ensure
consistent UTC storage across the application.
"""
from datetime import datetime, timezone


def utc_now() -> datetime:
    """
    Get current UTC datetime with timezone info.
    Use this instead of datetime.now() for all timestamp storage.
    """
    return datetime.now(timezone.utc)


def utc_today() -> datetime.date:
    """
    Get current UTC date.
    Use this for date comparisons and filtering.
    """
    return datetime.now(timezone.utc).date()


def make_utc(dt: datetime) -> datetime:
    """
    Ensure a datetime has UTC timezone info.
    If naive, assumes it's already UTC and adds tzinfo.
    If aware, converts to UTC.
    """
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)
