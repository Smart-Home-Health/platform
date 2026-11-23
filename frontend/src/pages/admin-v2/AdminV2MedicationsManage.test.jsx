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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { localTimeAndDaysToUTC, localTimeToUTC } from '../../utils/timezone';
import AdminV2MedicationsManage from './AdminV2MedicationsManage';

vi.mock('./AdminV2Layout', () => ({ default: ({ children }) => children }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { is_system_admin: true } }) }));
vi.mock('../../contexts/AdminPatientContext', () => {
  const patients = [{ id: 1, first_name: 'Pat', last_name: 'Green' }, { id: 2, first_name: 'Lee', last_name: 'Gray' }];
  return { useAdminPatient: () => ({ patients, selectedPatient: patients[0] }) };
});

const button = name => screen.getByRole('button', { name });
const change = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const weekly = (time, days) => {
  const utc = localTimeAndDaysToUTC(time, days);
  return `${utc.minute} ${utc.hour} * * ${utc.days.join(',')}`;
};

const json = (data, ok = true) => ({ ok, json: async () => data });

async function manage(cron, { rejectFirst = false } = {}) {
  const schedule = {
    id: 73, cron_expression: cron, description: 'Evening routine', dose_amount: 1.25,
    grace_period_hours: 4.5, patient_id: 2, active: false, notes: 'Existing note',
  };
  const medication = {
    id: 11, name: 'Test medication', quantity_unit: 'tablets', is_global: true, active: true,
    schedules: [schedule],
  };
  const writes = [];
  vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
    if (options.method === 'PUT' || options.method === 'POST') {
      const payload = JSON.parse(options.body);
      writes.push({ method: options.method, path: new URL(url, 'http://test').pathname, payload });
      if (rejectFirst && writes.length === 1) return json({ detail: [{ msg: 'Could not save this dose' }] }, false);
      if (options.method === 'PUT') Object.assign(schedule, payload);
      else medication.schedules.push({ id: 74, active: true, ...payload });
      return json({ status: 'success', id: options.method === 'POST' ? 74 : undefined });
    }
    if (url.includes('/admin/medications/active')) return json(structuredClone([medication]));
    if (url.includes('/pharmacies')) return json({ pharmacies: [] });
    return json([]);
  }));
  render(<MemoryRouter initialEntries={['/?patient=1']}><AdminV2MedicationsManage /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Actions for Test medication' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Manage schedules (1)' }));
  fireEvent.click(button('Edit'));
  return writes;
}

afterEach(() => vi.unstubAllGlobals());

describe('editing a medication schedule', () => {
  it('loads the assigned patient and local weekdays, then updates the same paused row', async () => {
    const writes = await manage(weekly('22:00', [0, 3]));
    expect(screen.getByLabelText(/^Patient/)).toHaveValue('2');
    expect(screen.getByLabelText('Time')).toHaveValue('22:00');
    expect(button('Sun')).toHaveAttribute('aria-pressed', 'true');
    expect(button('Wed')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText(/Dose Amount/)).toHaveValue(1.25);
    expect(screen.getByLabelText(/Grace period/)).toHaveValue(4.5);
    fireEvent.click(button('Sun'));
    change('Time', '23:15');
    change(/Dose Amount/, '0.5');
    change(/Grace period/, '');
    fireEvent.click(button('Save Changes'));

    const edit = await screen.findByRole('button', { name: 'Edit' });
    const row = within(edit.closest('tr'));
    expect(row.getByText('23:15')).toBeInTheDocument();
    expect(row.getByText('Wed')).toBeInTheDocument();
    expect(row.getByText('Paused')).toBeInTheDocument();
    expect(row.getByText('Default')).toBeInTheDocument();
    expect(row.getByText('Lee Gray')).toBeInTheDocument();
    expect(writes).toEqual([{ method: 'PUT', path: '/api/schedules/73', payload: {
      cron_expression: weekly('23:15', [3]), description: 'Wed at 23:15', dose_amount: 0.5, grace_period_hours: null,
    } }]);
  });

  it('cancels a monthly edit, reopens with stored values, and still adds a separate schedule', async () => {
    const writes = await manage('30 14 31 * *');
    expect(screen.getByLabelText(/Day of Month/)).toHaveValue('31');
    change(/Day of Month/, '9');
    fireEvent.click(button('Cancel'));
    expect(writes).toHaveLength(0);
    expect(button('Edit')).toHaveFocus();
    fireEvent.click(button('Edit'));
    expect(screen.getByLabelText(/Day of Month/)).toHaveValue('31');
    change(/Day of Month/, '5');
    fireEvent.click(button('Save Changes'));
    await screen.findByText('Day 5 monthly (UTC)');
    expect(writes[0].payload.cron_expression).toBe('30 14 5 * *');
    expect(screen.getByLabelText(/^Patient/)).toHaveValue('1');
    expect(screen.getByLabelText(/Grace period/)).toHaveValue(null);
    fireEvent.click(button('Fri'));
    fireEvent.click(button('Add Schedule'));
    await screen.findByText('Fri', { selector: 'td' });
    expect(writes[1]).toMatchObject({ method: 'POST', path: '/api/add/schedule/11', payload: { patient_id: 1 } });
    expect(await screen.findAllByRole('button', { name: 'Edit' })).toHaveLength(2);
  });

  it('keeps daily timing intact for dose-only edits', async () => {
    const utc = localTimeToUTC('22:00');
    const writes = await manage(`${utc.minute} ${utc.hour} * * *`);
    for (const day of ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) {
      expect(button(day)).toHaveAttribute('aria-pressed', 'true');
    }
    change(/Dose Amount/, '2');
    fireEvent.click(button('Save Changes'));
    await screen.findByText('Daily');
    expect(writes[0].payload).toEqual({ dose_amount: 2 });
  });

  it('preserves custom recurrence and the draft after a failed save and allows retry', async () => {
    const writes = await manage('0 8,16 * * 1-5', { rejectFirst: true });
    expect(button('Custom')).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByLabelText('Time')).toBeNull();
    change(/Dose Amount/, '0');
    expect(button('Save Changes')).toBeDisabled();
    change(/Dose Amount/, '1.5');
    fireEvent.click(button('Save Changes'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save this dose');
    expect(screen.getByLabelText(/Dose Amount/)).toHaveValue(1.5);
    fireEvent.click(button('Save Changes'));
    await screen.findByRole('button', { name: 'Edit' });
    expect(writes.map(w => w.payload)).toEqual([{ dose_amount: 1.5 }, { dose_amount: 1.5 }]);
  });
});
