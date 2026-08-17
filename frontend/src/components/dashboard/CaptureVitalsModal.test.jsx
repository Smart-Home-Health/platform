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
// The live dashboard's docked capture panel: the connected snapshot (accepting
// an oximeter reading rather than typing it, and recording that provenance),
// the set-level note, and the dock's expand control.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));
vi.mock('../../config', () => ({
  default: { apiUrl: '' },
  apiFetch: apiFetchMock,
}));

import CaptureVitalsModal from './CaptureVitalsModal';
import { ModalDockProvider } from '../../contexts/ModalDockContext';
import { draftKey } from '../../pages/capture/useCaptureDraft';

const PATIENT = { id: 5, first_name: 'Eli', last_name: 'Carty' };

const jsonResponse = (body, status = 200) => ({
  ok: status < 400, status, json: async () => body,
});

const RANGES = [
  { vital_key: 'spo2', field_key: '', expected_min: 92, expected_max: 100,
    implausible_min: 30, implausible_max: 100, required: false, source: 'default' },
  { vital_key: 'heart_rate', field_key: '', expected_min: 40, expected_max: 180,
    implausible_min: 10, implausible_max: 350, required: false, source: 'default' },
];

let captureBodies;

beforeEach(() => {
  localStorage.clear();
  captureBodies = [];
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation(async (url, options = {}) => {
    if (url.includes('/api/vitals/capture')) {
      captureBodies.push(JSON.parse(options.body));
      return jsonResponse({ status: 'success', saved: [], skipped_duplicates: 0 });
    }
    if (url.includes('/api/vitals/ranges')) return jsonResponse({ patient_id: 5, ranges: RANGES });
    if (url.includes('/api/vitals/custom-definitions')) return jsonResponse([]);
    if (url.includes('/api/status/health')) return jsonResponse({ status: 'ok' });
    return jsonResponse({}, 404);
  });
});

const renderPanel = async ({
  sensorValues = { spo2: 97, bpm: 72 },
  streaming = true,
  dock = { docked: true, expanded: false, toggleExpand: vi.fn() },
  onClose = vi.fn(),
  onSaved = vi.fn(),
} = {}) => {
  const utils = render(
    <ModalDockProvider value={dock}>
      <CaptureVitalsModal
        patient={PATIENT}
        sensorValues={sensorValues}
        streaming={streaming}
        onClose={onClose}
        onSaved={onSaved}
      />
    </ModalDockProvider>
  );
  await act(async () => { await Promise.resolve(); });
  return { ...utils, dock, onClose, onSaved };
};

describe('CaptureVitalsModal', () => {
  it('splits the vitals into a connected snapshot and manual readings', async () => {
    await renderPanel();

    expect(screen.getByText(/connected snapshot/i)).toBeInTheDocument();
    expect(screen.getByText(/manual readings/i)).toBeInTheDocument();
    expect(screen.getByText(/from the pulse ox at encounter time/i)).toBeInTheDocument();

    // Only the two the oximeter can answer for get a "use live" affordance.
    expect(screen.getByLabelText(/Record Oxygen 97% from the pulse ox/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Record Heart Rate 72bpm from the pulse ox/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Record Weight .* from the pulse ox/i)).not.toBeInTheDocument();
  });

  it('records an accepted reading with pulse_ox provenance, not manual', async () => {
    await renderPanel();

    await act(async () => {
      fireEvent.click(screen.getByLabelText(/Record Oxygen 97% from the pulse ox/i));
    });
    expect(screen.getByText(/1 of 6 recorded/i)).toBeInTheDocument();
    expect(screen.getByText(/^Pulse ox · /)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save vitals/i }));
    });
    await waitFor(() => expect(captureBodies).toHaveLength(1));

    expect(captureBodies[0].readings).toEqual([
      expect.objectContaining({ vital_key: 'spo2', value: 97, source: 'pulse_ox' }),
    ]);
  });

  it('freezes the snapshot at open so the accepted number is the one on screen', async () => {
    const { rerender } = await renderPanel({ sensorValues: { spo2: 97, bpm: 72 } });

    // The board keeps ticking underneath.
    rerender(
      <ModalDockProvider value={{ docked: true, expanded: false, toggleExpand: vi.fn() }}>
        <CaptureVitalsModal
          patient={PATIENT}
          sensorValues={{ spo2: 88, bpm: 130 }}
          streaming
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      </ModalDockProvider>
    );
    await act(async () => { await Promise.resolve(); });

    expect(screen.getByLabelText(/Record Oxygen 97% from the pulse ox/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Record Oxygen 88%/i)).not.toBeInTheDocument();
  });

  it('says so when the probe is not streaming rather than implying the values are current', async () => {
    await renderPanel({ streaming: false });
    expect(screen.getByText(/not streaming — these may be stale/i)).toBeInTheDocument();
  });

  it('falls back to hand entry when the oximeter has nothing to offer', async () => {
    await renderPanel({ sensorValues: { spo2: null, bpm: null } });
    expect(screen.getByText(/pulse ox offline — enter these by hand/i)).toBeInTheDocument();
    expect(screen.queryByText(/use live/i)).not.toBeInTheDocument();
  });

  it('carries a set-level note onto every reading', async () => {
    await renderPanel();

    await act(async () => {
      fireEvent.click(screen.getByLabelText(/Record Oxygen 97% from the pulse ox/i));
      fireEvent.click(screen.getByLabelText(/Record Heart Rate 72bpm from the pulse ox/i));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add note/i }));
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/note for this set/i),
        { target: { value: 'Seated, room air.' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save vitals/i }));
    });
    await waitFor(() => expect(captureBodies).toHaveLength(1));

    expect(captureBodies[0].readings).toHaveLength(2);
    for (const r of captureBodies[0].readings) {
      expect(r.note).toBe('Seated, room air.');
    }
  });

  it('clear draft empties the encounter and the stored draft', async () => {
    await renderPanel();

    await act(async () => {
      fireEvent.click(screen.getByLabelText(/Record Oxygen 97% from the pulse ox/i));
    });
    expect(localStorage.getItem(draftKey(5))).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /clear draft/i }));
    });
    expect(screen.getByText(/0 of 6 recorded/i)).toBeInTheDocument();
    expect(localStorage.getItem(draftKey(5))).toBeNull();
  });

  it('offers the expand control while docked and calls back to the host', async () => {
    const toggleExpand = vi.fn();
    await renderPanel({ dock: { docked: true, expanded: false, toggleExpand } });

    const expand = screen.getByRole('button', { name: /expand panel over the charts/i });
    fireEvent.click(expand);
    expect(toggleExpand).toHaveBeenCalledTimes(1);
  });

  it('shows collapse instead once expanded', async () => {
    await renderPanel({ dock: { docked: true, expanded: true, toggleExpand: vi.fn() } });
    expect(screen.getByRole('button', { name: /collapse panel/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /expand panel/i })).not.toBeInTheDocument();
  });

  it('has no expand control when the host is not docking (mobile)', async () => {
    await renderPanel({ dock: { docked: false, expanded: false, toggleExpand: null } });
    expect(screen.queryByRole('button', { name: /expand panel/i })).not.toBeInTheDocument();
  });
});
