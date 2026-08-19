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
// Care task API service — tasks, categories, schedules and the day view.
import config, { apiFetch } from '../config';

async function asJson(response, fallbackMessage) {
  if (!response.ok) {
    let detail = fallbackMessage;
    try {
      const body = await response.json();
      detail = body.detail || body.error || fallbackMessage;
    } catch { /* non-JSON error body */ }
    throw new Error(detail);
  }
  return response.json();
}

const send = (url, body, method = 'POST') => apiFetch(url, {
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const careTaskService = {
  // ---------- tasks ----------
  async listTasks(patientId) {
    const [active, inactive] = await Promise.all([
      apiFetch(`${config.apiUrl}/api/admin/care-tasks/active?patient_id=${patientId}`)
        .then((r) => asJson(r, 'Failed to fetch care tasks')),
      apiFetch(`${config.apiUrl}/api/admin/care-tasks/inactive?patient_id=${patientId}`)
        .then((r) => asJson(r, 'Failed to fetch care tasks')),
    ]);
    const byName = (a, b) => a.name.localeCompare(b.name);
    return [
      ...(active.care_tasks || []).sort(byName),
      ...(inactive.care_tasks || []).sort(byName),
    ];
  },

  async createTask(data) {
    return asJson(await send(`${config.apiUrl}/api/add/care-task`, data), 'Failed to add care task');
  },

  async updateTask(taskId, data) {
    return asJson(await send(`${config.apiUrl}/api/care-tasks/${taskId}`, data, 'PUT'),
                  'Failed to update care task');
  },

  async deactivateTask(taskId) {
    return asJson(await apiFetch(`${config.apiUrl}/api/care-tasks/${taskId}`, { method: 'DELETE' }),
                  'Failed to deactivate care task');
  },

  async toggleTask(taskId) {
    return asJson(await send(`${config.apiUrl}/api/care-tasks/${taskId}/toggle-active`, {}),
                  'Failed to change care task status');
  },

  // ---------- categories ----------
  async listCategories() {
    const body = await asJson(await apiFetch(`${config.apiUrl}/api/care-task-categories`),
                              'Failed to fetch categories');
    return body.categories || [];
  },

  async createCategory(data) {
    return asJson(await send(`${config.apiUrl}/api/add/care-task-category`, data),
                  'Failed to add category');
  },

  async updateCategory(categoryId, data) {
    return asJson(await send(`${config.apiUrl}/api/care-task-categories/${categoryId}`, data, 'PUT'),
                  'Failed to update category');
  },

  async deleteCategory(categoryId) {
    return asJson(
      await apiFetch(`${config.apiUrl}/api/care-task-categories/${categoryId}`, { method: 'DELETE' }),
      'Failed to delete category',
    );
  },

  // ---------- schedules ----------
  // One call for every schedule, grouped client-side, rather than one request
  // per task.
  async listSchedules(patientId) {
    const body = await asJson(
      await apiFetch(`${config.apiUrl}/api/care-task-schedules?active_only=false&patient_id=${patientId}`),
      'Failed to fetch schedules',
    );
    return body.schedules || [];
  },

  async createSchedule(taskId, data) {
    return asJson(await send(`${config.apiUrl}/api/add/care-task-schedule/${taskId}`, data),
                  'Failed to add schedule');
  },

  async updateSchedule(scheduleId, data) {
    return asJson(await send(`${config.apiUrl}/api/care-task-schedules/${scheduleId}`, data, 'PUT'),
                  'Failed to update schedule');
  },

  async deleteSchedule(scheduleId) {
    return asJson(
      await apiFetch(`${config.apiUrl}/api/care-task-schedules/${scheduleId}`, { method: 'DELETE' }),
      'Failed to delete schedule',
    );
  },

  async toggleSchedule(scheduleId) {
    return asJson(await send(`${config.apiUrl}/api/care-task-schedules/${scheduleId}/toggle-active`, {}),
                  'Failed to change schedule status');
  },

  // ---------- day view ----------
  async day(patientId) {
    return asJson(await apiFetch(`${config.apiUrl}/api/care-tasks/day?patient_id=${patientId}`),
                  'Failed to fetch the care task day');
  },

  // ---------- history / stats ----------
  async history(params) {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== '' && v != null),
    );
    return asJson(await apiFetch(`${config.apiUrl}/api/care-tasks/history?${qs}`),
                  'Failed to fetch history');
  },
};

export default careTaskService;
