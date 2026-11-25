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
import { readFile } from 'node:fs/promises';

test.use({ viewport: { width: 320, height: 740 }, hasTouch: true, timezoneId: 'America/New_York' });

const diaperChange = { source: 'nutrition_output', id: 4, label: 'Diaper change', note: 'Urine · wet · Stool · soiled' };

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
  const suggestion = { id: '87dea237-169c-57a2-9daf-80587ddb1656', start_time: '2026-11-24T02:26:15Z',
    end_time: '2026-11-24T02:26:28Z', min_spo2: 95, min_bpm: 76, max_bpm: 93, motion_detected: true };
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
          at: body.observed_at, note: body.note, is_custom: !body.label, request_id: body.request_id,
          question: diary.buttons.find(b => b.label === body.label)?.question };
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
    if (pathname.endsWith('/9/report')) json = { start: diary.starts_at, through: new Date().toISOString(),
      signals_from: diary.starts_at, signals: [], categories: { observation: [], alerts: [], vitals: [] }, entries: [
      { source: 'medication', id: 4, at: '2026-11-24T02:30:00Z', label: 'Took medicine', note: 'Recorded dose' },
      { source: 'care_task', id: 4, at: '2026-11-24T02:30:00Z', label: 'Care task completed', note: 'Reposition · Left side' },
      { source: 'medication', id: 5, at: '2026-11-24T02:30:00.785Z', label: 'Took medicine', note: 'Second dose' },
      { ...diaperChange, at: '2026-11-24T02:30:15Z' },
      ...observations.values(),
    ] };
    if (pathname.endsWith('/9/day')) {
      const date = new URL(req.url()).searchParams.get('target_date') || '2026-11-23';
      const start = Date.parse(date + 'T05:00:00Z');
      json = { date, today: '2026-11-23', first_day: '2026-11-22', last_day: '2026-11-23',
        timezone: 'America/New_York', day_start: new Date(start).toISOString(), day_end: new Date(start + 86400000).toISOString(),
        suggested_events: date === '2026-11-23' && ![...observations.values()].some(e => e.request_id === suggestion.id)
          ? [suggestion] : [],
        pulse_ox: [29, 30, 32].map(minute => ({
          ts: new Date(start + (21 * 60 + minute) * 60000).toISOString(), spo2: 99, bpm: 72,
        })),
        alerts: [], care_tasks: date === '2026-11-23' ? [
          { ts: '2026-11-24T02:30:00Z', name: 'Reposition', status: 'completed', notes: 'Left side' },
        ] : [], vitals: [], nutrition_output: date === '2026-11-23' ? [
          { ts: '2026-11-24T02:30:15Z', output_type: 'urine', is_diaper: true, diaper_wetness: 'wet' },
          { ts: '2026-11-24T02:30:15Z', output_type: 'bowel', is_diaper: true, diaper_soiled: true },
        ] : [] };
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
  await expect(dialog.getByLabel('Nutrition intake and output')).toBeChecked();
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
  await expect(activity.getByRole('button', { name: /Reposition · Left side/ })).toHaveCount(1);
  await expect(activity.getByRole('button', { name: /wet|soiled/i })).toHaveText(/Diaper change · Urine · wet · Stool · soiled/);
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
  const customActivity = activity.getByRole('button', { name: /Turned toward the window/ });
  await expect(customActivity.locator('.mtl-row-text')).toHaveText('Turned toward the window.');
  await customActivity.tap();
  await expect(page.locator('.mtl-diary-observation')).toHaveText(/^Turned toward the window\.\s*Edit$/);
  expect(observations.size).toBe(2);
  expect(event.at).toBe('2026-11-24T02:32:14.000Z');
  await page.getByText('Suggested events (1)', { exact: true }).tap();
  const review = page.getByRole('button', { name: /Review event at/ });
  await review.tap();
  await expect(dialog).toHaveAccessibleName('Review suggested event');
  await expect(dialog.getByLabel('Description')).toHaveValue(/9:26:15 PM EST.*9:26:28 PM EST.*Lowest SpO₂ 95% · Heart rate 76–93 bpm/);
  await expect(dialog.getByLabel('Description')).toHaveValue(/Monitor flagged movement/);
  await dialog.getByRole('button', { name: 'Cancel' }).tap();
  expect(observations.size).toBe(2);
  await review.tap();
  const description = dialog.getByLabel('Description');
  await description.fill(await description.inputValue() + ' During a change.');
  await dialog.getByRole('button', { name: 'Record event', exact: true }).tap();
  await expect(page.getByText('Suggested events (0)', { exact: true })).toBeVisible();
  expect(event.at).toBe(suggestion.start_time);
  expect(event.request_id).toBe(suggestion.id);
  await page.reload();
  await page.getByRole('button', { name: 'Diary actions' }).tap();
  await expect(dialog.getByRole('button', { name: 'Settings' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'New diary' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).tap();
  await page.getByRole('button', { name: 'All entries', exact: true }).tap();
  await expect(page.getByRole('table')).toContainText('Did you press the recorder button? Yes');
  await expect(page.getByRole('row').filter({ hasText: 'During a change.' })).toContainText('Lowest SpO₂ 95% · Heart rate 76–93 bpm');
  const customDescription = page.getByRole('row').filter({ hasText: 'Turned toward the window.' }).getByRole('cell').nth(1);
  await expect(customDescription).toHaveText(/^Turned toward the window\.\s*Edit$/);
  await expect(customDescription.getByRole('button', { name: 'Edit Turned toward the window.' })).toBeVisible();
  const doses = page.getByRole('row').filter({ hasText: 'Took medicine' });
  await expect(doses).toHaveCount(1);
  await expect(doses.locator('strong')).toHaveText(['Took medicine']);
  await expect(doses.locator('p')).toHaveText(['Recorded dose', 'Second dose']);
  const care = page.getByRole('row').filter({ hasText: 'Care task completed' });
  await expect(care).toContainText('Reposition · Left side');
  await expect(care.getByRole('button')).toHaveCount(0);
  const change = page.getByRole('row').filter({ hasText: 'Diaper change' });
  await expect(change).toContainText('9:30:15 PM');
  await expect(change).toContainText(diaperChange.note);
  await expect(page.getByRole('table').locator('small')).toHaveCount(0);
  await page.getByRole('button', { name: 'Day timeline', exact: true }).tap();
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('heading', { name: 'Home EEG' })).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(1);
  await expect(page.getByRole('table')).toContainText('9:31:08 PM');
  await expect(customDescription).toHaveText('Turned toward the window.');
  await expect(doses).toContainText('Second dose');
  await expect(care).toContainText('Reposition · Left side');
  await expect(change).toContainText(diaperChange.note);
  await expect(page.getByRole('table')).not.toContainText(/Medication log|Care task log|Nutrition log/);
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

test('read-only diary offers a full-study PDF when the host suppresses printing', async ({ page }, testInfo) => {
  const base = '/api/patients/2/diaries';
  const starts = '2026-11-22T15:00:00Z';
  const patient = { id: 2, first_name: 'Avery', last_name: 'Green' };
  const diary = { id: 9, name: 'Home EEG', starts_at: starts, ends_at: null, buttons: [] };
  const entries = Array.from({ length: 61 }, (_, i) => ({
    id: i + 1, source: 'observation', label: 'Observation',
    at: new Date(Date.parse(starts) + i * 30 * 60000).toISOString(),
    note: i === 0 ? 'Turned toward the window.' : i === 60 ? 'Last entry of the study.' : 'Resting.',
  }));
  entries[0] = { ...entries[0], label: 'Custom observation', is_custom: true };
  entries.splice(1, 0,
    { id: 1, source: 'care_task', label: 'Care task completed', at: starts, note: 'Transferred to chair' },
    { id: 2, source: 'care_task', label: 'Care task completed', at: starts, note: 'Changed bedding' },
    { ...diaperChange, at: starts },
  );
  const instant = i => new Date(Date.parse(starts) + i * 900000).toISOString();
  const signals = Array.from({ length: 121 }, (_, i) => {
    const oxygen = 97 + Math.sin(i * .35), pulse = 82 + 8 * Math.sin(i * .27);
    return { at: instant(i), spo2: { low: Math.floor(oxygen) - (i % 23 === 0 ? 7 : 1), avg: oxygen, high: 99 },
      bpm: { low: Math.floor(pulse) - 5, avg: pulse, high: Math.ceil(pulse) + (i % 23 === 0 ? 21 : 6) } };
  }).filter((_, i) => i < 40 || i > 45);
  const categories = { observation: [instant(0), instant(52), instant(120)], alerts: [instant(23), instant(69)],
    medication: [instant(10), instant(72)], care_task: [instant(0)], nutrition: [instant(14)],
    nutrition_output: [instant(0)], vitals: [instant(89)] };
  await page.routeWebSocket('**/ws/sensors', () => {});
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    const responses = {
      '/api/auth/session': { user_id: 1, account_id: 1, is_system_admin: true },
      '/api/auth/first-run': { is_first_run: false },
      '/api/patients': [patient],
      [base]: { can_write: false, timezone: 'America/New_York', diaries: [diary] },
      [base + '/9/report']: { start: starts, through: instant(120), signals_from: starts, entries, signals, categories },
      [base + '/9/day']: { date: '2026-11-23', today: '2026-11-23', first_day: '2026-11-22',
        last_day: '2026-11-23', timezone: 'America/New_York', day_start: '2026-11-23T05:00:00Z',
        day_end: '2026-11-24T05:00:00Z' },
    };
    return route.fulfill({ json: responses[path] || [] });
  });
  // Downloads are allowed in this frame, but window.print() is suppressed.
  await page.route('**/test-diary-host', route => route.fulfill({ contentType: 'text/html',
    body: '<meta name="viewport" content="width=device-width,initial-scale=1"><iframe title="Health" style="position:fixed;inset:0;width:100%;height:100%;border:0" sandbox="allow-scripts allow-same-origin allow-downloads" src="/care/diary?patient=2"></iframe>' }));
  await page.goto('/test-diary-host');
  const embedded = page.frameLocator('iframe');
  await expect(embedded.getByRole('heading', { name: 'Home EEG' })).toBeVisible();
  await expect(embedded.getByRole('button', { name: 'Record an event' })).toHaveCount(0);
  await embedded.getByRole('button', { name: 'Diary actions' }).tap();
  await expect(embedded.getByRole('button', { name: 'New diary' })).toHaveCount(0);
  await embedded.getByRole('button', { name: 'Print diary' }).tap();
  const preview = embedded.getByRole('dialog', { name: 'Print preview' });
  await expect(preview).toContainText('Avery Green');
  await expect(preview.getByRole('img', { name: /15-minute SpO₂/ })).toBeVisible();
  await expect(preview.getByRole('cell', { name: 'Turned toward the window.', exact: true })).toBeVisible();
  await expect(preview).toContainText('Last entry of the study.');
  const careRow = preview.getByRole('row').filter({ hasText: 'Care task completed' });
  await expect(careRow.locator('p')).toHaveText(['Transferred to chair', 'Changed bedding']);
  await expect(preview.getByRole('row').filter({ hasText: 'Diaper change' })).toContainText(diaperChange.note);
  await expect(preview.getByRole('table').locator('small')).toHaveCount(0);
  await expect(preview.getByRole('row')).toHaveCount(64);
  await preview.getByRole('button', { name: 'Print', exact: true }).tap();
  await expect(preview).toContainText('save the PDF');
  const downloaded = page.waitForEvent('download');
  await preview.getByRole('link', { name: 'Save PDF' }).tap();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe('event-diary.pdf');
  const output = testInfo.outputPath('event-diary.pdf');
  await file.saveAs(output);
  expect((await readFile(output)).subarray(0, 5).toString()).toBe('%PDF-');
  await preview.getByRole('button', { name: 'Close' }).tap();
  await expect(preview).toHaveCount(0);

  await page.goto('/care/diary?patient=2');
  await page.emulateMedia({ media: 'print' });
  const overview = page.locator('.diary-print .diary-overview');
  await expect(overview.getByRole('img')).toBeVisible();
  await expect(overview).toHaveCSS('break-after', 'page');
  const printed = await page.pdf({ path: testInfo.outputPath('browser-print.pdf'), format: 'Letter',
    margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' } });
  expect(printed.toString('latin1')).toMatch(/\/MediaBox\s*\[0 0 612 792\]/);
});
