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
// Theme matrix: every palette × a representative page set × desktop + phone,
// screenshotted and checked for colour contrast with axe.
//
//   MATRIX_USER=... MATRIX_PASSWORD=... npx playwright test e2e/theme-matrix.spec.js
//
// Needs the docker-compose dev stack. Not part of any gate (skips without the
// credentials). Screenshots land in test-results/theme-matrix/<palette>/
// <page>-<viewport>.png; axe findings in test-results/theme-matrix/axe.json.
//
// Palette selection: a signed-in user's saved preference overrides anything
// seeded in localStorage (ThemeContext adopts it on sign-in), so the palette
// is written through PATCH /api/auth/preferences and restored to dark/normal
// at the end. The signed-out /login page takes the localStorage seed.
//
// Pacing: the backend allows 40 /api/auth/* requests per minute per IP and
// every page load spends two, so loads are spaced MATRIX_PAGE_PAUSE ms apart
// (default 3500). Restrict a run with MATRIX_PALETTES=light,dark-hc and
// MATRIX_PAGES=live,login; MATRIX_VIEWPORTS=desktop or phone.
//
// Contrast rules: `color-contrast` (WCAG AA) must pass in every palette;
// the two high-contrast palettes must also pass `color-contrast-enhanced`
// (WCAG AAA, 7:1). Findings are collected across the whole matrix and
// reported together so one failure does not hide the rest.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import fs from 'node:fs';

const USER = process.env.MATRIX_USER;
const PASSWORD = process.env.MATRIX_PASSWORD;
const API = process.env.MATRIX_API || 'http://localhost:8000';
const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';
const OUT = path.resolve(process.env.MATRIX_DIR || 'test-results/theme-matrix');
const PAGE_PAUSE = Number(process.env.MATRIX_PAGE_PAUSE || 3500);
const only = (name) => (process.env[name] || '').split(',').map((s) => s.trim()).filter(Boolean);
const ONLY_PALETTES = only('MATRIX_PALETTES');
const ONLY_PAGES = only('MATRIX_PAGES');
const ONLY_VIEWPORTS = only('MATRIX_VIEWPORTS');

// palette id → { theme, contrast, <html> classes expected }
const PALETTES = {
  dark: { theme: 'dark', contrast: 'normal', classes: [] },
  light: { theme: 'light', contrast: 'normal', classes: ['light'] },
  'dark-hc': { theme: 'dark', contrast: 'high', classes: ['hc'] },
  'light-hc': { theme: 'light', contrast: 'high', classes: ['light', 'hc'] },
};

const PAGES = [
  ['live', '/live?vkb=0'],
  ['care', '/care'],
  ['medications-schedule', '/care/medications/schedule'],
  ['shipments', '/care/equipment/shipments'],
  ['reports-weekly', '/care/reports/weekly'],
  ['account', '/care/configuration/account'],
  ['capture', '/capture'],
  ['login', '/login'],
];

const VIEWPORTS = {
  desktop: { width: 1280, height: 800, isMobile: false, hasTouch: false },
  phone: { width: 390, height: 844, isMobile: true, hasTouch: true },
};

const pick = (entries, onlyList) => entries.filter(([name]) => !onlyList.length || onlyList.includes(name));

test.describe.configure({ mode: 'serial' });
test.setTimeout(30 * 60_000);
test.skip(!USER || !PASSWORD, 'set MATRIX_USER and MATRIX_PASSWORD');

fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function signIn(request) {
  const res = await request.post(`${API}/api/auth/login`, { data: { username: USER, password: PASSWORD } });
  expect(res.ok(), `login failed: ${res.status()}`).toBeTruthy();
  return (await res.json()).access_token;
}

async function setPreference(request, token, { theme, contrast }) {
  const res = await request.patch(`${API}/api/auth/preferences`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { preferences: { theme, contrast } },
  });
  expect(res.ok(), `preferences PATCH failed: ${res.status()}`).toBeTruthy();
}

// Dismiss anything that opened itself on load (the messages sheet, the
// patient picker) so the screenshot shows the page and axe sees it too.
async function settle(page) {
  await page.waitForTimeout(1500);
  for (let i = 0; i < 2; i += 1) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
  }
}

test('theme matrix: screenshots + colour contrast', async ({ browser, request }) => {
  const token = await signIn(request);
  const host = new URL(BASE).hostname;
  const findings = [];
  const seen = [];

  try {
    for (const [paletteName, palette] of pick(Object.entries(PALETTES), ONLY_PALETTES)) {
      await setPreference(request, token, palette);
      fs.mkdirSync(path.join(OUT, paletteName), { recursive: true });

      for (const [vpName, vp] of pick(Object.entries(VIEWPORTS), ONLY_VIEWPORTS)) {
        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          isMobile: vp.isMobile,
          hasTouch: vp.hasTouch,
          deviceScaleFactor: 1,
        });
        await context.addInitScript(([t, c]) => {
          try { localStorage.setItem('theme', t); localStorage.setItem('contrast', c); } catch { /* private mode */ }
        }, [palette.theme, palette.contrast]);
        await context.addCookies([{ name: 'session_token', value: token, domain: host, path: '/' }]);
        const page = await context.newPage();
        const consoleErrors = [];
        page.on('pageerror', (e) => consoleErrors.push(String(e).slice(0, 200)));

        for (const [pageName, route] of pick(PAGES, ONLY_PAGES)) {
          // /login is a signed-out page: it takes the localStorage seed instead.
          if (pageName === 'login') await context.clearCookies();
          await page.goto(route, { waitUntil: 'networkidle' });
          await settle(page);

          const classes = await page.evaluate(() => [...document.documentElement.classList].sort());
          expect.soft(classes, `${paletteName}/${pageName}/${vpName} <html> classes`).toEqual([...palette.classes].sort());

          const shot = path.join(OUT, paletteName, `${pageName}-${vpName}.png`);
          await page.screenshot({ path: shot, fullPage: false });

          const rules = palette.contrast === 'high'
            ? ['color-contrast', 'color-contrast-enhanced']
            : ['color-contrast'];
          const results = await new AxeBuilder({ page }).withRules(rules).analyze();
          for (const v of results.violations) {
            for (const node of v.nodes) {
              findings.push({
                palette: paletteName, page: pageName, viewport: vpName, rule: v.id,
                target: node.target.join(' '), summary: node.failureSummary?.split('\n').slice(1, 3).join(' ').trim(),
                html: node.html.slice(0, 160),
              });
            }
          }
          seen.push(`${paletteName}/${pageName}/${vpName}`);
          if (consoleErrors.length) {
            findings.push({ palette: paletteName, page: pageName, viewport: vpName, rule: 'pageerror', summary: consoleErrors.splice(0).join(' | ') });
          }
          if (pageName === 'login') await context.addCookies([{ name: 'session_token', value: token, domain: host, path: '/' }]);
          await sleep(PAGE_PAUSE);
        }
        await context.close();
      }
    }
  } finally {
    await setPreference(request, token, PALETTES.dark);
    fs.writeFileSync(path.join(OUT, 'axe.json'), JSON.stringify({ seen, findings }, null, 2));
  }

  const byRule = findings.reduce((m, f) => { m[f.rule] = (m[f.rule] || 0) + 1; return m; }, {});
  console.log(`theme matrix: ${seen.length} page loads, findings by rule: ${JSON.stringify(byRule)}`);
  expect(findings, findings.map((f) => `${f.palette}/${f.page}/${f.viewport} ${f.rule} ${f.target} — ${f.summary}`).join('\n')).toEqual([]);
});
