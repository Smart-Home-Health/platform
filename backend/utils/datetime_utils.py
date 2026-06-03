# Smart Home Health Hub
# Copyright (C) 2026 John Carty
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.
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
