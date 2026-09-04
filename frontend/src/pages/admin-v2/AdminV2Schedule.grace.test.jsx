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
// The /care/schedule grid with a grace-period dose: a prior day's unfilled
// dose the backend still returns as actionable. It carries an "Overdue" badge
// and sits above today's rows in its hour.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, within } from '@testing-library/react';

vi.mock('./AdminV2Layout', () => ({ default: ({ children }) => <div>{children}</div> }));

const { authCtx, patientCtx } = vi.hoisted(() => ({
  authCtx: { user: { id: 1, is_system_admin: true, permissions: [] } },
  patientCtx: {
    selectedPatient: { id: 5, first_name: 'Eli', last_name: 'Carty' },
    patients: [], selectPatient: () => {},
  },
}));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authCtx }));
vi.mock('../../contexts/AdminPatientContext', () => ({ useAdminPatient: () => patientCtx }));
vi.mock('react-router-dom', () => ({ useSearchParams: () => [new URLSearchParams(), () => {}] }));
vi.mock('../../config', () => ({ default: { apiUrl: '' } }));

import AdminV2Schedule from './AdminV2Schedule';

// Both doses land in the same local hour today; the grace one was due three
// days ago at :30, the plain one today at :00 — minute order alone would put
// the plain row first.
const todayAt = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d; };
const NOW_HOUR = 10;
const graceDue = new Date(todayAt(NOW_HOUR, 30).getTime() - 3 * 86400000);
const plainDue = todayAt(NOW_HOUR, 0);
const graceUntil = new Date(graceDue.getTime() + 100.8 * 3600000);

const med = (over) => ({
  schedule_id: 1, medication_id: 11, name: 'Ojemda', dose_amount: 1, dose_unit: 'tablet',
  description: 'weekly', completed: false, skipped: false, completed_at: null, completed_by: null,
  is_prn: false, log_id: null, is_yesterday: false, in_grace: false, grace_expires_at: null,
  overdue_minutes: null, type: 'medication', ...over,
});

const DAILY = {
  date: new Date().toISOString().slice(0, 10), patient_id: 5, nutrition: [], care_tasks: [],
  medications: [
    med({ schedule_id: 2, medication_id: 12, name: 'Baclofen', scheduled_time: plainDue.toISOString() }),
    med({
      name: 'Ojemda', scheduled_time: graceDue.toISOString(), in_grace: true,
      grace_expires_at: graceUntil.toISOString(), overdue_minutes: 3 * 1440,
    }),
  ],
};

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    if (url.includes('/api/schedule/daily')) return { ok: true, status: 200, json: async () => DAILY };
    return { ok: true, status: 200, json: async () => [] };
  }));
});

describe('AdminV2Schedule grace-period doses', () => {
  it('badges the overdue dose with how far past it is and explains the grace on hover', async () => {
    await act(async () => { render(<AdminV2Schedule />); });
    const badge = await screen.findByText('Overdue · 3d');
    expect(badge).toHaveClass('admin-v2-badge-overdue');
    expect(badge.title).toMatch(/^Originally due .*; grace expires /);
    // Only the grace row is badged.
    expect(screen.getAllByText(/^Overdue/)).toHaveLength(1);
  });

  it('pins the overdue dose above today\'s rows in its hour and keeps it actionable', async () => {
    await act(async () => { render(<AdminV2Schedule />); });
    await screen.findByText('Overdue · 3d');
    const hourRow = document.querySelector(`[data-hour="${NOW_HOUR}"]`);
    const names = within(hourRow).getAllByText(/^(Ojemda|Baclofen)$/).map(n => n.textContent);
    expect(names).toEqual(['Ojemda', 'Baclofen']);
    const row = screen.getByText('Ojemda').closest('.admin-v2-schedule-item');
    expect(row).toHaveClass('clickable');
    expect(row).not.toHaveClass('completed');
  });
});
