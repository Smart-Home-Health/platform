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
import { describe, it, expect } from 'vitest';
import {
  SHIPMENT_STEPS, STATUS_FILTERS, statusInfo, statusLabel, statusTone,
  isOpen, isFinalized, stepStates, needsAttention, detailStep,
} from './shipmentStatus';

describe('statusInfo', () => {
  it('covers every status the backend writes', () => {
    // create default, template delivery, item ship, first receipt, finalize x2
    ['draft', 'ordered', 'shipped', 'receiving', 'complete', 'partial'].forEach((s) => {
      expect(statusInfo(s).label).not.toBe('Unknown');
    });
  });

  it('has no entry for verified, which nothing sets', () => {
    // The old badge maps listed it; no backend path produces it.
    expect(statusInfo('verified').label).toBe('verified');
    expect(statusInfo('verified').tone).toBe('idle');
  });

  it('renders an unrecognised status rather than throwing', () => {
    expect(statusLabel(undefined)).toBe('Unknown');
    expect(statusTone('banana')).toBe('idle');
    expect(statusLabel('banana')).toBe('banana');
  });

  it('separates arrival from completion', () => {
    expect(statusLabel('receiving')).toBe('Receiving');
    expect(statusLabel('complete')).toBe('Received');
    expect(statusTone('complete')).toBe('complete');
    expect(statusTone('partial')).toBe('due');
    expect(statusTone('draft')).toBe('due');
  });
});

describe('isOpen', () => {
  it('counts anything before finalize as open', () => {
    ['draft', 'ordered', 'shipped', 'receiving'].forEach((status) => {
      expect(isOpen({ status })).toBe(true);
    });
  });

  it('counts both finalize outcomes as closed', () => {
    expect(isOpen({ status: 'complete' })).toBe(false);
    expect(isOpen({ status: 'partial' })).toBe(false);
  });
});

describe('isFinalized', () => {
  it('reads the timestamp, not the status', () => {
    expect(isFinalized({ status: 'complete', finalized_at: '2026-08-19T00:00:00Z' })).toBe(true);
    expect(isFinalized({ status: 'complete', finalized_at: null })).toBe(false);
    expect(isFinalized(null)).toBe(false);
  });
});

describe('stepStates', () => {
  const labels = (s) => stepStates(s).map((x) => x.state);

  it('puts a draft on the first step, still in progress', () => {
    expect(labels({ status: 'draft' })).toEqual(['current', 'todo', 'todo', 'todo']);
  });

  it('advances with the lifecycle', () => {
    expect(labels({ status: 'ordered' })).toEqual(['done', 'done', 'todo', 'todo']);
    expect(labels({ status: 'shipped' })).toEqual(['done', 'done', 'done', 'todo']);
  });

  it('marks receiving as arrived but not finished', () => {
    expect(labels({ status: 'receiving' })).toEqual(['done', 'done', 'done', 'current']);
  });

  it('fills the rail once finalized, including a partial', () => {
    expect(labels({ status: 'complete' })).toEqual(['done', 'done', 'done', 'done']);
    expect(labels({ status: 'partial' })).toEqual(['done', 'done', 'done', 'done']);
  });

  it('fills the rail for a finalized shipment whose status never advanced', () => {
    // finalize can be reached from a status the rail would otherwise show as early
    expect(labels({ status: 'draft', finalized_at: '2026-08-19T00:00:00Z' }))
      .toEqual(['done', 'done', 'done', 'done']);
  });

  it('returns one entry per named step', () => {
    expect(stepStates({ status: 'draft' }).map((s) => s.label)).toEqual(SHIPMENT_STEPS);
  });
});

describe('needsAttention', () => {
  it('flags a partial delivery', () => {
    expect(needsAttention({ status: 'partial' })).toBe(true);
  });

  it('flags unresolved alerts on an otherwise fine shipment', () => {
    expect(needsAttention({ status: 'complete', unresolved_alert_count: 2 })).toBe(true);
  });

  it('leaves a clean shipment alone', () => {
    expect(needsAttention({ status: 'complete', unresolved_alert_count: 0 })).toBe(false);
    expect(needsAttention({ status: 'draft' })).toBe(false);
    expect(needsAttention(null)).toBe(false);
  });
});

describe('detailStep', () => {
  it('opens a draft on the list it still needs', () => {
    expect(detailStep({ status: 'draft' })).toBe('build');
  });

  it('opens an in-flight shipment on shipping', () => {
    expect(detailStep({ status: 'ordered' })).toBe('shipping');
    expect(detailStep({ status: 'shipped' })).toBe('shipping');
  });

  it('opens an arriving or finished shipment on receive', () => {
    expect(detailStep({ status: 'receiving' })).toBe('receive');
    expect(detailStep({ status: 'complete', finalized_at: '2026-08-19T00:00:00Z' })).toBe('receive');
  });
});

describe('STATUS_FILTERS', () => {
  it('offers exactly the statuses the server can produce', () => {
    expect(STATUS_FILTERS).toEqual(['draft', 'ordered', 'shipped', 'receiving', 'complete', 'partial']);
  });
});
