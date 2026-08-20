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
// Reading one ventilator parameter's day.
//
// The device reports each parameter as up to four series per day — the 5th,
// 50th and 95th percentile of each sampling window (suffixes '5' / '50' /
// '95') and, for parameters it does not percentile, a single value ('N', or
// no suffix at all). The API returns count/min/max/mean of each of those
// series over the day. Everything below is about turning that into something
// a person can read without being misled.
//
// What we can and cannot say about trust:
//   We can flag *provenance* — no scale in the dictionary, no units, a
//   parameter we have never seen, no median series, or samples blended from
//   more than one device message. We cannot flag *correctness*. PEEP #9404 carries a
//   scale_factor of 1.0 and still reads 370 cmH2O; 1.0 is also the parser's
//   fallback for unknown, so a "verified" badge would be green on a number
//   that is plainly wrong. There is no verification step in this pipeline and
//   the UI must not imply one.

/* Provenance problems, worst first. `tone` drives the chip colour; nothing
 * here asserts a value is right, only that we know where it came from. */
export const FLAGS = {
  unknown: {
    label: 'Unknown parameter', tone: 'alert',
    hint: 'Not in the vendor dictionary — no label, units or scale.',
  },
  rawOnly: {
    label: 'Raw only', tone: 'due',
    hint: 'No median series for this day; showing the device’s single value.',
  },
  noScale: {
    label: 'No scale', tone: 'due',
    hint: 'The dictionary has no scale factor, so the value is in vendor units.',
  },
  mixedSources: {
    label: 'Mixed sources', tone: 'alert',
    hint: 'Samples come from more than one device message — on this device that '
      + 'means standby telemetry blended with active ventilation, so the value '
      + 'is an average of two different things.',
  },
  bandInverted: {
    label: 'Band inverted', tone: 'due',
    hint: 'The 5th percentile averaged above the 95th over the day. Usually a '
      + 'symptom of blended sources rather than anything the device did wrong.',
  },
  noUnits: {
    label: 'No units', tone: 'idle',
    hint: 'The dictionary does not say what this value is measured in.',
  },
};

const FLAG_ORDER = ['unknown', 'mixedSources', 'rawOnly', 'noScale',
  'bandInverted', 'noUnits'];

const stat = (param, suffix) => param?.stats_by_suffix?.[suffix] ?? null;

/** The value the row leads with, and where it came from.
 *
 * Prefers the median series. `mean` is the average of the day's medians, not
 * a median of the day — the labelling has to say so, which is why `basis`
 * comes back with it rather than being assumed by the caller.
 */
export function headlineOf(param) {
  const median = stat(param, '50');
  const raw = stat(param, 'N') ?? stat(param, '');
  const source = median ? median : raw;
  if (!source) return null;
  return {
    value: source.mean,
    lo: source.lo,
    hi: source.hi,
    n: source.n,
    basis: median ? 'median' : 'raw',
  };
}

/** The 5th–95th percentile band, ordered low to high.
 *
 * Three of 44 parameters on a real day average p5 above p95, which printed as
 * "660.7 – 40.4" before this sorted them. That is almost always the blend of
 * two device messages showing through rather than anything the device did, so
 * sorting keeps the range readable and `inverted` keeps the symptom.
 */
export function bandOf(param) {
  const p5 = stat(param, '5');
  const p95 = stat(param, '95');
  const lo = p5?.mean ?? p5?.lo ?? null;
  const hi = p95?.mean ?? p95?.hi ?? null;
  if (lo == null || hi == null) return null;
  const inverted = lo > hi;
  return { lo: inverted ? hi : lo, hi: inverted ? lo : hi, inverted };
}

/** Is this parameter one we have never seen in the vendor dictionary?
 *
 * The API falls back to the bare key for the label when the join misses, so
 * a label equal to its own key is the tell — paired with a missing type, so a
 * dictionary entry that genuinely labels itself "9408" is not caught. */
export function isUnknownParameter(param) {
  if (!param) return false;
  return !param.display_type
    && String(param.display_label ?? '') === String(param.parameter_key ?? '');
}

/** How many distinct device messages fed this parameter's day. */
export function sourceCount(param) {
  return (param?.sources || []).length;
}

/** Every provenance flag that applies, worst first. */
export function flagsFor(param) {
  if (!param) return [];
  const band = bandOf(param);
  const mixed = sourceCount(param) > 1;
  const hit = {
    unknown: isUnknownParameter(param),
    mixedSources: mixed,
    rawOnly: !stat(param, '50'),
    noScale: param.scale_factor == null,
    // An inverted band is nearly always the blend showing through. Saying both
    // implies two problems where there is one, so the cause wins.
    bandInverted: Boolean(band?.inverted) && !mixed,
    noUnits: !param.display_units,
  };
  // An unknown parameter is missing its units and scale by definition;
  // listing all three says the same thing three times.
  if (hit.unknown) { hit.noScale = false; hit.noUnits = false; }
  return FLAG_ORDER.filter((key) => hit[key]).map((key) => ({ key, ...FLAGS[key] }));
}

/** Does this parameter want a human to look at it before it is trusted? */
export function needsReview(param) {
  return flagsFor(param).some((f) => f.tone === 'alert' || f.tone === 'due');
}

/** Where the headline sits inside its own range, 0–1, or null when it cannot
 * be placed. Drives the little position strip on each row: a value pinned at
 * one end of its day is worth seeing without opening a chart. */
export function bandPosition(value, lo, hi) {
  if (value == null || lo == null || hi == null) return null;
  if (!(hi > lo)) return null;
  const frac = (value - lo) / (hi - lo);
  return Math.min(1, Math.max(0, frac));
}

/** Vendor precision, clamped. Values in the thousands never want decimals —
 * a raw counter reading 3029.0 is noise dressed as precision. */
export function formatValue(value, precision) {
  if (value == null || Number.isNaN(value)) return null;
  const abs = Math.abs(value);
  const digits = abs >= 1000 ? 0 : Math.min(Math.max(precision ?? 1, 0), 4);
  return value.toFixed(digits);
}

/** Flatten the API's groups into rows, keeping group order and membership. */
export function rowsFrom(dayData) {
  return (dayData?.groups || []).flatMap((group) =>
    (group.parameters || []).map((param) => ({
      group: group.name,
      param,
      headline: headlineOf(param),
      band: bandOf(param),
      flags: flagsFor(param),
      review: needsReview(param),
    })),
  );
}

/** Rows matching a free-text query over label and vendor key. */
export function matchesQuery(row, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return true;
  const p = row.param;
  return String(p.display_label ?? '').toLowerCase().includes(q)
    || String(p.parameter_key ?? '').toLowerCase().includes(q);
}
