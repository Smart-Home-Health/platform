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
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ModalDockProvider } from '../../contexts/ModalDockContext';
import AlertsList from './AlertsList';
import AlertDetailInline from '../AlertDetailInline';

afterEach(() => vi.unstubAllGlobals());

it('reads the completed chart window again if Inspect opened before its final readings arrived', async () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date('2026-11-24T17:46:08Z'));
    const request = vi.fn(async () => ({ ok: true, json: async () => [] }));
    vi.stubGlobal('fetch', request);
    await act(async () => {
      render(<AlertDetailInline alert={{ id: 5, start_time: '2026-11-24T17:45:13Z',
        end_time: '2026-11-24T17:46:07Z', chart_end_time: '2026-11-24T17:46:37Z' }} />);
    });
    expect(request).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(request).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(request).toHaveBeenCalledTimes(2);
  } finally {
    vi.useRealTimers();
  }
});

it.each([false, true])('shows the event low and HR range in the list and Inspect (expanded=%s)', async expanded => {
  const alert = {
    id: 5, patient_id: 2, start_time: '2026-11-23T15:00:00Z',
    event_end_time: '2026-11-23T15:00:39Z', end_time: '2026-11-23T15:01:09Z',
    spo2_min: 82, spo2_max: 97, bpm_min: 79, bpm_max: 114,
  };
  vi.stubGlobal('fetch', vi.fn(async url => {
    if (url.includes('/clips/status')) return { status: 404 };
    return { ok: true, json: async () => url.endsWith('/data') ? [] : [alert] };
  }));
  render(<ModalDockProvider value={{ expanded }}><AlertsList patientId={2} /></ModalDockProvider>);

  expect(await screen.findByText('82%')).toBeVisible();
  expect(screen.getByText('79–114 bpm')).toBeVisible();
  expect(screen.getByText('39s')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: expanded ? 'Pulse ox alert' : 'Inspect' }));
  const detail = (await screen.findByRole('heading', { name: 'Episode detail' })).closest('.al-detail');
  expect(within(detail).getByText('Lowest SpO₂')).toBeVisible();
  expect(within(detail).getByText('82%')).toBeVisible();
  expect(within(detail).getByText('79–114 BPM')).toBeVisible();
  await within(detail).findByText('No data available for this event');
});
