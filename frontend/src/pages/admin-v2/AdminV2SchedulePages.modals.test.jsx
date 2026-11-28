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
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, within } from '@testing-library/react';

vi.mock('./AdminV2Layout', () => ({ default: ({ children }) => <div>{children}</div> }));

const { authCtx, patientCtx } = vi.hoisted(() => ({
  authCtx: { user: { id: 1, is_system_admin: true, permissions: [] } },
  patientCtx: {
    selectedPatient: { id: 5, first_name: 'Eli', last_name: 'Carty' },
    patients: [{ id: 5, first_name: 'Eli', last_name: 'Carty' }],
    selectPatient: () => {},
    loadingPatients: false,
  },
}));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authCtx }));
vi.mock('../../contexts/AdminPatientContext', () => ({ useAdminPatient: () => patientCtx }));
vi.mock('react-router-dom', () => ({
  Link: ({ to, children }) => <a href={to}>{children}</a>,
  useSearchParams: () => [new URLSearchParams('patient=5'), () => {}],
}));
vi.mock('../../config', () => ({ default: { apiUrl: '' }, apiFetch: (...args) => fetch(...args) }));

import AdminV2Schedule, { DailySchedule } from './AdminV2Schedule';
import AdminV2Medications from './AdminV2Medications';
import { getLocalDateTimeString } from '../../utils/timezone';

const dailyCalls = () => fetch.mock.calls.filter(([url]) => url.includes('/api/schedule/daily')).map(([url]) => new URL(url, 'http://test').searchParams);
const baseRow = () => ({ schedule_id: 8, scheduled_time: new Date().toISOString() });
const showSchedule = async (category) => {
  await act(async () => { render(<AdminV2Schedule category={category} />); });
};
function stubSchedule(rows, write = { success: true }) {
  vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => ({
    ok: true, status: 200,
    json: async () => options.method === 'POST' ? write : url.includes('/api/schedule/daily') ? rows : {},
  })));
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  authCtx.user = { id: 1, is_system_admin: true, permissions: [] };
  stubSchedule({});
});

