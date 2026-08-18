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
// The bathroom sheet's rules: the minimum valid log is time + location +
// urine/stool, catheter needs a real volume, and only the sections that apply
// to what was selected are on screen.
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import OutputSheet from './OutputSheet';
import { nutritionService } from '../../services/nutrition';

vi.mock('../../services/nutrition', () => ({
  nutritionService: {
    outputTypes: vi.fn(() => Promise.resolve({
      color_types: ['brown', 'green'],
      clarity_types: ['clear', 'cloudy'],
    })),
    createOutputEvent: vi.fn(() => Promise.resolve({ event_group_id: 'g1', outputs: [] })),
    updateOutput: vi.fn(() => Promise.resolve({})),
  },
}));

const patient = { id: 5, first_name: 'Test', last_name: 'Testerson' };

const setup = (props = {}) => {
  const onSaved = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <OutputSheet open patient={patient} onSaved={onSaved} onClose={onClose} {...props} />,
  );
  return { ...utils, onSaved, onClose };
};

const clickText = (text) => fireEvent.click(screen.getByText(text));
// The summary preview echoes 'Urine'/'Stool', so address the controls by role.
const toggle = (name) => screen.getByRole('button', { name });
const locationTab = (name) => screen.getByRole('radio', { name });
const clickToggle = (name) => fireEvent.click(toggle(name));
const logButton = () => screen.getByText('Log output').closest('button');

beforeEach(() => vi.clearAllMocks());

