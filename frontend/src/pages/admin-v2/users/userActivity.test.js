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
import { describe, expect, it } from 'vitest';
import { describeActivity, describeActivityList } from './userActivity';

const NOW = new Date('2026-08-20T15:00:00');

describe('describeActivity', () => {
  it('gives a known action plain wording and a tone', () => {
    const row = describeActivity(
      { id: 1, action: 'login.success', timestamp: '2026-08-20T10:42:00' }, NOW,
    );
    expect(row).toMatchObject({
      label: 'Signed in with a password',
      tone: 'success',
      known: true,
      when: 'Today, 10:42 AM',
    });
  });

  it('keeps an unknown action verbatim rather than guessing at it', () => {
    const row = describeActivity(
      { id: 2, action: 'schedule.undo', timestamp: '2026-08-20T10:42:00' }, NOW,
    );
    expect(row.label).toBe('schedule.undo');
    expect(row.known).toBe(false);
    expect(row.tone).toBe('muted');
  });

  it('credits the administrator who caused the entry', () => {
    const row = describeActivity({
      id: 3,
      action: 'user.password_reset.admin_set',
      timestamp: '2026-08-18T18:12:00',
      actor_name: 'John Carty',
      ip_address: '192.168.1.10',
    }, NOW);
    expect(row.label).toBe('Password reset');
    expect(row.detail).toBe('by John Carty · 192.168.1.10');
  });

  it('shows the address alone for the user’s own events', () => {
    const row = describeActivity(
      { id: 4, action: 'logout', timestamp: '2026-08-20T09:00:00', ip_address: '10.0.0.4' }, NOW,
    );
    expect(row.detail).toBe('10.0.0.4');
  });

  it('maps a whole list', () => {
    expect(describeActivityList([
      { id: 1, action: 'pin_auth.success', timestamp: '2026-08-20T10:00:00' },
      { id: 2, action: 'pin_auth.failed', timestamp: '2026-08-20T09:00:00' },
    ], NOW).map((r) => r.tone)).toEqual(['success', 'danger']);
  });
});
