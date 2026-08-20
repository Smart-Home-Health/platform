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
// The sharing mode is a summary of sixteen dropdowns, so the claims worth
// pinning are that it never overstates the posture (nothing shared is not
// "monitor only"), and that switching modes changes direction without quietly
// starting to publish something nobody chose to share.
import { describe, it, expect } from 'vitest';
import {
  applyMode, groupRows, monitorOnlyDefaults, permissionGroups, sharedCount, sharingMode,
} from './haSharing';
import { MQTT_SECTIONS } from '../../mqttConstants';

describe('permissionGroups', () => {
  it('covers every section exactly once', () => {
    const ids = permissionGroups().flatMap((g) => g.sections);
    expect([...ids].sort()).toEqual(MQTT_SECTIONS.map((s) => s.id).sort());
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('sharingMode', () => {
  it('is "none" when nothing is shared', () => {
    expect(sharingMode({})).toBe('none');
    expect(sharingMode({ spo2: 'off', bpm: 'off' })).toBe('none');
  });

  it('is "monitor" when every shared section is read-only', () => {
    expect(sharingMode({ spo2: 'get', bpm: 'get', weight: 'off' })).toBe('monitor');
  });

  it('is "control" when the writable sections write back and the read-only ones cannot', () => {
    // Badge counts have no set handler, so 'get' is their control value.
    expect(sharingMode({ spo2: 'both', meds_counts: 'get' })).toBe('control');
    expect(sharingMode({ spo2: 'both', meds_counts: 'off' })).toBe('control');
  });

  it('is "custom" for anything mixed', () => {
    expect(sharingMode({ spo2: 'get', bpm: 'both' })).toBe('custom');
    expect(sharingMode({ spo2: 'set' })).toBe('custom');
  });
});

describe('applyMode', () => {
  it('changes direction without sharing anything new', () => {
    const before = { spo2: 'both', bpm: 'off', meds_counts: 'both', weight: 'set' };
    const after = applyMode(before, 'monitor');
    expect(after).toEqual({ spo2: 'get', bpm: 'off', meds_counts: 'get', weight: 'get' });
    expect(sharingMode(after)).toBe('monitor');
  });

  it('leaves read-only sections on get when control is allowed', () => {
    const after = applyMode({ spo2: 'get', meds_counts: 'get', bpm: 'off' }, 'control');
    expect(after).toEqual({ spo2: 'both', meds_counts: 'get', bpm: 'off' });
    expect(sharingMode(after)).toBe('control');
  });

  it('is a no-op for custom', () => {
    const before = { spo2: 'get', bpm: 'both' };
    expect(applyMode(before, 'custom')).toEqual(before);
  });
});

describe('groupRows', () => {
  it('counts what is shared per group and says so when nothing is', () => {
    const rows = groupRows({ spo2: 'get', bpm: 'both', blood_pressure: 'off' });
    const live = rows.find((r) => r.id === 'live');
    expect(live.sharedCount).toBe(2);
    expect(live.total).toBe(5);
    expect(live.status.label).toBe('2 shared');

    const alarms = rows.find((r) => r.id === 'alarms');
    expect(alarms.sharedCount).toBe(0);
    expect(alarms.status.label).toBe('Not shared');
  });

  it('describes a group by its members, using the shared section labels', () => {
    const live = groupRows({}).find((r) => r.id === 'live');
    expect(live.blurb).toBe('SpO₂, Heart Rate, Perfusion, Temperature, Blood Pressure');
  });
});

describe('monitorOnlyDefaults', () => {
  it('starts a fresh profile read-only across the board', () => {
    const defaults = monitorOnlyDefaults();
    expect(sharedCount(defaults)).toBe(MQTT_SECTIONS.length);
    expect(sharingMode(defaults)).toBe('monitor');
  });
});
