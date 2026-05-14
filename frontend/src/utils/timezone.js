/**
 * Timezone and Cron Expression Utilities
 * 
 * All cron expressions are stored in UTC in the database.
 * These utilities handle conversion between local time and UTC.
 */

/**
 * Convert local time (HH:MM) to UTC hour/minute
 * Used when creating cron expressions from user input
 * @param {string} timeStr - Local time in HH:MM format
 * @returns {{ hour: number, minute: number }} UTC hour and minute
 */
export const localTimeToUTC = (timeStr) => {
  const [hour, minute] = timeStr.split(':').map(Number);
  const now = new Date();
  const localDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);
  return {
    hour: localDate.getUTCHours(),
    minute: localDate.getUTCMinutes()
  };
};

/**
 * Convert UTC hour/minute to local time string (HH:MM)
 * Used when displaying cron expression times
 * @param {number} utcHour - Hour in UTC
 * @param {number} utcMinute - Minute in UTC
 * @returns {string} Local time in HH:MM format
 */
export const utcTimeToLocal = (utcHour, utcMinute) => {
  const now = new Date();
  const utcDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), utcHour, utcMinute));
  const localHour = utcDate.getHours();
  const localMinute = utcDate.getMinutes();
  return `${String(localHour).padStart(2, '0')}:${String(localMinute).padStart(2, '0')}`;
};

/**
 * Parse a cron expression and return display-friendly info
 * Converts UTC times in cron to local time for display
 * @param {string} cronExpression - Cron expression (minute hour dayOfMonth month dayOfWeek)
 * @returns {{ type: string, time: string, days?: string, dayOfMonth?: number } | null}
 */
export const parseCronExpression = (cronExpression) => {
  if (!cronExpression) return null;
  
  const parts = cronExpression.split(' ');
  if (parts.length !== 5) return null;
  
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  
  // Convert UTC hour/minute to local time for display
  const timeStr = utcTimeToLocal(parseInt(hour), parseInt(minute));
  
  // Check if it's weekly (dayOfWeek is not *)
  if (dayOfWeek !== '*') {
    const daysMap = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const days = dayOfWeek.split(',').map(d => daysMap[parseInt(d)]).join(', ');
    return { type: 'weekly', time: timeStr, days };
  }
  
  // Check if it's monthly (dayOfMonth is not *)
  if (dayOfMonth !== '*') {
    return { type: 'monthly', time: timeStr, dayOfMonth: parseInt(dayOfMonth) };
  }
  
  // Daily schedule
  return { type: 'daily', time: timeStr };
};

/**
 * Format a cron expression as a human-readable string
 * @param {string} cronExpr - Cron expression
 * @returns {string} Human-readable schedule description
 */
export const formatCronExpression = (cronExpr) => {
  if (!cronExpr) return 'Not scheduled';
  
  const parsed = parseCronExpression(cronExpr);
  if (!parsed) return cronExpr;
  
  if (parsed.type === 'monthly') {
    return `Day ${parsed.dayOfMonth} at ${parsed.time}`;
  } else if (parsed.type === 'weekly') {
    return `${parsed.days} at ${parsed.time}`;
  } else {
    return `Daily at ${parsed.time}`;
  }
};

/**
 * Get current datetime formatted for datetime-local input
 * @returns {string} Current time in YYYY-MM-DDTHH:MM format
 */
export const getCurrentLocalDateTime = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
};

/**
 * Convert datetime-local value to ISO UTC string for API
 * datetime-local format: "2026-01-30T16:00" (local time, no timezone)
 * Returns: "2026-01-30T21:00:00.000Z" (UTC with Z suffix)
 * @param {string} localDateTimeStr - Value from datetime-local input
 * @returns {string | null} ISO string in UTC
 */
export const localDateTimeToUTC = (localDateTimeStr) => {
  if (!localDateTimeStr) return null;
  const date = new Date(localDateTimeStr);
  return date.toISOString();
};

/**
 * Get local datetime string for a given date (for datetime-local input prefill)
 * @param {Date} date - Date object
 * @returns {string} Datetime in YYYY-MM-DDTHH:MM format
 */
