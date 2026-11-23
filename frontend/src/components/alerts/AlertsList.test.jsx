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
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ModalDockProvider } from '../../contexts/ModalDockContext';
import AlertsList from './AlertsList';

afterEach(() => vi.unstubAllGlobals());

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
