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
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, within } from '@testing-library/react';

vi.mock('./ModalBase', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('./nutrition/IntakeSheet', () => ({ default: () => null }));

const { authCtx, patientCtx } = vi.hoisted(() => ({
  authCtx: { user: { id: 1, full_name: 'Temp Name' } },
  patientCtx: { selectedPatient: { id: 5, first_name: 'Eli', last_name: 'Carty' } },
}));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => authCtx }));
vi.mock('../contexts/AdminPatientContext', () => ({ useAdminPatient: () => patientCtx }));
vi.mock('../config', () => ({ default: { apiUrl: '' } }));

import CareTaskModal from './CareTaskModal';

const TASKS = [{
  id: 3, name: 'Reposition', description: 'Turn to left side',
  category_id: 1, category_name: 'Comfort', category_color: '#7fb39a',
}];

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    if (url.includes('/api/care-tasks/active')) {
      return { ok: true, status: 200, json: async () => ({ care_tasks: TASKS }) };
    }
    return { ok: true, status: 200, json: async () => ({ care_tasks: [] }) };
  }));
});

describe('CareTaskModal PRN mark-done', () => {
  it('runs the PRN flow on EntityModal with em fields, no shadcn dialog', async () => {
    await act(async () => { render(<CareTaskModal onClose={() => {}} />); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /PRN/i })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Reposition/ })); });

    expect(screen.getByText('Mark Done — Reposition')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="dialog-content"]')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Completed At/)).toHaveClass('em-input');
    const footer = document.querySelector('.em-footer');
    expect(within(footer).getByRole('button', { name: /Back/ })).toHaveClass('em-cancel');
    expect(within(footer).getByRole('button', { name: 'Mark Done' })).toHaveClass('em-submit');
  });
});

describe('CareTaskModal scheduled completion', () => {
  it('keeps the patient and original occurrence when confirming an off-window task', async () => {
    const scheduledTime = new Date(Date.now() - 3 * 60 * 60 * 1000);
    scheduledTime.setUTCMinutes(0, 0, 0);
    const task = {
      schedule_id: 17, care_task_id: 3, name: 'Reposition',
      scheduled_time: scheduledTime.toISOString(),
    };
    const payloads = [];
    let completed = false;
    fetch.mockImplementation(async (url, options) => {
      if (url.includes('/api/schedule/daily?')) {
        return { ok: true, json: async () => ({ care_tasks: [{ ...task, completed }] }) };
      }
      if (url === '/api/care-task-schedules/17/complete' && options.method === 'POST') {
        const payload = JSON.parse(options.body);
        payloads.push(payload);
        if (!payload.early_override) {
          return { ok: false, status: 409, json: async () => ({ error: 'late_administration' }) };
        }
        completed = true;
        return { ok: true, json: async () => ({ id: 9 }) };
      }
      return { ok: true, json: async () => ({ care_tasks: TASKS }) };
    });

    await act(async () => { render(<CareTaskModal onClose={() => {}} />); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Mark done' })); });
    expect(screen.getByText('Confirm Late Completion')).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Complete anyway' })); });

    const expected = {
      patient_id: 5,
      scheduled_time: task.scheduled_time,
      notes: 'Completed via live dashboard',
    };
    expect(payloads).toEqual([
      { ...expected, early_override: false },
      { ...expected, early_override: true },
    ]);
    expect(screen.getByText('0 of 1 need attention')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark done' })).not.toBeInTheDocument();
  });
});
