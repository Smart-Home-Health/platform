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
import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 320, height: 740 }, hasTouch: true, timezoneId: 'America/New_York' });

test('patient card opens the correct diary and captures, corrects and prints an EEG event', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-24T02:32:14Z'));
  await page.addInitScript(() => sessionStorage.setItem('adminSelectedPatientId', '1'));
  await page.routeWebSocket('**/ws/sensors', () => {});
  const patients = [
    { id: 1, first_name: 'Robin', last_name: 'Gray' },
    { id: 2, first_name: 'Avery', last_name: 'Green' },
  ];
  let diary, event, canWrite = true;
  const observations = new Map();
  let interruptedCapture;
  const paths = [];
  await page.route('**/api/**', async route => {
    const req = route.request();
    const { pathname } = new URL(req.url());
    const body = req.postDataJSON();
    paths.push(pathname);
    let json = [];
    if (pathname === '/api/auth/session') json = { user_id: 1, account_id: 1, is_system_admin: true };
    if (pathname === '/api/auth/first-run') json = { is_first_run: false };
    if (pathname === '/api/patients') json = patients;
    if (pathname === '/api/dashboard/summary') json = { patients: patients.map(p => ({ ...p, name: p.first_name + ' ' + p.last_name, status: 'active' })) };
    if (pathname === '/api/patients/2/diaries') {
      if (req.method() === 'POST') { diary = { ...body, id: 9 }; json = diary; }
      else json = { can_write: canWrite, timezone: 'America/New_York', diaries: diary ? [diary] : [] };
    }
    if (pathname.endsWith('/9/events')) {
      if (body.label === 'Questionable event' && interruptedCapture) {
        expect(body).toEqual(interruptedCapture);
      } else {
        event = { source: 'observation', id: 17 + observations.size, label: body.label || 'Custom observation',
          at: body.observed_at, note: body.note, question: diary.buttons.find(b => b.label === body.label)?.question };
        observations.set(event.id, event);
        if (body.label === 'Questionable event') {
          interruptedCapture = body;
          return route.fulfill({ status: 503, json: { detail: 'Connection interrupted' } });
        }
      }
      json = event;
    }
    if (/\/9\/events\/\d+$/.test(pathname)) {
      const id = Number(pathname.split('/').pop());
      event = { ...observations.get(id), ...body, at: body.observed_at };
      observations.set(id, event);
      json = event;
    }
    if (pathname.endsWith('/9/timeline')) json = [
      { source: 'medication', id: 4, at: '2026-11-24T02:30:00Z', label: 'Took medicine', note: 'Recorded dose' },
      ...observations.values(),
    ];
    if (pathname.endsWith('/9/day')) {
      const date = new URL(req.url()).searchParams.get('target_date') || '2026-11-23';
      const start = Date.parse(date + 'T05:00:00Z');
      json = { date, today: '2026-11-23', first_day: '2026-11-22', last_day: '2026-11-23',
        timezone: 'America/New_York', day_start: new Date(start).toISOString(), day_end: new Date(start + 86400000).toISOString(),
        pulse_ox: [29, 30, 32].map(minute => ({
          ts: new Date(start + (21 * 60 + minute) * 60000).toISOString(), spo2: 99, bpm: 72,
        })),
        alerts: [], care_tasks: [], vitals: [], nutrition_output: [] };
    }
    await route.fulfill({ json });
  });

  await page.goto('/care');
  const actions = page.locator('.admin-v2-patient-actions').nth(1);
  const links = actions.getByRole('link');
  await expect(links).toHaveText(['Details', 'Diary', 'Schedule']);
  const boxes = await links.evaluateAll(nodes => nodes.map(a => {
    const rect = a.getBoundingClientRect();
    return { y: rect.y, right: rect.right, fits: a.scrollWidth <= a.clientWidth + 1 };
  }));
  expect(boxes.every(b => b.y === boxes[0].y && b.right <= 320 && b.fits)).toBe(true);
  await links.nth(1).tap();
  await expect(page).toHaveURL(/\/care\/diary\?patient=2$/);
  await page.getByRole('button', { name: 'New diary' }).tap();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Use Home EEG template' }).tap();
  await dialog.getByLabel('Starts', { exact: true }).fill('2026-11-22T10:00');
  await dialog.getByRole('button', { name: 'Create diary' }).tap();
  const add = page.getByRole('button', { name: 'Record an event', exact: true });
  await expect(page.getByRole('heading', { name: 'Event diary' })).toHaveCount(0);
  await expect(page.locator('.diary-page').getByText('Avery Green', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Questionable event', exact: true })).toHaveCount(0);
  await expect(page.locator('.mtl-stats')).toBeInViewport();
  await expect(add).toBeInViewport();
  await add.tap();
  await dialog.getByRole('button', { name: 'Close' }).tap();
  expect(observations.size).toBe(0);
  await add.tap();
  await dialog.getByRole('button', { name: 'Questionable event', exact: true }).tap();
  await expect(dialog.getByRole('alert')).toContainText('Connection interrupted');
  await dialog.getByRole('button', { name: 'Retry capture' }).tap();
  expect(observations.size).toBe(1);
  await expect(dialog.getByRole('radio', { name: 'Yes', exact: true })).toBeVisible();
  expect(event.at).toBe('2026-11-24T02:32:14.000Z');
  await dialog.getByRole('radio', { name: 'Yes', exact: true }).check();
  await dialog.getByLabel('Observed at').fill('2026-11-23T21:31:08');
  await dialog.getByLabel('Description').fill('Brief pause during reading.');
  await dialog.getByRole('button', { name: 'Save changes' }).tap();
  await expect(page.getByLabel('SpO2 over time')).toBeVisible();
  await expect(page.getByLabel('Heart Rate over time')).toBeVisible();
  await expect(page.getByRole('button', { name: '1M', exact: true })).toBeVisible();
  const activity = page.locator('.mtl-activity');
  await expect(activity.getByRole('button', { name: /Recorded dose/ })).toHaveCount(1);
  await page.locator('.mtl-lanes').getByRole('button', { name: /Questionable event/ }).tap();
  await expect(page.locator('.mtl-detail')).toContainText('Brief pause during reading.');
  await expect(page.locator('.mtl-detail')).toContainText('No pulse-ox reading at this time.');
  await page.getByRole('button', { name: 'Edit Questionable event' }).tap();
  await expect(dialog.getByLabel('Description')).toHaveValue('Brief pause during reading.');
  await dialog.getByRole('button', { name: 'Close', exact: true }).last().tap();
  await page.getByLabel('Previous day').tap();
  await expect(page.getByLabel('Pick a date')).toHaveValue('2026-11-22');
  await expect(activity).toContainText('Nothing was logged');
  await page.getByLabel('Next day').tap();
  await expect(activity.getByRole('button', { name: /Questionable event/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(event.at).toBe('2026-11-24T02:31:08.000Z');
  await expect(add).toBeInViewport();
  await add.tap();
  await dialog.getByRole('button', { name: 'Custom', exact: true }).tap();
  const saveCustom = dialog.getByRole('button', { name: 'Record event', exact: true });
  await expect(dialog.getByLabel('Description')).toBeFocused();
  await expect(saveCustom).toBeDisabled();
  await dialog.getByLabel('Description').fill('Turned toward the window.');
  await dialog.getByRole('button', { name: 'Cancel' }).tap();
  expect(observations.size).toBe(1);
  await add.tap();
  await dialog.getByRole('button', { name: 'Custom', exact: true }).tap();
  await dialog.getByLabel('Description').fill('Turned toward the window.');
  await saveCustom.tap();
  await expect(activity.getByRole('button', { name: /Turned toward the window/ })).toBeVisible();
  expect(observations.size).toBe(2);
  expect(event.at).toBe('2026-11-24T02:32:14.000Z');
  await page.reload();
  await page.getByRole('button', { name: 'Diary actions' }).tap();
  await expect(dialog.getByRole('button', { name: 'Settings' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'New diary' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).tap();
  await page.getByRole('button', { name: 'All entries', exact: true }).tap();
  await expect(page.getByRole('table')).toContainText('Did you press the recorder button? Yes');
  await page.getByRole('button', { name: 'Day timeline', exact: true }).tap();
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('heading', { name: 'Home EEG' })).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(1);
  await expect(page.getByRole('table')).toContainText('9:31:08 PM');
  await expect(page.getByRole('table')).toContainText('Turned toward the window.');
  await expect(page.locator('.diary-print').getByText('Avery Green', { exact: true })).toBeVisible();
  await expect(page.getByRole('button')).toHaveCount(0);
  await page.emulateMedia({ media: 'screen' });
  canWrite = false;
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Home EEG' })).toBeVisible();
  await expect(add).toHaveCount(0);
  await page.getByRole('button', { name: 'Diary actions' }).tap();
  await expect(dialog.getByRole('button', { name: 'Print diary' })).toBeEnabled();
  await expect(dialog.getByRole('button', { name: 'New diary' })).toHaveCount(0);
  expect(paths).not.toContain('/api/patients/1/diaries');
  expect(paths).not.toContain('/api/monitoring/timeline');
});
