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
  let diary, event;
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
      else json = { can_write: true, timezone: 'America/New_York', diaries: diary ? [diary] : [] };
    }
    if (pathname.endsWith('/9/events')) {
      event = { source: 'observation', id: 17, label: body.label, at: body.observed_at,
        question: diary.buttons.find(b => b.label === body.label).question };
      json = event;
    }
    if (pathname.endsWith('/9/events/17')) {
      event = { ...event, ...body, at: body.observed_at };
      json = event;
    }
    if (pathname.endsWith('/9/timeline')) json = event ? [event] : [];
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
  await dialog.getByLabel('Starts', { exact: true }).fill('2026-11-23T10:00');
  await dialog.getByRole('button', { name: 'Create diary' }).tap();
  await page.getByRole('button', { name: 'Questionable event', exact: true }).tap();
  await expect(dialog.getByRole('radio', { name: 'Yes', exact: true })).toBeVisible();
  expect(event.at).toBe('2026-11-24T02:32:14.000Z');
  await dialog.getByRole('radio', { name: 'Yes', exact: true }).check();
  await dialog.getByLabel('Observed at').fill('2026-11-23T21:31:08');
  await dialog.getByLabel('Description').fill('Brief pause during reading.');
  await dialog.getByRole('button', { name: 'Save changes' }).tap();
  await expect(page.getByRole('table')).toContainText('Brief pause during reading.');
  expect(event.at).toBe('2026-11-24T02:31:08.000Z');
  await page.reload();
  await expect(page.getByRole('table')).toContainText('Did you press the recorder button? Yes');
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('heading', { name: 'Home EEG' })).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(1);
  await expect(page.getByRole('table')).toContainText('9:31:08 PM');
  await expect(page.locator('.diary-print').getByText('Avery Green', { exact: true })).toBeVisible();
  await expect(page.getByRole('button')).toHaveCount(0);
  expect(paths).not.toContain('/api/patients/1/diaries');
});
