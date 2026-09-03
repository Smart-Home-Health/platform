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
// Computed-style snapshot: proof that a stylesheet refactor changed nothing.
// For each page it walks every element and records the colour-bearing
// computed properties keyed by the element's class path (index-free, so a
// list growing by one row between runs is not a diff). Run it on the base
// branch and on the change, then diff the two directories:
//
//   SNAP_USER=... SNAP_PASSWORD=... SNAP_DIR=test-results/snap-before npx playwright test e2e/style-snapshot.spec.js
//   git stash / checkout ...           (the dev server serves the working tree)
//   SNAP_USER=... SNAP_PASSWORD=... SNAP_DIR=test-results/snap-after  npx playwright test e2e/style-snapshot.spec.js
//   diff -r test-results/snap-before test-results/snap-after
//
// Not part of any gate. Needs the docker-compose dev stack. SNAP_THEME /
// SNAP_CONTRAST seed localStorage so the same walk can be taken per palette.
//
// Pacing: every page load hits /api/auth/session and /api/auth/first-run, and
// the backend allows 40 /api/auth/* requests per minute per IP. A 429 there
// renders as the unlock gate, so pages are spaced SNAP_PAGE_PAUSE ms apart
// (default 4000) and two runs need a minute between them.
import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const USER = process.env.SNAP_USER;
const PASSWORD = process.env.SNAP_PASSWORD;
const OUT = path.resolve(process.env.SNAP_DIR || 'test-results/style-snapshot');
const API = process.env.SNAP_API || 'http://localhost:8000';
const THEME = process.env.SNAP_THEME || '';
const CONTRAST = process.env.SNAP_CONTRAST || '';
const PAGE_PAUSE = Number(process.env.SNAP_PAGE_PAUSE || 4000);
// Comma-separated page names to restrict a run (e.g. SNAP_PAGES=live,account).
const ONLY = (process.env.SNAP_PAGES || '').split(',').map((s) => s.trim()).filter(Boolean);

const PAGES = [
  ['care', '/care'],
  ['schedule', '/care/schedule'],
  ['medications-schedule', '/care/medications/schedule'],
  ['shipments', '/care/shipments'],
  ['equipment', '/care/equipment'],
  ['supplies', '/care/supplies'],
  ['reports-weekly', '/care/reports/weekly'],
  ['messages', '/care/messages'],
  ['account', '/care/configuration/account'],
  ['live', '/live?vkb=0'],
];

const PROPS = [
  'color', 'backgroundColor', 'backgroundImage', 'borderTopColor', 'borderRightColor',
  'borderBottomColor', 'borderLeftColor', 'outlineColor', 'boxShadow', 'opacity',
  'fill', 'stroke', 'caretColor', 'colorScheme',
];

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);
test.skip(!USER || !PASSWORD, 'set SNAP_USER and SNAP_PASSWORD');

fs.mkdirSync(OUT, { recursive: true });

async function login(context, page) {
  const res = await page.request.post(`${API}/api/auth/login`, {
    data: { username: USER, password: PASSWORD },
  });
  expect(res.ok(), `login failed: ${res.status()}`).toBeTruthy();
  const { access_token } = await res.json();
  const host = new URL(process.env.E2E_BASE_URL || 'http://localhost:5173').hostname;
  await context.addCookies([{ name: 'session_token', value: access_token, domain: host, path: '/' }]);
}

// Walk the DOM in the page and return { classPath: [styleTuple, ...] }.
async function snapshot(page) {
  return page.evaluate((props) => {
    const pathOf = (el) => {
      const parts = [];
      for (let n = el; n && n.nodeType === 1 && n !== document.documentElement; n = n.parentElement) {
        const cls = [...n.classList].sort().join('.');
        parts.unshift(n.tagName.toLowerCase() + (cls ? `.${cls}` : ''));
      }
      return parts.join('>');
    };
    const out = {};
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      const tuple = props.map((p) => cs[p]).join(' | ');
      const key = pathOf(el);
      (out[key] ||= new Set()).add(tuple);
    }
    const sorted = {};
    for (const key of Object.keys(out).sort()) sorted[key] = [...out[key]].sort();
    return sorted;
  }, PROPS);
}

test('computed-style snapshot per page', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  if (THEME || CONTRAST) {
    await context.addInitScript(([t, c]) => {
      if (t) localStorage.setItem('theme', t);
      if (c) localStorage.setItem('contrast', c);
    }, [THEME, CONTRAST]);
  }
  const page = await context.newPage();
  await login(context, page);
  for (const [name, url] of PAGES.filter(([name]) => !ONLY.length || ONLY.includes(name))) {
    await page.goto(url);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(1500);
    // A bounced session renders the auth shell — that would diff against
    // everything and prove nothing, so fail here instead.
    expect(await page.locator('.vc-auth').count(), `${name}: landed on the auth shell`).toBe(0);
    const snap = await snapshot(page);
    fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(snap, null, 1));
    expect(Object.keys(snap).length).toBeGreaterThan(20);
    await page.waitForTimeout(PAGE_PAUSE);
  }
  await context.close();
});
