/*
 * Smart Home Health
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

export function hasSchedulePermission(user, permission) {
  return Boolean(user?.is_system_admin || user?.is_superuser || user?.permissions?.includes(permission));
}

const RECORD_PERMISSIONS = {
  medications: ['medications.administer', 'medications.update'],
  nutrition: ['nutrition.create', 'nutrition.update'],
  care_tasks: ['care_tasks.perform'],
};

export function canRecordSchedule(user, category) {
  return RECORD_PERMISSIONS[category].some(permission => hasSchedulePermission(user, permission));
}
