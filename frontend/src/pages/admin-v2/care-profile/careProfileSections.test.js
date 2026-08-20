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
// The hub's summary is the one place a care profile claims to be "ready", so
// the claims worth pinning are about honesty: a vital with no bounds keeps the
// section in review, sharing that publishes nothing is not "connected", and a
// section the backend cannot store never counts toward the ready tally.
import { describe, it, expect } from 'vitest';
import {
  measurementsSummary, homeAssistantSummary, careContextSummary, featuresSummary,
  setupTotals,
} from './careProfileSections';

const range = (over = {}) => ({
  vital_key: 'spo2', field_key: '', expected_min: 90, expected_max: 100,
  required: false, source: 'patient', ...over,
});

describe('measurementsSummary', () => {
  it('counts a vital as bounded when only its component rows carry bounds', () => {
    const { status, facts } = measurementsSummary({
      ranges: [
        range({ vital_key: 'blood_pressure', expected_min: null, expected_max: null }),
        range({ vital_key: 'blood_pressure', field_key: 'systolic', expected_min: 90, expected_max: 140 }),
        range({ vital_key: 'blood_pressure', field_key: 'diastolic', expected_min: 60, expected_max: 90 }),
      ],
    });
    expect(status).toBe('ready');
    expect(facts).toContain('1 ranges set');
  });

  it('needs review while any vital has no expected range', () => {
    const { status, facts } = measurementsSummary({
      ranges: [range(), range({ vital_key: 'weight', expected_min: null, expected_max: null })],
    });
    expect(status).toBe('review');
    expect(facts).toContain('1 ranges set · 1 not set');
  });

  it('separates custom vitals from the standard set and counts required readings', () => {
    const { facts } = measurementsSummary({
      ranges: [
        range({ required: true }),
        range({ vital_key: 'peak_flow' }),
      ],
      customDefinitions: [{ name: 'peak_flow' }],
    });
    expect(facts[0]).toBe('1 standard · 1 custom');
    expect(facts).toContain('1 required reading');
  });

  it('reports room bounds only when room ranges came back', () => {
    const withEnv = measurementsSummary({
      ranges: [range()],
      envRanges: [
        { metric: 'temperature', caution_min: 18, critical_max: 30 },
        { metric: 'co2', caution_max: null, critical_max: null },
      ],
    });
    expect(withEnv.facts).toContain('1 of 2 room conditions bounded');
    expect(measurementsSummary({ ranges: [range()] }).facts.join()).not.toMatch(/room conditions/);
  });

  it('says so when nothing is set up rather than claiming zero of zero', () => {
    expect(measurementsSummary({}).status).toBe('review');
    expect(measurementsSummary({}).facts).toEqual(['No measurements have been set up yet']);
  });
});

describe('homeAssistantSummary', () => {
  it('is off — not broken — when the hub has MQTT disabled', () => {
    expect(homeAssistantSummary({ globalOn: false, enabled: true }).status).toBe('off');
  });

  it('is optional when the hub publishes but this profile does not', () => {
    expect(homeAssistantSummary({ globalOn: true, enabled: false }).status).toBe('optional');
  });

  it('flags sharing that is switched on but publishes nothing', () => {
    const { status, facts } = homeAssistantSummary({
      globalOn: true, enabled: true, sections: { spo2: 'off' },
    });
    expect(status).toBe('error');
    expect(facts).toEqual(['Sharing is on, but no sections are shared']);
  });

  it('names the sharing mode and the topic source once sections are shared', () => {
    const readOnly = homeAssistantSummary({
      globalOn: true, enabled: true, totalSections: 16,
      sections: { spo2: 'get', bpm: 'get', weight: 'off' },
    });
    expect(readOnly.status).toBe('ready');
    expect(readOnly.facts).toEqual([
      '2 of 16 sections shared', 'Monitor only', 'Default topics',
    ]);

    const mixed = homeAssistantSummary({
      globalOn: true, enabled: true, totalSections: 16,
      sections: { spo2: 'get', bpm: 'both' },
      topicOverrides: { state_topic: 'custom/state', set_topic: '' },
    });
    expect(mixed.facts).toContain('Custom sharing');
    expect(mixed.facts).toContain('Custom topics');
  });
});

describe('careContextSummary', () => {
  it('treats whitespace-only notes as no notes', () => {
    expect(careContextSummary({ notes: '   ' }).facts[0]).toBe('No profile notes added');
    expect(careContextSummary({ notes: 'Sleeps late' }).facts[0]).toBe('Profile notes added');
  });

  it('names the linked care area', () => {
    expect(careContextSummary({ care_area: "Elijah's room" }).facts[1])
      .toBe("Care area: Elijah's room");
  });
});

describe('setupTotals', () => {
  it('leaves planned and optional sections out of every tally', () => {
    const totals = setupTotals([
      featuresSummary(),
      { status: 'ready' },
      { status: 'review' },
      { status: 'error' },
      { status: 'optional' },
      { status: 'off' },
    ]);
    expect(totals).toEqual({ ready: 1, review: 1, errors: 1 });
  });
});