export const getLocalDateTimeString = (date = new Date()) => {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
};

/**
 * Threshold (minutes) on either side of the scheduled time that defines the
 * acceptable administration window. Matches the backend constants in
 * `backend/utils/early_administration.py`.
 */
export const EARLY_ADMINISTRATION_THRESHOLD_MINUTES = 60;
export const LATE_ADMINISTRATION_THRESHOLD_MINUTES = 60;

/**
 * Check whether an administration is inside, before, or after its scheduled window.
 * Returns a three-state status so callers can mirror the backend gate (which now
 * blocks both edges) and pick appropriate UI.
 *
 * `scheduledTimeIso` may be a UTC ISO string with `Z`/offset, or a naive ISO string
 * (which is treated as UTC — that's how the API serializes some legacy columns).
 * `completedAt` may be a Date, a UTC ISO string, or a `datetime-local` value (local
 * wall-clock time, no offset). Pass `null` to mean "right now".
 *
 * `minutesOffset` is positive when the administration is early (scheduled time is
 * in the future relative to `completedAt`) and negative when late.
 *
 * @param {string|null|undefined} scheduledTimeIso
 * @param {string|Date|null} [completedAt=null]
 * @param {{ earlyThresholdMinutes?: number, lateThresholdMinutes?: number }} [opts]
 * @returns {{ status: 'early'|'late'|'on_window'|'unknown', minutesOffset: number, scheduledLocal: string }}
 */
export const checkAdministrationWindow = (
  scheduledTimeIso,
  completedAt = null,
  {
    earlyThresholdMinutes = EARLY_ADMINISTRATION_THRESHOLD_MINUTES,
    lateThresholdMinutes = LATE_ADMINISTRATION_THRESHOLD_MINUTES,
  } = {}
) => {
  if (!scheduledTimeIso) return { status: 'unknown', minutesOffset: 0, scheduledLocal: '' };
  const normalized = (scheduledTimeIso.endsWith('Z') || scheduledTimeIso.includes('+'))
    ? scheduledTimeIso
    : scheduledTimeIso + 'Z';
  const sched = new Date(normalized);
  const done = completedAt instanceof Date
    ? completedAt
    : completedAt
      ? new Date(completedAt)
      : new Date();
  if (isNaN(sched.getTime()) || isNaN(done.getTime())) {
    return { status: 'unknown', minutesOffset: 0, scheduledLocal: '' };
  }
  const minutesOffset = Math.round((sched.getTime() - done.getTime()) / 60000);
  const scheduledLocal = sched.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
  let status = 'on_window';
  if (minutesOffset > earlyThresholdMinutes) status = 'early';
  else if (-minutesOffset > lateThresholdMinutes) status = 'late';
  return { status, minutesOffset, scheduledLocal };
};

/**
 * Backwards-compatible wrapper. Prefer {@link checkAdministrationWindow} for new code —
 * it surfaces the late case as well, which the backend now blocks.
 *
 * @returns {{ early: boolean, late: boolean, minutesEarly: number, minutesLate: number, scheduledLocal: string }}
 */
export const checkEarlyAdministration = (scheduledTimeIso, completedAt = null, thresholdMinutes = EARLY_ADMINISTRATION_THRESHOLD_MINUTES) => {
  const { status, minutesOffset, scheduledLocal } = checkAdministrationWindow(
    scheduledTimeIso,
    completedAt,
    { earlyThresholdMinutes: thresholdMinutes }
  );
  return {
    early: status === 'early',
    late: status === 'late',
    minutesEarly: status === 'early' ? minutesOffset : 0,
    minutesLate: status === 'late' ? -minutesOffset : 0,
    scheduledLocal,
  };
};

/**
 * Format a positive number of minutes as "Xh Ym" / "Xh" / "Ym".
 * @param {number} mins
 * @returns {string}
 */
export const formatDurationMinutes = (mins) => {
  const n = Math.max(0, Math.round(mins));
  if (n < 60) return `${n}m`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};
