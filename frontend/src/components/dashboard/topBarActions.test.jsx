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
// The single source for the top bar and the nav drawer. The case worth
// pinning is the camera: it is the one conditional action, and it used to take
// the Messages slot rather than add one — so configuring a camera silently
// removed the messages list from the board.
import { describe, it, expect, vi } from 'vitest';
import { buildTopBarActions, NAV_GROUPS } from './topBarActions';

const build = (over = {}) => buildTopBarActions({
  pulseOxAlerts: 0, medicationDueCount: 0, nutritionDueCount: 0,
  careTaskDueCount: 0, equipmentDueCount: 0,
  hasCamera: false,
  modalOpen: {},
  handlers: {
    alerts: vi.fn(), medications: vi.fn(), nutrition: vi.fn(), careTasks: vi.fn(),
    equipment: vi.fn(), history: vi.fn(), camera: vi.fn(), messages: vi.fn(),
    capture: vi.fn(),
  },
  ...over,
});

describe('buildTopBarActions', () => {
  it('keeps Messages whether or not a camera is configured', () => {
    expect(build().map(a => a.key)).toContain('messages');
    expect(build({ hasCamera: true }).map(a => a.key)).toContain('messages');
  });

  it('shows the camera only when one is configured', () => {
    expect(build().map(a => a.key)).not.toContain('camera');
    expect(build({ hasCamera: true }).map(a => a.key)).toContain('camera');
  });

  it('adds the camera rather than replacing anything', () => {
    expect(build({ hasCamera: true })).toHaveLength(build().length + 1);
  });

  it('puts Capture Vitals immediately before History', () => {
    const keys = build().map(a => a.key);
    expect(keys.indexOf('history')).toBe(keys.indexOf('capture') + 1);
  });

  it('files every action under a real nav group, so none is drawer-only', () => {
    const groups = NAV_GROUPS.map(g => g.key);
    build({ hasCamera: true }).forEach(a => expect(groups).toContain(a.group));
  });

  it('passes the due counts through as badges', () => {
    const actions = build({ medicationDueCount: 3, pulseOxAlerts: 7 });
    expect(actions.find(a => a.key === 'medications').badge).toBe(3);
    expect(actions.find(a => a.key === 'alerts').badge).toBe(7);
  });
});
