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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AdminV2ScheduleManager from './AdminV2ScheduleManager';

vi.mock('../AdminV2Layout', () => ({ default: ({ children }) => <>{children}</> }));
vi.mock('./useCareProfile', () => ({ default: () => ({ patient: { first_name: 'Sample' } }) }));
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { is_system_admin: true } }) }));

const baseSettings = {
  feeds_enabled: false, feed_schedule_ids: [], min_gap_minutes: null,
  overnight_schedule_id: null, overnight_target: null, manual_checks_enabled: false,
  checks_enabled: false, check_feed_ids: [], check_delay_minutes: 30,
  check_window_minutes: 120, change_lookback_minutes: 120, check_cooldown_minutes: 60,
  check_hours_start: null, check_hours_end: null, check_recipient_ids: [],
};
let state;
let requests;
let reminderDefault;

beforeEach(() => {
  requests = [];
  reminderDefault = { reminder_window_minutes: null, can_edit: true };
  state = {
    settings: { ...baseSettings }, can_manage: true, can_record: true, suggestion: null, history: [],
    schedules: [{ id: 2, name: 'Lunch' }, { id: 7, name: 'Overnight' }],
    caregivers: [{ id: 3, name: 'Morgan' }, { id: 4, name: 'Reese' }],
  };
  vi.stubGlobal('fetch', vi.fn(async (url, options) => {
    const parsed = new URL(url);
    const path = parsed.pathname;
    const replaceAudience = parsed.searchParams.get('replace_check_recipients');
    const body = options.body && JSON.parse(options.body);
    requests.push({ path, method: options.method, body, replaceAudience });
    if (path.includes('/reminder-defaults/')) {
      if (options.method === 'PUT') reminderDefault = { ...reminderDefault, ...body };
      return Response.json(reminderDefault);
    }
    if (path.endsWith('/preview')) {
      return Response.json({
        feeds: [{ name: 'Overnight', scheduled_time: '2026-11-25T23:00:00Z',
          effective_time: '2026-11-26T00:00:00Z', overnight_target_at: '2026-11-25T23:30:00Z',
          overnight_delayed: true, timing_reason: 'Keeps the selected gap after lunch.' }],
        suggestion: null,
      });
    }
    if (options.method === 'PUT') state = { ...state, settings: body,
      audience_needs_review: replaceAudience === 'true' ? false : state.audience_needs_review };
    if (path.endsWith('/actions')) {
      state = { ...state, suggestion: null, history: [{ id: 1, action: body.action,
        occurred_at: '2026-11-25T20:01:00Z', recorded_by: 9, recorded_by_name: 'Alex' }] };
    }
    return Response.json(state);
  }));
});

function showManager() {
  render(<MemoryRouter initialEntries={['/care/configuration/patients/5/schedule-manager']}>
    <Routes><Route path="/care/configuration/patients/:patientId/schedule-manager" element={<AdminV2ScheduleManager />} /></Routes>
  </MemoryRouter>);
}

