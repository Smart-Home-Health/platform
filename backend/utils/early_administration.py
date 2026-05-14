"""
Guard against logging a scheduled item (medication, nutrition, care task)
substantially outside its scheduled window — either before (early) or after
(late).

A frontend can short-circuit the check by sending `early_override=True` after
the user explicitly confirms an inline warning. The flag is named for
historical reasons; it now overrides the late gate as well.
"""
from datetime import datetime
from typing import Optional, Union, Tuple

from fastapi.responses import JSONResponse

from utils.datetime_utils import utc_now, make_utc


EARLY_ADMINISTRATION_THRESHOLD_MINUTES = 60
LATE_ADMINISTRATION_THRESHOLD_MINUTES = 60


def _coerce_time(value: Union[datetime, str, None]) -> Optional[datetime]:
    """Coerce a datetime or ISO string to a UTC-aware datetime."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return make_utc(value)
    s = value
    if s.endswith('Z'):
        s = s[:-1] + '+00:00'
    try:
        parsed = datetime.fromisoformat(s)
    except ValueError:
        return None
    return make_utc(parsed)


def check_administration_window(
    scheduled_time: Union[datetime, str, None],
    completed_at: Union[datetime, str, None] = None,
    early_threshold_minutes: int = EARLY_ADMINISTRATION_THRESHOLD_MINUTES,
    late_threshold_minutes: int = LATE_ADMINISTRATION_THRESHOLD_MINUTES,
) -> Tuple[str, int, Optional[datetime]]:
    """
    Return (status, minutes_offset, parsed_scheduled_time).

    status is "early", "late", "on_window", or "unknown" (when scheduled_time
    is missing or unparseable). minutes_offset is positive when the
    administration is early (scheduled time is in the future relative to
    `completed_at`) and negative when it's late.

    `completed_at` is the time the user is claiming the dose was actually
    given. When omitted, we compare against the current wall clock — that's
    the right behaviour for "I'm logging this right now".
    """
    parsed_sched = _coerce_time(scheduled_time)
    if parsed_sched is None:
        return "unknown", 0, None
    parsed_done = _coerce_time(completed_at) or utc_now()
    diff_seconds = (parsed_sched - parsed_done).total_seconds()
    minutes_offset = int(diff_seconds // 60)
    if minutes_offset > early_threshold_minutes:
        return "early", minutes_offset, parsed_sched
    if -minutes_offset > late_threshold_minutes:
        return "late", minutes_offset, parsed_sched
    return "on_window", minutes_offset, parsed_sched


def check_early_administration(
    scheduled_time: Union[datetime, str, None],
    threshold_minutes: int = EARLY_ADMINISTRATION_THRESHOLD_MINUTES,
) -> Tuple[bool, int, Optional[datetime]]:
    """
    Backwards-compatible early-only check.

    Returns (is_early, minutes_early, parsed_scheduled_time). `is_early` is
    True only when the scheduled time is strictly more than `threshold_minutes`
    after now.
    """
    status, minutes, parsed = check_administration_window(
        scheduled_time,
        early_threshold_minutes=threshold_minutes,
    )
    return status == "early", minutes, parsed


def off_window_response(
    status: str,
    minutes_offset: int,
    scheduled_time: Optional[datetime],
    item_label: str = "item",
    schedule_id: Optional[int] = None,
) -> JSONResponse:
    """Build the 409 response the frontend uses to detect the gate."""
    if status == "early":
        threshold = EARLY_ADMINISTRATION_THRESHOLD_MINUTES
        minutes_display = minutes_offset
        detail = (
            f"This {item_label} is scheduled more than {threshold} minutes from now "
            f"({minutes_display} min early). Re-submit with early_override=true to confirm."
        )
        error_code = "early_administration"
    else:  # late
        threshold = LATE_ADMINISTRATION_THRESHOLD_MINUTES
        minutes_display = -minutes_offset
        detail = (
            f"This {item_label} was scheduled more than {threshold} minutes ago "
            f"({minutes_display} min late). Re-submit with early_override=true to confirm."
        )
        error_code = "late_administration"
    return JSONResponse(
        status_code=409,
        content={
            "detail": detail,
            "error": error_code,
            "minutes_early": minutes_offset if status == "early" else 0,
            "minutes_late": -minutes_offset if status == "late" else 0,
            "threshold_minutes": threshold,
            "scheduled_time": scheduled_time.isoformat() if scheduled_time else None,
            "schedule_id": schedule_id,
        },
    )


# Alias retained for callers that imported the old name.
early_administration_response = off_window_response


def guard_early_administration(
    scheduled_time: Union[datetime, str, None],
    early_override: bool,
    item_label: str = "item",
    schedule_id: Optional[int] = None,
    completed_at: Union[datetime, str, None] = None,
) -> Optional[JSONResponse]:
    """
    Return a 409 JSONResponse to short-circuit a route when the request is
    outside the administration window (either early or late) and the caller
    did not pass `early_override=True`. Returns None when the route should
    proceed.

    The function name and override flag are retained for backwards
    compatibility but now gate both edges of the window.
    """
    if early_override:
        return None
    status, minutes_offset, parsed = check_administration_window(
        scheduled_time,
        completed_at=completed_at,
    )
    if status in ("on_window", "unknown"):
        return None
    return off_window_response(
        status=status,
        minutes_offset=minutes_offset,
        scheduled_time=parsed,
        item_label=item_label,
        schedule_id=schedule_id,
    )
