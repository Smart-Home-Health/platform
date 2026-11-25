import { expect, test } from '@playwright/test';

const ingress = '/test-ingress';
const board = `${ingress}/live?patient=1`;
const caregiver = { id: 2, username: 'caregiver', full_name: 'Test Caregiver', has_pin: true };
const account = { id: 1 };

async function openSharedBoard(page, { haAccountAuth, readRestricted = false }) {
  const accountSession = { auth_level: 'account', account, read_restricted: false };
  let restoring = readRestricted;
  await page.addInitScript(() => {
    localStorage.setItem('dashboardUnlockedAt', String(Date.now() - 25 * 60 * 60 * 1000));
  });
  await page.route(`**${ingress}/live?*`, async route => {
    const response = await route.fetch({ url: new URL('/live', route.request().url()).href });
    const html = (await response.text()).replace('window.__BASE_PATH__ = ""', `window.__BASE_PATH__ = "${ingress}"`);
    await route.fulfill({ response, body: html });
  });
  await page.routeWebSocket('**/ws/sensors', () => {});
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname.replace(ingress, '');
    let json = [];
    switch (path) {
      case '/api/auth/first-run': json = { is_first_run: false, ha_account_auth: haAccountAuth }; break;
      case '/api/auth/session': json = { account_id: 1, read_restricted: readRestricted }; break;
      case '/api/auth/ha/login':
        if (restoring) return route.fulfill({ status: 503, json: {} });
        json = accountSession;
        break;
      case '/api/auth/account/users': json = [caregiver]; break;
      case '/api/auth/user/select':
        expect(route.request().postDataJSON()).toEqual({ user_id: caregiver.id, pin: '1234' });
        json = { account, user: caregiver, read_restricted: false };
        break;
      case '/api/patients': json = [{ id: 1, first_name: 'Test', last_name: 'Patient', is_active: true }]; break;
    }
    await route.fulfill({ json });
  });
  await page.goto(board);
  return () => { restoring = false; };
}

test('a shared HA board opens the selected action after caregiver verification with an expired daily unlock', async ({ page }) => {
  await openSharedBoard(page, { haAccountAuth: true });
  await page.getByRole('button', { name: 'Messages', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Verify Caregiver' });
  await expect(picker).toBeVisible();
  await expect(page.getByLabel('Account password')).toHaveCount(0);
  await picker.getByRole('button', { name: caregiver.full_name }).click();
  await page.keyboard.type('1234');
  await picker.getByRole('button', { name: 'Verify', exact: true }).click();
  await expect(page.getByRole('dialog', { name: /Messages/ })).toBeVisible();
  await expect(page).toHaveURL(url => url.pathname + url.search === board);
});

test('the board enforces daily confirmation when an account password is required', async ({ page }) => {
  await openSharedBoard(page, { haAccountAuth: false });
  await page.getByRole('button', { name: 'Messages', exact: true }).click();
  await expect(page.getByLabel('Account password')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Verify Caregiver' })).toHaveCount(0);
});

test('a restricted HA session can retry account recovery on the board', async ({ page }) => {
  const reconnect = await openSharedBoard(page, { haAccountAuth: true, readRestricted: true });
  const restore = page.getByRole('button', { name: 'Restore access' });
  await restore.click();
  await expect(page.getByRole('alert')).toContainText('Could not restore Home Assistant access');
  await expect(page.getByLabel('Account password')).toHaveCount(0);
  reconnect();
  await restore.click();
  await page.getByRole('button', { name: 'Messages', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Verify Caregiver' })).toBeVisible();
});
