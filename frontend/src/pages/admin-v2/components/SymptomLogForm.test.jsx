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
// SymptomLogForm: required gating, severity bands, recent chips, payload.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));
vi.mock('../../../config', () => ({
  default: { apiUrl: '' },
  apiFetch: apiFetchMock,
}));

import SymptomLogForm from './SymptomLogForm';

const jsonResponse = (body, status = 200) => ({
  ok: status < 400, status, json: async () => body,
});

const PATIENT = { id: 2, first_name: 'Elijah', last_name: 'Carty' };
const TYPES = ['pain', 'cough', 'spasticity', 'nausea'];
const LOCATIONS = ['head', 'chest', 'left_leg'];

const renderForm = async (props = {}) => {
  let out;
  await act(async () => {
    out = render(
      <SymptomLogForm patient={PATIENT} symptomTypes={TYPES}
                      bodyLocations={LOCATIONS} {...props} />
    );
  });
  return out;
};

beforeEach(() => {
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation(async (url) => {
    if (url.includes('/api/symptoms/patient/')) {
      return jsonResponse([
        { id: 1, symptom_type: 'spasticity' },
        { id: 2, symptom_type: 'cough' },
        { id: 3, symptom_type: 'spasticity' },
        { id: 4, symptom_type: 'pain' },
      ]);
    }
    if (url.includes('/api/symptoms')) return jsonResponse({ id: 9 });
    return jsonResponse({}, 404);
  });
});

describe('SymptomLogForm', () => {
  it('gates logging on the required symptom type', async () => {
    await renderForm();
    expect(screen.getByText(/1 required field/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Log symptom/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Select symptom/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Pain' }));
    expect(screen.getByText(/Ready to log/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Log symptom/i })).toBeEnabled();
  });

  it('shows deduped recent choices and selects from a chip', async () => {
    await renderForm();
    const chips = screen.getAllByRole('button', { name: /Spasticity|Cough|Pain/ })
      .filter((b) => b.className.includes('sl-chip'));
    expect(chips.map((c) => c.textContent.trim())).toEqual(['Spasticity', 'Cough', 'Pain']);
    fireEvent.click(chips[0]);
    expect(screen.getByText(/Ready to log/i)).toBeInTheDocument();
  });

  it('maps severity to clinical bands', async () => {
    await renderForm();
    // the legend also says "Moderate", so read the band element directly
    const band = () => document.querySelector('.sl-severity-band').textContent.trim();
    expect(band()).toBe('Moderate'); // default 5
    fireEvent.click(screen.getByRole('radio', { name: '9' }));
    expect(band()).toBe('Severe');
    fireEvent.click(screen.getByRole('radio', { name: '2' }));
    expect(band()).toBe('Mild');
    fireEvent.click(screen.getByRole('radio', { name: '0' }));
    expect(band()).toBe('None');
  });

  it('posts the mapped payload and resets', async () => {
    await renderForm();
    fireEvent.click(screen.getByRole('button', { name: /Select symptom/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Cough' }));
    fireEvent.click(screen.getByRole('radio', { name: '7' }));
    fireEvent.change(screen.getByPlaceholderText(/Describe what you observed/i),
                     { target: { value: 'wet cough after feed' } });
    fireEvent.click(screen.getByLabelText(/Symptom still active/i));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Log symptom/i }));
    });

    const post = apiFetchMock.mock.calls.find((call) => call[1]?.method === 'POST');
    const body = JSON.parse(post[1].body);
    expect(body).toMatchObject({
      patient_id: 2,
      symptom_type: 'cough',
      severity: 7,
      description: 'wet cough after feed',
      notes: null,
      is_resolved: true, // unchecked "still active"
    });
    expect(screen.getByText(/Symptom logged · Cough/i)).toBeInTheDocument();
    // reset back to gated state
    expect(screen.getByText(/1 required field/i)).toBeInTheDocument();
  });

  it('filters the type sheet by search', async () => {
    await renderForm();
    fireEvent.click(screen.getByRole('button', { name: /Select symptom/i }));
    fireEvent.change(screen.getByPlaceholderText(/Search symptoms/i),
                     { target: { value: 'naus' } });
    expect(screen.getByRole('button', { name: 'Nausea' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pain' })).not.toBeInTheDocument();
  });
});