describe('section schedules', () => {
  it.each([
    ['medications', 'Medication row', 'medications'],
    ['nutrition', 'Feed row', 'nutrition'],
    ['care_tasks', 'Task row', 'tasks'],
  ])('shows only %s and keeps the category when changing days', async (category, visible, css) => {
    const names = ['Medication row', 'Feed row', 'Task row'];
    const row = baseRow();
    stubSchedule({
      medications: [{ ...row, name: names[0] }],
      nutrition: [{ ...row, name: names[1] }],
      care_tasks: [{ ...row, name: names[2] }],
    });
    await showSchedule(category);
    expect(screen.getByText(visible)).toBeInTheDocument();
    for (const hidden of names.filter(n => n !== visible)) expect(screen.queryByText(hidden)).toBeNull();
    expect(document.querySelectorAll('.admin-v2-schedule-header .admin-v2-schedule-col')).toHaveLength(1);
    expect(document.querySelector('.admin-v2-schedule-header .admin-v2-schedule-col')).toHaveClass(css);
    expect(document.querySelector('.admin-v2-schedule-stats')).toBeNull();
    if (category !== 'nutrition') {
      expect(screen.queryByText('Manage routines')).toBeNull();
      expect(fetch.mock.calls.some(([url]) => url.includes('schedule-manager'))).toBe(false);
    }
    const today = dailyCalls()[0].get('target_date');
    await act(async () => { fireEvent.click(screen.getByTitle('Previous Day')); });
    const previous = dailyCalls().at(-1).get('target_date');
    expect(previous < today).toBe(true);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Go to Today' })); });
    expect(dailyCalls().at(-1).get('target_date')).toBe(today);
    const picker = screen.getByLabelText('Schedule date');
    fireEvent.change(picker, { target: { value: '' } });
    expect(picker.value).toBe(today);
    await act(async () => { fireEvent.change(picker, { target: { value: '2026-01-15' } }); });
    await act(async () => { fireEvent.click(screen.getByTitle('Next Day')); });
    expect(dailyCalls().at(-1).get('target_date')).toBe('2026-01-16');
    for (const query of dailyCalls()) {
      expect(query.get('category')).toBe(category);
      expect(query.get('patient_id')).toBe('5');
      expect(query.get('include_prior_day')).toBe(category === 'nutrition' ? 'true' : null);
    }
  });

  it('keeps a past-due grace medication separate from the selected day', async () => {
    const row = { ...baseRow(), name: 'Grace dose', in_grace: true, overdue_minutes: 120 };
    stubSchedule({ medications: [row] });
    await showSchedule('medications');
    expect(document.querySelector('[data-band="overdue"]')).toContainElement(screen.getByText('Grace dose'));
  });

  it('opens a focused occurrence from the keyboard without a history button', async () => {
    stubSchedule({ medications: [{ ...baseRow(), medication_id: 22, name: 'Morning dose' }] });
    await showSchedule('medications');
    const row = screen.getByText('Morning dose').closest('.admin-v2-schedule-item');
    expect(within(row).queryByRole('button', { name: 'Recent history' })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.keyDown(row, { key: ' ' });
    expect(screen.getByRole('dialog', { name: 'Complete Medication' })).toBeInTheDocument();
  });

  it('keeps the embedded day selection while suspending requests in a hidden panel', async () => {
    const view = (active) => <DailySchedule patient={patientCtx.selectedPatient} category="medications" active={active} />;
    const { rerender } = render(view(false));
    expect(dailyCalls()).toHaveLength(0);
    await act(async () => { rerender(view(true)); });
    await act(async () => { fireEvent.click(screen.getByTitle('Previous Day')); });
    const day = screen.getByLabelText('Schedule date').value;
    await act(async () => { rerender(view(false)); window.dispatchEvent(new Event('focus')); });
    expect(dailyCalls()).toHaveLength(2);
    await act(async () => { rerender(view(true)); });
    expect(dailyCalls()).toHaveLength(3);
    expect(dailyCalls().at(-1).get('target_date')).toBe(day);
  });

  it.each([
    ['medications', 'medication', 'medications.administer', true],
    ['care_tasks', 'care-task', 'care_tasks.perform', false],
    ['care_tasks', 'care-task', 'care_tasks.perform', true],
  ])('%s writes %s with %s at the original slot (skip=%s)', async (category, type, permission, skip) => {
    authCtx.user = { id: 1, permissions: [permission, category + '.read'] };
    const row = { ...baseRow(), name: 'Scheduled item', dose_amount: 5 };
    stubSchedule({ [category]: [row] });
    await showSchedule(category);
    fireEvent.click(screen.getByText(row.name));
    const submit = screen.getByRole('button', { name: skip ? 'Skip' : 'Mark Complete' });
    await act(async () => { fireEvent.click(submit); });
    const [, options] = fetch.mock.calls.find(([url]) => url.endsWith('/api/schedule/complete/' + type));
    expect(JSON.parse(options.body)).toMatchObject({
      patient_id: 5, schedule_id: 8, scheduled_time: row.scheduled_time,
      ...(skip && (type === 'medication' ? { dose_amount: 0 } : { skipped: true })),
    });
  });

  it.each([undefined, 'medications'])('keeps a read-only schedule visible without recording or PRN controls (%s)', async (scope) => {
    authCtx.user = { id: 1, permissions: ['medications.read'] };
    stubSchedule({ medications: [{ ...baseRow(), name: 'Morning medication' }] });
    await showSchedule(scope);
    fireEvent.click(screen.getByText('Morning medication'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: /PRN|Complete all/i })).toBeNull();
  });

  it.each([undefined, 'medications'])('lets a caregiver record or skip a dose on either schedule (%s)', async scope => {
    authCtx.user = { id: 1, permissions: ['medications.read', 'medications.administer'] };
    stubSchedule({ medications: [{ ...baseRow(), name: 'Caregiver dose' }] });
    await showSchedule(scope);
    fireEvent.click(screen.getByText('Caregiver dose'));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Mark Complete' })).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: 'Skip' })).toBeEnabled();
  });

  it.each([
    [undefined, 'medications'], ['medications', 'medications'], ['nutrition', 'nutrition'], ['care_tasks', 'care_tasks'],
  ])('places a deferred %s row at the reminder hour and keeps its care due time in the dialog (%s)', async (scope, category) => {
    const original = new Date();
    original.setDate(original.getDate() - 1);
    original.setHours(8, 0, 0, 0);
    const target = new Date();
    target.setHours(17, 30, 0, 0);
    const row = { ...baseRow(), name: 'Moved occurrence', default_item: 'Water', default_amount: 50, default_amount_unit: 'ml', scheduled_time: original.toISOString(),
      original_due_at: original.toISOString(), remind_at: target.toISOString(), effective_time: target.toISOString(),
      deadline_at: new Date(target.getTime() + 86400000).toISOString(), can_remind_later: true, reminder_state: 'snoozed' };
    stubSchedule({ [category]: [row] });
    await showSchedule(scope);
    const hour = document.querySelector('[data-hour="17"]');
    expect(within(hour).getByText(/Originally due/)).toBeInTheDocument();
    fireEvent.click(within(hour).getByText(row.name));
    expect(screen.getByRole('dialog')).toHaveTextContent(/Scheduled.*8:00 AM/);
    expect(screen.getByRole('button', { name: 'Confirm Late Administration' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Adjust reminder' }));
    expect(screen.getByLabelText('Remind me on').value).toMatch(/T17:30$/);
  });

  it('opens the profile calendar day after a reminder moves across midnight in another timezone', async () => {
    const target = new Date();
    target.setDate(target.getDate() + 2);
    target.setHours(23, 30, 0, 0);
    const row = { ...baseRow(), name: 'Afternoon task', can_remind_later: true,
      deadline_at: new Date(target.getTime() + 86400000).toISOString() };
    stubSchedule({ timezone: 'Asia/Tokyo', care_tasks: [row] });
    await showSchedule('care_tasks');
    fireEvent.click(screen.getByText(row.name));
    fireEvent.click(screen.getByRole('button', { name: 'Remind me later' }));
    fireEvent.change(screen.getByLabelText('Remind me on'), { target: { value: getLocalDateTimeString(target) } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save reminder' })); });
    const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(target);
    expect(day).not.toBe(getLocalDateTimeString(target).slice(0, 10));
    expect(dailyCalls().at(-1).get('target_date')).toBe(day);
    expect(screen.getByLabelText('Schedule date')).toHaveValue(day);
    const put = fetch.mock.calls.find(([url, opts]) => opts?.method === 'PUT' && url.endsWith('/reminders/care_tasks'));
    expect(JSON.parse(put[1].body)).toMatchObject({ scheduled_time: row.scheduled_time, remind_at: target.toISOString() });
  });

  it('marks a missed occurrence visibly on its timeline and excludes the reminder action', async () => {
    stubSchedule({ care_tasks: [{ ...baseRow(), name: 'Earlier task', reminder_state: 'missed', can_remind_later: false }] });
    await showSchedule('care_tasks');
    expect(screen.getByText('Missed')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Earlier task'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remind me later' })).toBeNull();
  });

  it('offers linked nutrition tracking after completing an eligible care task', async () => {
    const row = { ...baseRow(), care_task_id: 4, name: 'Meal support' };
    stubSchedule({ care_tasks: [row] }, {
      success: true, requires_nutrition_tracking: true, log_id: 83, care_task: { name: row.name },
    });
    await showSchedule('care_tasks');
    fireEvent.click(screen.getByText(row.name));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Mark Complete' })); });
    expect(screen.getByRole('dialog', { name: 'Log intake' })).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveTextContent(row.name);
  });

  it('records a scheduled diaper check as a check outcome', async () => {
    authCtx.user = { id: 1, permissions: ['nutrition.read', 'nutrition.create'] };
    const row = { ...baseRow(), name: 'Afternoon check', row_kind: 'diaper_check' };
    stubSchedule({ nutrition: [row] });
    await showSchedule('nutrition');
    fireEvent.click(screen.getByText(row.name));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Checked dry' })); });
    const writes = fetch.mock.calls.filter(([, options]) => options?.method === 'POST');
    expect(writes).toHaveLength(1);
    expect(writes[0][0]).toContain('/api/schedule-manager/5/actions');
    expect(JSON.parse(writes[0][1].body)).toMatchObject({ action: 'dry', check_schedule_id: 8, check_scheduled_time: row.scheduled_time });
  });

  it('opens the shared intake and output picker in the selected nutrition hour', async () => {
    await showSchedule('nutrition');
    fireEvent.click(document.querySelector('[data-hour="8"] .admin-v2-schedule-col.nutrition'));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Log Intake' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Log Output' })).toBeInTheDocument();
  });

  it('shows the last given date and time on the medication overview with a negative UTC offset', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => [{
        id: 8, name: 'Afternoon medication', last_administered: '2026-11-26T19:59:00-05:00',
      }],
    });
    await act(async () => { render(<AdminV2Medications />); });
    expect(screen.getByText('Last given').parentElement).toHaveTextContent(/Nov 26, 2026.*7:59 PM/);
  });

});
