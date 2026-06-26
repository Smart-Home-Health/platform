/*
 * Smart Home Health Hub
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
// Wave 5 — browser smoke against the live docker-compose stack.
//
// The first test is credential-free: it drives the real two-layer auth up to
// the user picker via "Continue without unlocking" (account-level access).
//
// The full login -> /care step needs a real user credential, so it is GATED by
// env vars and skipped unless provided:
//   E2E_USER      display name (or username) of the profile to pick, e.g. "John Carty"
//   E2E_PASSWORD  that user's full password           (preferred — deterministic)
//   E2E_PIN       that user's PIN                      (alternative)
// Example:
//   E2E_USER="John Carty" E2E_PASSWORD=secret npm --prefix frontend run e2e
import { test, expect } from '@playwright/test';

test.describe('auth smoke', () => {
  test('login page -> continue without unlocking -> user picker', async ({ page }) => {
    await page.goto('/login');

    // Layer 1: the account sign-in screen.
    await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();

    // Account-level access (no account password) lands on the user picker.
    await page.getByRole('button', { name: 'Continue without unlocking' }).click();

    await expect(page).toHaveURL(/\/select-user$/);
    await expect(page.getByRole('heading', { name: 'Select User' })).toBeVisible();
    // At least one profile card is rendered for the account.
    await expect(page.locator('.user-card').first()).toBeVisible();
  });

  test('full login reaches /care', async ({ page }) => {
    const user = process.env.E2E_USER;
    const password = process.env.E2E_PASSWORD;
    const pin = process.env.E2E_PIN;
    test.skip(!user || (!password && !pin), 'set E2E_USER + E2E_PASSWORD or E2E_PIN to run');

    await page.goto('/login');
    await page.getByRole('button', { name: 'Continue without unlocking' }).click();
    await expect(page).toHaveURL(/\/select-user$/);

    // Pick the profile (cards show the full name / username).
    await page.locator('.user-card', { hasText: user }).first().click();

    if (password) {
      // Prefer password: switch off PIN entry when the toggle is offered.
      const toggle = page.getByRole('button', { name: 'Use password instead' });
      if (await toggle.isVisible().catch(() => false)) await toggle.click();
      await page.locator('#password').fill(password);
    } else {
      await page.locator('#pin').fill(pin);
    }

    await page.getByRole('button', { name: 'Sign In' }).click();

    // Landing on /care (the admin hub) means full auth succeeded.
    await expect(page).toHaveURL(/\/care/, { timeout: 15_000 });
  });
});
