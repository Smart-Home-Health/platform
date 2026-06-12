/*
 * Smart Home Health Hub
 * Copyright (C) 2026 John Carty
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * Single source of truth for the time-based status used by ScheduleList across
 * the medication / nutrition / care-task dashboard modals. Items come from the
 * unified `/api/schedule/daily` endpoint, which carries `completed`, `skipped`
 * (medications), `status` (care tasks: completed|skipped|partial), `is_yesterday`,
 * and a real-UTC `scheduled_time`.
 *
 * Returns ScheduleList's taxonomy:
 *   'skipped' | 'completed' | 'missed' | 'pending' | 'due_on_time' | 'due_warning'
 */
export function computeScheduleStatus(item) {
  // Terminal states recorded by the backend win over any time computation.
  if (item.skipped || item.status === 'skipped') return 'skipped';
  if (item.completed) return 'completed';
  if (item.is_yesterday) return 'missed';

  const diffMin = (new Date(item.scheduled_time) - new Date()) / 60000; // +future
  if (diffMin > 15) return 'pending';
  if (diffMin > -15) return 'due_on_time';
  if (diffMin > -60) return 'due_warning';
  return 'missed';
}
