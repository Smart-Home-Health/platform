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
// Product-site screenshots, taken from the running dev stack against the
// synthetic demo patient (seed first: backend/scripts/seed_demo_patient.py).
// Not part of any gate — run on demand:
//
//   SHOTS_USER=demo.tom SHOTS_PASSWORD=... SHOTS_DIR=../smart-home-health-site/public/screenshots \
//     npx playwright test e2e/site-screenshots.spec.js
//
// SHOTS_USER is the username of a demo caregiver (the seeder's
// --demo-password gives the demo nurse a sign-in). Desktop shots are
// 1440x900 at 2x; phone shots are 390x844 at 3x. The demo patient id
// defaults to 9 (SHOTS_PATIENT overrides); SHOTS_API points at the
// backend (default http://localhost:8000).
import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const USER = process.env.SHOTS_USER;
const PASSWORD = process.env.SHOTS_PASSWORD;
const PATIENT = Number(process.env.SHOTS_PATIENT || 9);
const OUT = path.resolve(process.env.SHOTS_DIR || 'test-results/site-screenshots');

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

test.describe.configure({ mode: 'serial' });
test.skip(!USER || !PASSWORD, 'set SHOTS_USER and SHOTS_PASSWORD');

fs.mkdirSync(OUT, { recursive: true });

// Sign in through the API rather than the screens: the UI's quick-entry path
// lands in read-restricted mode, while a direct login is a full session.
async function login(context, page) {
  const api = process.env.SHOTS_API || 'http://localhost:8000';
  const res = await page.request.post(`${api}/api/auth/login`, {
    data: { username: USER, password: PASSWORD },
  });
  expect(res.ok(), `login failed: ${res.status()}`).toBeTruthy();
  const { access_token } = await res.json();
  const host = new URL(process.env.E2E_BASE_URL || 'http://localhost:5173').hostname;
  await context.addCookies([{ name: 'session_token', value: access_token, domain: host, path: '/' }]);
  await page.goto('/care');
  await expect(page).toHaveURL(/\/care/, { timeout: 15_000 });
  // The admin pages read the selected patient from session storage.
  await page.evaluate((id) => sessionStorage.setItem('adminSelectedPatientId', String(id)), PATIENT);
}

// Let the data land and the charts settle before the shot.
async function settle(page, ms = 1500) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(ms);
}

async function shot(page, name, opts = {}) {
  await settle(page, opts.wait);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false, animations: 'disabled' });
}

// The schedule scrolls itself to the current hour on load, which late in the
// day is an empty stretch of timeline. The morning block is the busy one.
async function scrollScheduleToMorning(page) {
  await settle(page, 2000);
  await page.evaluate(() => {
    const row = document.querySelector('[data-hour="8"]');
    if (!row) return;
    row.scrollIntoView({ block: 'start' });
    // Back off from under the sticky date bar.
    let box = row.parentElement;
    while (box && box.scrollHeight <= box.clientHeight) box = box.parentElement;
    (box || window).scrollBy(0, -160);
  });
}

// Unread messages open the board over /live on arrival — that is a shot of
// its own. Desktop closes it with Close; the phone layout says Back.
async function liveWithMessages(page, name) {
  await settle(page, 3000);
  const close = page.getByRole('button', { name: /^(Close|Back)$/ }).first();
  if (await close.isVisible().catch(() => false)) {
    await shot(page, name);
    await close.click();
  }
}

// The backend throttles /api/auth/* to 40 hits a minute per IP, and every
// page load spends four of them (first-run + session, doubled by StrictMode
// in dev). The desktop set alone uses the whole window, so a context that
// starts right after it is met with 429s, which the app reads as "signed
// out". Each set therefore starts a full minute after the previous one ended.
const AUTH_WINDOW_MS = 61_000;
let lastSetEndedAt = 0;

async function newPage(browser, viewport, scale) {
  const context = await browser.newContext({
    viewport, deviceScaleFactor: scale, colorScheme: 'dark',
    isMobile: viewport === PHONE, hasTouch: viewport === PHONE,
  });
  const page = await context.newPage();
  const wait = lastSetEndedAt + AUTH_WINDOW_MS - Date.now();
  if (wait > 0) await page.waitForTimeout(wait);
  await login(context, page);
  return { context, page };
}

async function endSet(context) {
  await context.close();
  lastSetEndedAt = Date.now();
}

test('desktop set', async ({ browser }) => {
  const { context, page } = await newPage(browser, DESKTOP, 2);

  await page.goto(`/live?patient=${PATIENT}`);
  await liveWithMessages(page, 'hub-messages');
  await shot(page, 'hub-live', { wait: 3000 });

  for (const [name, route] of [
    ['hub-dashboard', '/care'],
    ['hub-schedule', '/care/schedule'],
    ['hub-medications', '/care/medications'],
    ['hub-nutrition', '/care/nutrition'],
    ['hub-monitoring', '/care/monitoring/timeline'],
    ['hub-overnight', '/care/reports/overnight'],
    ['hub-equipment', '/care/equipment'],
    ['hub-care-profile', `/care/configuration/patients/${PATIENT}`],
  ]) {
    await page.goto(route);
    if (name === 'hub-overnight') {
      // Tonight is still in progress; the last full night is the useful one.
      await page.getByRole('button', { name: 'Previous night' }).click();
    }
    if (name === 'hub-schedule') await scrollScheduleToMorning(page);
    await shot(page, name, { wait: 2500 });
  }
  await endSet(context);
});

test('phone set', async ({ browser }) => {
  const { context, page } = await newPage(browser, PHONE, 3);

  await page.goto(`/live?patient=${PATIENT}&vkb=0`);
  await liveWithMessages(page, 'hub-messages-phone');
  await shot(page, 'hub-live-phone', { wait: 4000 });

  await page.goto('/capture');
  await shot(page, 'hub-capture-phone', { wait: 2000 });

  await page.goto('/care/schedule');
  await scrollScheduleToMorning(page);
  await shot(page, 'hub-schedule-phone', { wait: 1500 });

  await endSet(context);
});
