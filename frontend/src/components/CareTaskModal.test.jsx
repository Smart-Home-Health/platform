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
// The Dashboard care-task modal's PRN mark-done step after moving off the
// shadcn Dialog/Field/Input onto EntityModal + em-*. The ModalBase shell and
// the schedule view are out of scope here (mocked away).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, within } from '@testing-library/react';

vi.mock('./ModalBase', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('./schedule/DoseScheduleView', () => ({ default: () => null }));
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