describe('OutputSheet', () => {
  it('cannot save until urine or stool is picked', () => {
    setup();
    // Location defaults to Restroom, so only the output choice is missing.
    expect(logButton()).toBeDisabled();
    clickToggle('Urine');
    expect(logButton()).not.toBeDisabled();
  });

  it('treats urine and stool as independent, not either/or', () => {
    setup();
    clickToggle('Urine');
    clickToggle('Stool');
    expect(toggle('Urine')).toHaveAttribute('aria-pressed', 'true');
    expect(toggle('Stool')).toHaveAttribute('aria-pressed', 'true');
  });

  it('only shows the detail sections that apply', () => {
    setup();
    // Nothing picked yet — no stool or urine detail on screen.
    expect(screen.queryByText('Amount')).not.toBeInTheDocument();
    expect(screen.queryByText('Appearance')).not.toBeInTheDocument();

    clickToggle('Stool');
    expect(screen.getByText('Amount')).toBeInTheDocument();       // stool card
    expect(screen.queryByText('Appearance')).not.toBeInTheDocument();

    clickToggle('Urine');
    expect(screen.getByText('Appearance')).toBeInTheDocument();   // urine card
  });

  it('offers wetness for a diaper rather than a made-up volume', () => {
    setup();
    clickText('Diaper');
    clickToggle('Urine');
    expect(screen.getByText('Wetness')).toBeInTheDocument();
    // A number is available, but only if someone actually weighed it.
    expect(screen.queryByLabelText('Volume unit')).not.toBeInTheDocument();
    clickText('Add measured weight or volume');
    expect(screen.getByText('Measured volume')).toBeInTheDocument();
  });

  it('defaults catheter to urine and blocks saving without a volume', async () => {
    setup();
    clickText('Catheter');

    await waitFor(() => {
      expect(toggle('Urine')).toHaveAttribute('aria-pressed', 'true');
    });
    expect(toggle('Stool')).toHaveAttribute('aria-pressed', 'false');

    // Urine is selected, but the measured volume catheter logging exists for
    // is still missing.
    expect(logButton()).toBeDisabled();

    clickText('More urine details');
    fireEvent.change(screen.getByPlaceholderText('Measured volume'), { target: { value: '350' } });
    expect(logButton()).not.toBeDisabled();
  });

  it('prefills a whole event from a quick log', () => {
    setup();
    clickText('Mixed diaper');
    expect(toggle('Urine')).toHaveAttribute('aria-pressed', 'true');
    expect(toggle('Stool')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Type 4/)).toBeInTheDocument();
  });

  it('submits one event carrying both halves', async () => {
    const { onSaved } = setup();
    clickText('Diaper');
    clickToggle('Urine');
    clickToggle('Stool');
    clickText('Blood');
    fireEvent.click(logButton());

    await waitFor(() => expect(nutritionService.createOutputEvent).toHaveBeenCalled());
    const event = nutritionService.createOutputEvent.mock.calls[0][0];

    expect(event.patient_id).toBe(5);
    expect(event.location).toBe('diaper');
    expect(event.has_blood).toBe(true);
    // Both halves travel in ONE request, so the event cannot half-save.
    expect(event.urine).toBeTruthy();
    expect(event.stool).toBeTruthy();
    expect(onSaved).toHaveBeenCalled();
  });

  it('records the Bristol number the caregiver picked', async () => {
    setup();
    clickToggle('Stool');
    fireEvent.click(screen.getByTitle(/Bristol type 6/));
    expect(screen.getByText(/Type 6/)).toBeInTheDocument();
    fireEvent.click(logButton());

    await waitFor(() => expect(nutritionService.createOutputEvent).toHaveBeenCalled());
    expect(nutritionService.createOutputEvent.mock.calls[0][0].stool.bristol_scale).toBe(6);
  });

  it('keeps the sheet open on Save + another', async () => {
    const { onClose, onSaved } = setup();
    clickText('Diaper');
    clickToggle('Urine');
    fireEvent.click(screen.getByText('Save + another'));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
    // Location carries over so a run of changes stays quick...
    expect(locationTab('Diaper')).toHaveAttribute('aria-checked', 'true');
    // ...but the entry itself is cleared.
    expect(toggle('Urine')).toHaveAttribute('aria-pressed', 'false');
  });

  it('states the time and keeps the picker behind Edit', () => {
    setup();
    // The common case is "now", so no datetime field is in the way.
    expect(document.getElementById('output-when')).toBeNull();
    expect(screen.getByText('Now')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Edit'));
    expect(document.getElementById('output-when')).not.toBeNull();
  });

  it('still submits a back-dated time', async () => {
    setup();
    clickToggle('Urine');
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.change(document.getElementById('output-when'), {
      target: { value: '2026-08-18T09:30' },
    });
    fireEvent.click(logButton());

    await waitFor(() => expect(nutritionService.createOutputEvent).toHaveBeenCalled());
    const sent = new Date(nutritionService.createOutputEvent.mock.calls[0][0].occurred_at);
    expect(sent.getHours()).toBe(9);
    expect(sent.getMinutes()).toBe(30);
  });

  it('edits an existing row without turning it into a new event', async () => {
    const editing = {
      id: 42,
      output_type: 'bowel',
      location: 'diaper',
      is_diaper: true,
      occurred_at: '2026-08-18T14:18:00Z',
      bristol_scale: 4,
      amount_unit: 'medium',
      color: 'brown',
      straining: true,
    };
    setup({ editing });

    expect(screen.getByText('Save changes')).toBeInTheDocument();
    // Save + another belongs to logging, not editing.
    expect(screen.queryByText('Save + another')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Save changes'));
    await waitFor(() => expect(nutritionService.updateOutput).toHaveBeenCalled());
    const [id, payload] = nutritionService.updateOutput.mock.calls[0];
    expect(id).toBe(42);
    expect(payload.bristol_scale).toBe(4);
    expect(nutritionService.createOutputEvent).not.toHaveBeenCalled();
  });

  it('maps a legacy consistency onto the Bristol scale when editing', () => {
    setup({
      editing: {
        id: 7, output_type: 'bowel', occurred_at: '2026-08-18T14:18:00Z',
        consistency: 'watery', location: 'restroom',
      },
    });
    // 'watery' predates the scale; it reads as type 7.
    expect(screen.getByText(/Type 7/)).toBeInTheDocument();
  });
});