describe('Schedule Manager', () => {
  it('sets a default for newly created schedules and can clear it', async () => {
    showManager();
    const input = await screen.findByLabelText('Mark missed after');
    const button = screen.getByRole('button', { name: 'Save default' });
    expect(button).toBeDisabled();
    fireEvent.change(input, { target: { value: '2' } });
    fireEvent.click(button);
    await screen.findByText('Default for new schedules saved.');
    expect(reminderDefault.reminder_window_minutes).toBe(120);
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(button);
    await screen.findByText('Default for new schedules saved.');
    expect(reminderDefault.reminder_window_minutes).toBeNull();
    expect(requests.filter(r => r.method === 'PUT').every(r => r.path === '/api/schedule/reminder-defaults/5')).toBe(true);
  });

  it('previews a day with the unsaved selection before saving the same rules to the profile', async () => {
    showManager();
    fireEvent.click(await screen.findByLabelText('Adjust feed times when the day runs late'));
    const feeds = screen.getByRole('group', { name: 'Feeds to adjust' });
    fireEvent.click(within(feeds).getByLabelText('Lunch'));
    fireEvent.click(within(feeds).getByLabelText('Overnight'));
    fireEvent.change(screen.getByLabelText('Minimum minutes between starts'), { target: { value: '95' } });
    fireEvent.change(screen.getByLabelText('Overnight feed'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText(/Preferred latest start/), { target: { value: '21:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview today' }));
    expect(await screen.findByText(/Review timing/)).toBeVisible();
    const preview = requests.find((r) => r.path.endsWith('/preview'));
    expect(preview.body).toEqual({ ...baseSettings, feeds_enabled: true, feed_schedule_ids: [2, 7],
      min_gap_minutes: 95, overnight_schedule_id: 7, overnight_target: '21:30' });
    expect(requests.some((r) => r.method === 'PUT')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Save rules' }));
    expect(await screen.findByText('Schedule rules saved.')).toBeVisible();
    expect(requests.find((r) => r.method === 'PUT')).toEqual({
      method: 'PUT', path: '/api/schedule-manager/5', body: preview.body, replaceAudience: 'false',
    });
  });

  it('supports manual checks with suggestions switched off', async () => {
    showManager();
    expect(await screen.findByLabelText('Record bathroom checks manually')).not.toBeChecked();
    expect(screen.queryByRole('button', { name: 'Checked dry' })).toBeNull();
    fireEvent.click(screen.getByLabelText('Record bathroom checks manually'));
    fireEvent.click(screen.getByRole('button', { name: 'Save rules' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Checked dry' }));
    expect(await screen.findByText(/Alex/)).toBeVisible();
    expect(requests.find((r) => r.path.endsWith('/actions')).body).toEqual({ action: 'dry', request_id: expect.any(String) });
    expect(state.settings.checks_enabled).toBe(false);
  });

  it('saves an overnight delivery window and chosen caregivers, and explicitly restores team-wide suggestions', async () => {
    state.settings = { ...baseSettings, checks_enabled: true, check_feed_ids: [2] };
    showManager();
    const recipients = await screen.findByRole('group', { name: 'Who sees suggestions' });
    fireEvent.click(within(recipients).getByLabelText('Morgan'));
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '22:00' } });
    expect(screen.getByLabelText('Until')).toBeRequired();
    fireEvent.change(screen.getByLabelText('Until'), { target: { value: '22:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save rules' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose different start and end');
    fireEvent.change(screen.getByLabelText('Until'), { target: { value: '06:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save rules' }));
    expect(await screen.findByText('Schedule rules saved.')).toBeVisible();
    expect(state.settings).toMatchObject({ check_hours_start: '22:00', check_hours_end: '06:00', check_recipient_ids: [3] });
    fireEvent.click(screen.getByRole('button', { name: 'Include all caregivers' }));
    fireEvent.click(screen.getByRole('button', { name: 'Preview today' }));
    expect(await screen.findByRole('heading', { name: 'Today’s preview' })).toBeVisible();
    expect(requests.find((r) => r.path.endsWith('/preview')).body.check_recipient_ids).toEqual([]);
    expect(state.settings.check_recipient_ids).toEqual([3]);
  });

  it('preserves a removed recipient on unrelated edits and previews until the manager explicitly opens the audience', async () => {
    state.audience_needs_review = true;
    state.settings = { ...baseSettings, checks_enabled: true, check_feed_ids: [2], check_recipient_ids: [] };
    showManager();
    expect(await screen.findByText(/previously selected caregiver is no longer available/)).toBeVisible();
    expect(screen.getByText(/No eligible caregivers are currently selected/)).toBeVisible();
    expect(screen.queryByText(/Everyone with recording access sees suggestions/)).toBeNull();
    fireEvent.click(screen.getByLabelText('Record bathroom checks manually'));
    fireEvent.click(screen.getByRole('button', { name: 'Preview today' }));
    await screen.findByRole('heading', { name: 'Today’s preview' });
    expect(requests.find((r) => r.path.endsWith('/preview')).replaceAudience).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Save rules' }));
    await screen.findByText('Schedule rules saved.');
    expect(requests.find((r) => r.method === 'PUT').replaceAudience).toBe('false');
    expect(screen.getByText(/No eligible caregivers are currently selected/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Include all caregivers' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save rules' }));
    await screen.findByText('Schedule rules saved.');
    expect(requests.filter((r) => r.method === 'PUT').at(-1)).toMatchObject({
      replaceAudience: 'true', body: { check_recipient_ids: [] },
    });
    expect(screen.queryByText(/previously selected caregiver is no longer available/)).toBeNull();
  });

  it('can keep the eligible recipients after another caregiver loses access', async () => {
    state.audience_needs_review = true;
    state.settings = { ...baseSettings, check_recipient_ids: [3, 19] };
    showManager();
    fireEvent.click(await screen.findByRole('button', { name: 'Keep selected caregivers' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save rules' }));
    await screen.findByText('Schedule rules saved.');
    expect(requests.find((r) => r.method === 'PUT')).toMatchObject({
      replaceAudience: 'true', body: { check_recipient_ids: [3], checks_enabled: false },
    });
  });

  it('uses the active suggestion key when a caregiver dismisses a prompt, preserving read-only rules', async () => {
    state.can_manage = false;
    state.settings = { ...baseSettings, checks_enabled: true, check_feed_ids: [2] };
    state.suggestion = { trigger_key: '2/noon', feed_name: 'Lunch', feed_started_at: '2026-11-25T17:00:00Z', last_change_at: null };
    showManager();
    expect(await screen.findByText('Diaper check suggested')).toBeVisible();
    expect(screen.getByLabelText('Suggest a diaper check after selected feeds')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save rules' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(await screen.findByText('Suggestion dismissed', { selector: 'strong' })).toBeVisible();
    expect(requests.find((r) => r.path.endsWith('/actions')).body).toMatchObject({ action: 'dismiss', trigger_key: '2/noon' });
    expect(screen.queryByText('Diaper check suggested')).toBeNull();
  });
});
