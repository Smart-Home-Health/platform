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
// VitalsCapturePage: save-button tri-state vs required flags, the recorded
// counter, draft resume/discard, save flow (clears the draft) and the
// 409 stale-ranges recovery path.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));
vi.mock('../../config', () => ({
  default: { apiUrl: '' },
  apiFetch: apiFetchMock,
}));

const { patientCtx } = vi.hoisted(() => ({
  patientCtx: {
    patients: [{ id: 5, first_name: 'Eli', last_name: 'Carty' }],
    selectedPatient: { id: 5, first_name: 'Eli', last_name: 'Carty' },
    selectPatient: vi.fn(),
  },
}));
vi.mock('../../contexts/AdminPatientContext', () => ({
  useAdminPatient: () => patientCtx,
}));

import VitalsCapturePage from './VitalsCapturePage';
import { draftKey } from './useCaptureDraft';

const jsonResponse = (body, status = 200) => ({
  ok: status < 400, status, json: async () => body,
});

const RANGES = [
  { vital_key: 'spo2', field_key: '', expected_min: 92, expected_max: 100,
    implausible_min: 30, implausible_max: 100, required: true, source: 'patient' },
  { vital_key: 'heart_rate', field_key: '', expected_min: 40, expected_max: 180,
    implausible_min: 10, implausible_max: 350, required: false, source: 'default' },
];

let captureResponses;

const routeFetches = ({ ranges = RANGES } = {}) => {
  apiFetchMock.mockImplementation(async (url, options = {}) => {
    if (url.includes('/api/vitals/capture')) {
      const next = captureResponses.shift() || jsonResponse({ status: 'success', saved: [] });
      return { ...next, requestBody: options.body };
    }
    if (url.includes('/api/vitals/ranges')) return jsonResponse({ patient_id: 5, ranges });
    if (url.includes('/api/vitals/custom-definitions')) return jsonResponse([]);
    if (url.includes('/api/status/health')) return jsonResponse({ status: 'ok' });
    return jsonResponse({}, 404);
  });
};

const renderPage = async () => {
  await act(async () => {
    render(<MemoryRouter><VitalsCapturePage /></MemoryRouter>);
  });
};

const enterVital = async (tileName, digits) => {
  fireEvent.click(screen.getByRole('button', { name: tileName }));
  for (const d of digits) fireEvent.click(screen.getByRole('button', { name: d }));
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Add reading/i }));
  });
};

beforeEach(() => {
  apiFetchMock.mockReset();
  localStorage.clear();
  captureResponses = [];
  routeFetches();
});

describe('VitalsCapturePage', () => {
  it('walks save through disabled -> neutral -> primary as required vitals land', async () => {
    await renderPage();
    const save = screen.getByRole('button', { name: /Save vitals/i });
    expect(save).toBeDisabled();

    await enterVital(/Heart Rate, not recorded/i, ['7', '2']);
    expect(screen.getByRole('button', { name: /Save vitals/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Save vitals/i }).className)
      .toContain('neutral');
    expect(screen.getByText(/1 required reading remaining/i)).toBeInTheDocument();

    await enterVital(/Oxygen, not recorded/i, ['9', '8']);
    expect(screen.getByRole('button', { name: /Save vitals/i }).className)
      .toContain('primary');
    expect(screen.getByText(/2 of 6 recorded · All required complete/i)).toBeInTheDocument();
  });

  it('saves the encounter, clears the draft, and resets the grid', async () => {
    captureResponses = [jsonResponse({ status: 'success', saved: [{}] })];
    await renderPage();
    await enterVital(/Heart Rate, not recorded/i, ['7', '2']);
    expect(localStorage.getItem(draftKey(5))).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save vitals/i }));
    });

    expect(screen.getByText(/Vitals saved · 1 reading/i)).toBeInTheDocument();
    expect(localStorage.getItem(draftKey(5))).toBeNull();
    const captureCall = apiFetchMock.mock.calls.find(([u]) => u.includes('/capture'));
    const body = JSON.parse(captureCall[1].body);
    expect(body.patient_id).toBe(5);
    expect(body.readings).toEqual([expect.objectContaining({
      vital_key: 'heart_rate', value: 72, source: 'manual',
      confirmed_against_warning: false,
    })]);
    // Grid reset: heart rate is unrecorded again
    expect(screen.getByRole('button', { name: /Heart Rate, not recorded/i })).toBeInTheDocument();
  });

  it('offers to resume a fresh draft and discards on request', async () => {
    localStorage.setItem(draftKey(5), JSON.stringify({
      encounterUid: 'draft-uid-1234', startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      readings: { heart_rate: { vitalKey: 'heart_rate', value: 70, unit: 'bpm',
                                measuredAt: new Date().toISOString() } },
    }));
    await renderPage();
    expect(screen.getByText(/Unsaved readings from/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Resume/i }));
    expect(screen.getByRole('button', { name: /Heart Rate, recorded/i })).toBeInTheDocument();
    expect(screen.getByText(/1 of 6 recorded/i)).toBeInTheDocument();
  });

  it('treats a draft without a valid updatedAt as stale', async () => {
    localStorage.setItem(draftKey(5), JSON.stringify({
      encounterUid: 'draft-uid-1234', startedAt: new Date().toISOString(),
      readings: { heart_rate: { vitalKey: 'heart_rate', value: 70, unit: 'bpm',
                                measuredAt: new Date().toISOString() } },
    }));
    await renderPage();
    expect(screen.queryByText(/Unsaved readings from/i)).not.toBeInTheDocument();
    expect(localStorage.getItem(draftKey(5))).toBeNull();
  });

  it('discarding a draft removes it from storage', async () => {
    localStorage.setItem(draftKey(5), JSON.stringify({
      encounterUid: 'draft-uid-1234', startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      readings: { heart_rate: { vitalKey: 'heart_rate', value: 70, unit: 'bpm',
                                measuredAt: new Date().toISOString() } },
    }));
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Discard/i }));
    expect(localStorage.getItem(draftKey(5))).toBeNull();
    expect(screen.queryByText(/Unsaved readings from/i)).not.toBeInTheDocument();
  });

  it('reopens the offending sheet when the server rejects with 409', async () => {
    captureResponses = [jsonResponse({
      detail: { code: 'confirmation_required',
                warnings: [{ vital_key: 'heart_rate', field_key: '', value: 72,
                             expected_min: 80, expected_max: 120 }] },
    }, 409)];
    await renderPage();
    await enterVital(/Heart Rate, not recorded/i, ['7', '2']);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save vitals/i }));
    });
    expect(screen.getByText(/One reading needs another look/i)).toBeInTheDocument();
    // The heart-rate sheet is open again for re-entry
    await waitFor(() => {
      expect(screen.getByText(/Enter the pulse rate/i)).toBeInTheDocument();
    });
  });
});
