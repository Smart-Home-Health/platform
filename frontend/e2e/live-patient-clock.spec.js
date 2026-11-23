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

const patients = [
  { id: 1, first_name: 'Avery', last_name: 'Green', is_active: true },
  { id: 2, first_name: 'Robin', last_name: 'Gray', is_active: true },
];
const sample = { 1: { spo2: 99, bpm: 82 }, 2: { spo2: 97, bpm: 75 } };
const now = new Date('2026-01-12T13:55:00Z');

test.use({ locale: 'en-US', timezoneId: 'UTC', hasTouch: true });

for (const mobile of [false, true]) {
  test(`patient reading opens the live monitor and clock preference persists on ${mobile ? 'phone' : 'desktop'}`, async ({ page }) => {
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
    await page.clock.setFixedTime(now);
    if (!mobile) {
      await page.addInitScript(() => sessionStorage.setItem('adminSelectedPatientId', '1'));
    }

    const historyPatients = [];
    let liveSocket;
    await page.routeWebSocket('**/ws/sensors', ws => {
      if (new URL(page.url()).pathname === '/live') liveSocket = ws;
    });
    await page.route('**/api/**', async route => {
      const { pathname, searchParams } = new URL(route.request().url());
      let json = [];
      switch (pathname) {
        case '/api/auth/first-run': json = { is_first_run: false }; break;
        case '/api/auth/session': json = { account_id: 1, user_id: 1, is_system_admin: true }; break;
        case '/api/patients': json = patients; break;
        case '/api/dashboard/summary':
          json = { patients: patients.map(p => ({ ...p, name: `${p.first_name} ${p.last_name}`, has_pulse_ox: true })) };
          break;
        case '/api/dashboard/patient-readings': json = sample; break;
        case '/api/monitoring/history/recent':
          historyPatients.push(searchParams.get('patient_id'));
          json = { points: [{ t: now.getTime(), ...sample[2], perfusion: 2 }] };
          break;
      }
      await route.fulfill({ json });
    });

    await page.goto('/care');
    const reading = page.getByRole('link', { name: /97%/ });
    if (mobile) await reading.tap();
    else await reading.click();
    await expect(page).toHaveURL(/\/live\?patient=2$/);
    await expect.poll(() => historyPatients).toContain('2');
    expect(historyPatients).not.toContain('1');
    await expect(page.getByText('Select Patient', { exact: true })).toHaveCount(0);
    await expect.poll(() => Boolean(liveSocket)).toBe(true);
    liveSocket.send(JSON.stringify({ type: 'sensor_update', state: { patient_readings: sample } }));
    await expect(page.locator('.ld-tile-value').first()).toHaveText('97');

    const clock = page.locator('.ld-clock-time');
    await expect(clock).toHaveText('13:55:00');
    await page.getByRole('button', { name: 'Switch to 12-hour time' }).click();
    await expect(clock).toHaveText('1:55:00 PM');
    if (!mobile) {
      await expect(page.locator('.ld-charts .recharts-xAxis').getByText('1:55 PM')).toBeVisible();
      const oxygenChart = page.locator('.ld-chart').first();
      await oxygenChart.locator('.recharts-wrapper').hover();
      await expect(oxygenChart.getByText('1:55:00 PM')).toBeVisible();
    }
    await page.setViewportSize({ width: mobile ? 320 : 769, height: 900 });
    await expect(clock).toBeInViewport({ ratio: 1 });
    await page.reload();
    await expect(clock).toHaveText('1:55:00 PM');
    await page.getByRole('button', { name: 'Switch to 24-hour time' }).press('Enter');
    await expect(clock).toHaveText('13:55:00');
    await page.clock.setFixedTime(new Date('2026-01-13T00:00:00Z'));
    await expect(clock).toHaveText('00:00:00');
  });
}
