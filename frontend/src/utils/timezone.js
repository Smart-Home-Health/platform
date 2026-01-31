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
