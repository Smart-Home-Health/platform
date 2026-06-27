# Smart Home Health
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

Storage is always UTC. To present or bucket data by a user's *local* day
(today/yesterday), resolve the account's IANA timezone via `get_account_tz` /
`resolve_tz_for_patient` and build day boundaries with `local_day_bounds`.
"""
import logging
from datetime import datetime, timezone, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

logger = logging.getLogger('app')

# Mirrors the Account.timezone column default (backend/models/users.py). Used
# whenever an account / patient timezone can't be resolved.
DEFAULT_TZ = "America/New_York"


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


def _coerce_zoneinfo(tz_name) -> ZoneInfo:
    """Build a ZoneInfo from an IANA name, falling back to DEFAULT_TZ on any
    blank/invalid value. Never raises."""
    if tz_name:
        try:
            return ZoneInfo(str(tz_name))
        except (ZoneInfoNotFoundError, ValueError):
            logger.warning("Invalid timezone %r; falling back to %s", tz_name, DEFAULT_TZ)
    return ZoneInfo(DEFAULT_TZ)


def get_account_tz(db, account_id) -> ZoneInfo:
    """Resolve an account's IANA timezone as a ZoneInfo.

    Returns ZoneInfo(DEFAULT_TZ) when account_id is None, the account is
    missing, or the stored timezone string is blank/invalid. Never raises.
    """
    if account_id is None:
        return ZoneInfo(DEFAULT_TZ)
    try:
        from models import Account
        account = db.query(Account).filter(Account.id == account_id).first()
        return _coerce_zoneinfo(account.timezone if account else None)
    except Exception as e:  # pragma: no cover - defensive, never block on tz lookup
        logger.warning("Could not resolve account %s timezone: %s", account_id, e)
        return ZoneInfo(DEFAULT_TZ)


def resolve_tz_for_patient(db, patient_id) -> ZoneInfo:
    """Resolve the account timezone for a patient via Patient.account_id.

    Falls back to DEFAULT_TZ when patient_id is None, the patient is missing,
    or account_id is NULL. Never raises.
    """
    if patient_id is None:
        return ZoneInfo(DEFAULT_TZ)
    try:
        from schemas.patient import Patient
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient or patient.account_id is None:
            return ZoneInfo(DEFAULT_TZ)
        return get_account_tz(db, patient.account_id)
    except Exception as e:  # pragma: no cover - defensive
        logger.warning("Could not resolve patient %s timezone: %s", patient_id, e)
        return ZoneInfo(DEFAULT_TZ)


def local_day_bounds(tz: ZoneInfo, now_utc: datetime = None) -> dict:
    """Local (account-timezone) "today" and "yesterday" expressed in UTC.

    Generalizes the day-boundary logic so schedules/badges bucket items by the
    patient's local day instead of UTC, without being cut off by UTC date
    rollover. DST-safe: boundaries are built with ``tzinfo=tz`` at construction
    (not a fixed offset), so each day gets its correct UTC offset.

    Returns a dict with:
        now_utc, local_today (date), local_yesterday (date),
        yesterday_start_utc, today_start_utc, today_end_utc  (aware UTC datetimes),
        utc_dates  (sorted list of UTC calendar dates spanning the window, for
                    iterating per-UTC-date cron generators)
    """
    if now_utc is None:
        now_utc = utc_now()
    local_today = now_utc.astimezone(tz).date()
    local_yesterday = local_today - timedelta(days=1)

    def _start(d):
        return datetime.combine(d, time.min, tzinfo=tz).astimezone(timezone.utc)

    yesterday_start_utc = _start(local_yesterday)
    today_start_utc = _start(local_today)
    today_end_utc = _start(local_today + timedelta(days=1))

    utc_dates = sorted({
        yesterday_start_utc.date(),
        today_start_utc.date(),
        (today_end_utc - timedelta(seconds=1)).date(),
    })

    return {
        'now_utc': now_utc,
        'local_today': local_today,
        'local_yesterday': local_yesterday,
        'yesterday_start_utc': yesterday_start_utc,
        'today_start_utc': today_start_utc,
        'today_end_utc': today_end_utc,
        'utc_dates': utc_dates,
    }
