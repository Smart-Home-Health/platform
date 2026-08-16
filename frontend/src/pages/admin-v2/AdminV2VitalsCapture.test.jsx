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
// AdminV2VitalsCapture: the capture panel embedded in the admin shell.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

vi.mock('./AdminV2Layout', () => ({ default: ({ children }) => <div>{children}</div> }));

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));
vi.mock('../../config', () => ({
  default: { apiUrl: '' },
  apiFetch: apiFetchMock,
}));

const { patientCtx } = vi.hoisted(() => ({
  patientCtx: { selectedPatient: { id: 5, first_name: 'Eli', last_name: 'Carty' } },
}));
vi.mock('../../contexts/AdminPatientContext', () => ({
  useAdminPatient: () => patientCtx,
}));

import AdminV2VitalsCapture from './AdminV2VitalsCapture';

const jsonResponse = (body) => ({ ok: true, status: 200, json: async () => body });

beforeEach(() => {
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation(async (url) => {
    if (url.includes('/api/vitals/ranges')) return jsonResponse({ patient_id: 5, ranges: [] });
    if (url.includes('/api/vitals/custom-definitions')) {
      return jsonResponse([{ id: 9, name: 'peak_flow', unit: 'L/min', display_label: 'Peak flow' }]);
    }
    if (url.includes('/api/status/health')) return jsonResponse({ status: 'ok' });
    return jsonResponse({});
  });
});

describe('AdminV2VitalsCapture', () => {
  it('renders the capture grid (incl. custom vitals) inside the admin shell', async () => {
    await act(async () => {
      render(<AdminV2VitalsCapture />);
    });
    expect(document.querySelector('.vitals-capture.vc-embedded')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Heart Rate, not recorded/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Peak flow, not recorded/i })).toBeInTheDocument();
    // No standalone chrome: no bottom tab bar, no page-level header
    expect(screen.queryByRole('navigation', { name: /Capture sections/i })).not.toBeInTheDocument();
  });

  it('shows the sidebar empty state without a selected patient', async () => {
    patientCtx.selectedPatient = null;
    await act(async () => {
      render(<AdminV2VitalsCapture />);
    });
    expect(screen.getByText(/select a patient from the sidebar/i)).toBeInTheDocument();
    patientCtx.selectedPatient = { id: 5, first_name: 'Eli', last_name: 'Carty' };
  });
});
