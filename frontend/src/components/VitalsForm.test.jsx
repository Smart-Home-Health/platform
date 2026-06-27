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
// Wave 4 — VitalsForm: blood-pressure both-or-neither validation, the MAP
// calculation in the submitted payload, and cancel/error wiring.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import VitalsForm from './VitalsForm';

const onSave = vi.fn();
const onClose = vi.fn();

const ok = (body = {}) => ({ ok: true, status: 200, json: async () => body, statusText: 'OK' });
const bad = (body = {}, statusText = 'Bad Request') => ({ ok: false, status: 400, json: async () => body, statusText });

beforeEach(() => {
  onSave.mockReset();
  onClose.mockReset();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ id: 1 })));
});

const renderForm = () => render(<VitalsForm onSave={onSave} onClose={onClose} />);
const setValue = (id, value) =>
  fireEvent.change(document.getElementById(id), { target: { value } });
const submit = async () => { await act(async () => { fireEvent.click(screen.getByText('Save Vitals')); }); };

describe('VitalsForm', () => {
  it('rejects a one-sided blood pressure and does not submit', async () => {
    renderForm();
    setValue('systolic', '120'); // diastolic left blank
    await submit();

    // Message renders both inline (validation-error) and in the bottom banner.
    expect(screen.getAllByText(/Both systolic and diastolic/i).length).toBeGreaterThan(0);
    expect(fetch).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('submits a valid payload with a computed MAP and fires onSave', async () => {
    renderForm();
    setValue('systolic', '120');
    setValue('diastolic', '80');
    setValue('body-temp', '98.6');
    await submit();

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = fetch.mock.calls[0];
    expect(String(url)).toContain('/api/vitals/manual');
    expect(opts.method).toBe('POST');
    const payload = JSON.parse(opts.body);
    expect(payload.bp).toEqual({ systolic_bp: 120, diastolic_bp: 80, map_bp: 93 }); // 80 + (120-80)/3
    expect(payload.temp).toEqual({ body_temp: 98.6 });
    expect(onSave).toHaveBeenCalledWith({ id: 1 });
    expect(screen.getByText(/saved successfully/i)).toBeInTheDocument();
  });

  it('clears the inline validation error once the user edits BP again', async () => {
    renderForm();
    setValue('systolic', '120');
    await submit();
    // Both the inline error and the banner are showing.
    expect(screen.getAllByText(/Both systolic and diastolic/i)).toHaveLength(2);

    setValue('diastolic', '80'); // editing BP clears the inline validation error
    // Only the bottom banner remains (handleInputChange clears validationErrors, not error).
    expect(screen.getAllByText(/Both systolic and diastolic/i)).toHaveLength(1);
  });

  it('shows a server error when the request fails', async () => {
    fetch.mockResolvedValueOnce(bad({ message: 'Server exploded' }));
    renderForm();
    setValue('body-temp', '99.1');
    await submit();
    expect(screen.getByText('Server exploded')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('calls onClose from the Cancel button', () => {
    renderForm();
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });
});
