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
// Wave 3 — admin idle auto-lock. Router/auth/settings/config are mocked; fake
// timers drive the 30s tick and 5-minute idle window.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';

const navigate = vi.fn();
const checkSession = vi.fn();
const apiFetch = vi.fn();
const getSetting = vi.fn();
let mockAuth;
let mockLocation;

vi.mock('react-router-dom', () => ({
  useLocation: () => mockLocation,
  useNavigate: () => navigate,
}));
vi.mock('./AuthContext', () => ({ useAuth: () => mockAuth }));
vi.mock('../services/settings', () => ({ getSetting: (...a) => getSetting(...a) }));
vi.mock('../config', () => ({ apiFetch: (...a) => apiFetch(...a), API_BASE_URL: 'http://api' }));

import { IdleLockProvider } from './IdleLockContext';

const IDLE_MS = 5 * 60 * 1000;
const TICK_MS = 30_000;

const renderProvider = () => render(<IdleLockProvider><div /></IdleLockProvider>);

beforeEach(() => {
  vi.useFakeTimers();
  navigate.mockReset();
  checkSession.mockReset().mockResolvedValue();
  apiFetch.mockReset().mockResolvedValue({ ok: true });
  getSetting.mockReset().mockResolvedValue('select-user');
  mockAuth = { authLevel: 'full', checkSession };
  mockLocation = { pathname: '/care' };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('IdleLockProvider', () => {
  it('locks after the idle window elapses while fully authed', async () => {
    renderProvider();
    await vi.advanceTimersByTimeAsync(0); // flush the lock-target getSetting
    await vi.advanceTimersByTimeAsync(IDLE_MS + TICK_MS);

    expect(apiFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/lock'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(checkSession).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/select-user', { replace: true });
  });

  it('activity rolls the deadline forward and defers the lock', async () => {
    renderProvider();
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(4 * 60 * 1000); // 4 min idle
    document.dispatchEvent(new MouseEvent('mousedown')); // reset deadline
    await vi.advanceTimersByTimeAsync(4 * 60 * 1000); // 4 more min (since activity)
    expect(navigate).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2 * 60 * 1000); // now >5 min since activity
    expect(navigate).toHaveBeenCalledWith('/select-user', { replace: true });
  });

  it('does not arm at account level', async () => {
    mockAuth = { authLevel: 'account', checkSession };
    renderProvider();
    await vi.advanceTimersByTimeAsync(IDLE_MS + TICK_MS);
    expect(navigate).not.toHaveBeenCalled();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('does not arm on an exempt route (/live)', async () => {
    mockLocation = { pathname: '/live' };
    renderProvider();
    await vi.advanceTimersByTimeAsync(IDLE_MS + TICK_MS);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('honors the idle_lock_target=live setting', async () => {
    getSetting.mockResolvedValue('live');
    renderProvider();
    await vi.advanceTimersByTimeAsync(0); // let the setting resolve
    await vi.advanceTimersByTimeAsync(IDLE_MS + TICK_MS);
    expect(navigate).toHaveBeenCalledWith('/live', { replace: true });
  });
});
