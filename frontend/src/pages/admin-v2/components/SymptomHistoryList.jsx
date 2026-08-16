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
// Symptom history as a date-grouped timeline (from the supplied mockup):
// search + filter panel, 7D/30D/90D/ALL range chips, records summary,
// amber dots for still-active entries and green for resolved.
import { useMemo, useState } from 'react';
import {
  ChevronDownIcon, ChevronRightIcon, FilterIcon, SearchIcon,
} from '../../../components/Icons';
import { titleCase, bandFor } from './symptomUtils';
import '../symptom-log.css';

const RANGES = [
  { key: '7d', label: '7D', days: 7 },
  { key: '30d', label: '30D', days: 30 },
  { key: '90d', label: '90D', days: 90 },
  { key: 'all', label: 'All', days: null },
];

const dayKey = (iso) => new Date(iso).toLocaleDateString([], {
  month: 'short', day: 'numeric', year: 'numeric',
});
const timeLabel = (iso) => new Date(iso).toLocaleTimeString([], {
  hour: 'numeric', minute: '2-digit',
});

function HistoryEntry({ symptom }) {
  const [expanded, setExpanded] = useState(false);
  const band = bandFor(symptom.severity);
  const resolved = symptom.is_resolved;
  return (
    <button type="button" className="sh-entry" onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}>
      <span className={`sh-dot ${resolved ? 'resolved' : 'active'}`} aria-hidden="true" />
      <span className="sh-time">{timeLabel(symptom.timestamp)}</span>
      <span className="sh-main">
        <span className="sh-name">{titleCase(symptom.symptom_type)}</span>
        <span className="sh-loc">
          {symptom.location ? titleCase(symptom.location) : 'No location'}
        </span>
        {expanded && (symptom.description || symptom.notes) && (
          <span className="sh-details">
            {symptom.description && <span>{symptom.description}</span>}
            {symptom.notes && <span>Care action: {symptom.notes}</span>}
          </span>
        )}
      </span>
      <span className="sh-right">
        <span className="sh-severity">
          <span className={`sh-severity-value band-${band.key}`}>{symptom.severity ?? '—'}</span>
          <span className="sh-severity-denominator">/ 10</span>
        </span>
        <span className={`sh-status ${resolved ? 'resolved' : 'active'}`}>
          <span className="sl-band-dot" aria-hidden="true" />
          {resolved
            ? `Resolved${symptom.resolved_at ? ` ${dayKey(symptom.resolved_at)}` : ''}`
            : `Active / ${symptom.duration || 'Ongoing'}`}
        </span>
      </span>
      {expanded ? <ChevronDownIcon size={16} /> : <ChevronRightIcon size={16} />}
    </button>
  );
}

export default function SymptomHistoryList({ symptoms = [], symptomTypes = [], loading }) {
  const [search, setSearch] = useState('');
  const [range, setRange] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const activeFilterCount = (typeFilter ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0);

  const visible = useMemo(() => {
    const rangeDays = RANGES.find((r) => r.key === range)?.days;
    const cutoff = rangeDays ? Date.now() - rangeDays * 86400000 : null;
    const q = search.trim().toLowerCase();
    return symptoms.filter((s) => {
      if (cutoff && new Date(s.timestamp).getTime() < cutoff) return false;
      if (typeFilter && s.symptom_type !== typeFilter) return false;
      if (statusFilter === 'active' && s.is_resolved) return false;
      if (statusFilter === 'resolved' && !s.is_resolved) return false;
      if (q) {
        const hay = `${titleCase(s.symptom_type)} ${titleCase(s.location || '')} ${s.description || ''} ${s.notes || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [symptoms, range, search, typeFilter, statusFilter]);

  const groups = useMemo(() => {
    const byDay = new Map();
    for (const s of visible) {
      const key = dayKey(s.timestamp);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push(s);
    }
    return [...byDay.entries()];
  }, [visible]);

  const rangeLabel = useMemo(() => {
    if (visible.length === 0) return '';
    const times = visible.map((s) => new Date(s.timestamp).getTime());
    const lo = new Date(Math.min(...times));
    const hi = new Date(Math.max(...times));
    const fmt = (d) => d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    return lo.toDateString() === hi.toDateString() ? fmt(hi) : `${fmt(lo)} – ${fmt(hi)}`;
  }, [visible]);

  return (
    <div className="symptom-history">
      <div className="sh-toolbar">
        <div className="sh-search">
          <SearchIcon size={16} />
          <input type="text" placeholder="Search symptoms" value={search}
                 onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button type="button" className={`sh-filter-btn ${activeFilterCount ? 'has-filters' : ''}`}
                aria-expanded={filtersOpen} onClick={() => setFiltersOpen((v) => !v)}>
          <FilterIcon size={15} /> Filter
          <span className="sh-filter-count">{activeFilterCount}</span>
        </button>
      </div>

      {filtersOpen && (
        <div className="sh-filter-panel">
          <label>
            <span className="sl-label">Type</span>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">All types</option>
              {symptomTypes.map((t) => (
                <option key={t} value={t}>{titleCase(t)}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="sl-label">Status</span>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="resolved">Resolved</option>
            </select>
          </label>
        </div>
      )}

      <div className="sh-ranges" role="radiogroup" aria-label="Time range">
        {RANGES.map((r) => (
          <button key={r.key} type="button" role="radio" aria-checked={range === r.key}
                  className={`sh-range ${range === r.key ? 'selected' : ''}`}
                  onClick={() => setRange(r.key)}>
            {r.label}
          </button>
        ))}
      </div>

      <p className="sh-summary">
        {loading ? 'Loading…'
          : `${visible.length} record${visible.length === 1 ? '' : 's'}${rangeLabel ? ` · ${rangeLabel}` : ''}`}
      </p>

      {!loading && visible.length === 0 && (
        <p className="sh-muted">No symptoms match the current filters.</p>
      )}

      {groups.map(([day, entries]) => (
        <section key={day} className="sh-day">
          <h3 className="sh-day-label">{day}</h3>
          <div className="sh-day-entries">
            {entries.map((s) => <HistoryEntry key={s.id} symptom={s} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
