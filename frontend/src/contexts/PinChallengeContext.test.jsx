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
// Wave 3 — live-dashboard PIN freshness. The PinChallengeModal child is stubbed
// to expose success/cancel buttons; useAuth is mocked.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { useState } from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';

let mockUser;
vi.mock('./AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
vi.mock('../components/auth/PinChallengeModal', () => ({
  default: ({ open, onSuccess, onCancel }) =>
    open ? (
      <div>
        <button data-testid="modal-ok" onClick={onSuccess}>ok</button>
        <button data-testid="modal-cancel" onClick={onCancel}>cancel</button>
      </div>
    ) : null,
}));

import { PinChallengeProvider, usePinChallenge } from './PinChallengeContext';

function Probe() {
  const { pinFresh, pinChallengeOpen, markPinVerified, requirePinAuth } = usePinChallenge();
  const [result, setResult] = useState('');
  return (
    <div>
      <span data-testid="fresh">{String(pinFresh)}</span>
      <span data-testid="open">{String(pinChallengeOpen)}</span>
      <span data-testid="result">{result}</span>
      <button onClick={markPinVerified}>mark</button>
      <button onClick={async () => setResult(String(await requirePinAuth()))}>require</button>
    </div>
  );
}

const renderProvider = () => render(<PinChallengeProvider><Probe /></PinChallengeProvider>);
const fresh = () => screen.getByTestId('fresh').textContent;
const open = () => screen.getByTestId('open').textContent;
const result = () => screen.getByTestId('result').textContent;
const clickBtn = async (label) => { await act(async () => { fireEvent.click(screen.getByText(label)); }); };
const clickId = async (id) => { await act(async () => { fireEvent.click(screen.getByTestId(id)); }); };

beforeEach(() => {
  mockUser = null;
});
afterEach(() => {
  vi.useRealTimers();
});

describe('PinChallengeProvider', () => {
  it('starts not-fresh and resolves immediately once verified', async () => {
    renderProvider();
    expect(fresh()).toBe('false');

    await clickBtn('mark');
    expect(fresh()).toBe('true');

    await clickBtn('require');
    expect(result()).toBe('true');
    expect(open()).toBe('false'); // no modal needed while fresh
  });

  it('opens the challenge when stale and resolves true on success', async () => {
    renderProvider();
    await clickBtn('require');
    expect(open()).toBe('true');

    await clickId('modal-ok');
    expect(open()).toBe('false');
    expect(result()).toBe('true');
    expect(fresh()).toBe('true'); // success re-arms freshness
  });

  it('resolves false when the challenge is cancelled', async () => {
    renderProvider();
    await clickBtn('require');
    expect(open()).toBe('true');

    await clickId('modal-cancel');
    expect(open()).toBe('false');
    expect(result()).toBe('false');
  });

  it('auto-arms freshness when a user is already present', () => {
    mockUser = { id: 1 };
    renderProvider();
    expect(fresh()).toBe('true');
  });

  it('expires after the idle window, then re-challenges', async () => {
    vi.useFakeTimers();
    renderProvider();
    await act(async () => { fireEvent.click(screen.getByText('mark')); });
    expect(fresh()).toBe('true');

    await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 30_000); });
    expect(fresh()).toBe('false');

    await act(async () => { fireEvent.click(screen.getByText('require')); });
    expect(open()).toBe('true');
  });
});
