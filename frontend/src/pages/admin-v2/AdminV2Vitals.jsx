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
import { Fragment, useState, useEffect, useMemo } from 'react';
import AdminV2Layout from './AdminV2Layout';
import PatientGate from './components/PatientGate';
import config from '../../config';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import {
  XIcon, SearchIcon, CalendarIcon, HeartIcon, BloodIcon, DropletIcon,
  ThermometerIcon, LungsIcon, ScaleIcon, VitalsIcon,
} from '../../components/Icons';
import '../../components/vc/entity-card.css';
import './AdminV2.css';
import './vitals-history.css';

const builtInVitalTypes = [
  { value: 'blood_pressure', label: 'Blood Pressure', unit: 'mmHg' },
  { value: 'heart_rate', label: 'Heart Rate', unit: 'bpm' },
  { value: 'spo2', label: 'SpO2', unit: '%' },
  { value: 'temperature', label: 'Temperature', unit: '°F' },
  { value: 'respiratory_rate', label: 'Respiratory Rate', unit: '/min' },
  { value: 'weight', label: 'Weight', unit: 'lbs' },
];

// Icon + colour family per vital. Custom definitions fall through to the
// neutral trace icon; the colour lives on the icon only (never a side bar).
const TYPE_ICONS = {
  blood_pressure: { Icon: BloodIcon, family: 'cardio' },
  heart_rate: { Icon: HeartIcon, family: 'cardio' },
  spo2: { Icon: DropletIcon, family: 'oxygen' },
  temperature: { Icon: ThermometerIcon, family: 'thermal' },
  respiratory_rate: { Icon: LungsIcon, family: 'cardio' },
  weight: { Icon: ScaleIcon, family: '' },
};

// Sources arrive as identifiers ('pulse_ox', 'manual'); the badge reads them
// as words.
const sourceLabel = (source) => source.replace(/_/g, ' ');

const dayKeyOf = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

// "TODAY" / "YESTERDAY" / "SUN · AUG 30" — the year only appears when the
// reading is not from the current one.
const dayLabelOf = (d) => {
  const now = new Date();
  if (dayKeyOf(d) === dayKeyOf(now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKeyOf(d) === dayKeyOf(yesterday)) return 'Yesterday';
  const weekday = d.toLocaleDateString(undefined, { weekday: 'short' });
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const year = d.getFullYear() === now.getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${weekday} · ${date}${year}`;
};

// Recording moved to the capture surface (/care/vitals -> VitalsCapturePage);
// this page is the vitals HISTORY view only.
const AdminV2Vitals = () => {
  const { selectedPatient: contextPatient } = useAdminPatient();

  const selectedPatient = contextPatient;

  const [vitalsHistory, setVitalsHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [filterType, setFilterType] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  // The range inputs stay folded away until asked for — on a phone they cost
  // more height than they earn, and the type chips carry most filtering.
  const [rangeOpen, setRangeOpen] = useState(false);

  // Custom-vital definitions are still needed here for the history filter
  // chips and the type-label/unit lookup. The capture form fetches its own
  // copy, but loading them here keeps the filter populated even when the
  // record surface has never been opened.
  const [customDefinitions, setCustomDefinitions] = useState([]);

  const allVitalTypes = useMemo(() => [
    ...builtInVitalTypes,
    ...customDefinitions.map(d => ({
      value: d.name,
      label: d.display_label,
      unit: d.unit || '',
      isCustom: true,
      definitionId: d.id,
    }))
  ], [customDefinitions]);

  // Fetch custom vital definitions when patient changes
  useEffect(() => {
    if (selectedPatient) {
      loadCustomDefinitions();
    } else {
      setCustomDefinitions([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch helper is recreated each render; effect is keyed on patient change only
  }, [selectedPatient]);

  useEffect(() => {
    if (selectedPatient) {
      loadVitalsHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch helper is recreated each render; effect is keyed on patient/filter changes only
  }, [selectedPatient, filterType, filterDateFrom, filterDateTo, searchTerm]);

  const loadCustomDefinitions = async () => {
    if (!selectedPatient) return;
    try {
      const response = await fetch(
        `${config.apiUrl}/api/vitals/custom-definitions?patient_id=${selectedPatient.id}`,
        { credentials: 'include' }
      );
      if (response.ok) {
        const defs = await response.json();
        setCustomDefinitions(defs);
      }
    } catch (err) {
      console.error('Error loading custom vital definitions:', err);
    }
  };

  const loadVitalsHistory = async () => {
    if (!selectedPatient) return;
    setLoadingHistory(true);
    try {
      let url = `${config.apiUrl}/api/vitals/patient/${selectedPatient.id}?limit=100`;
      if (filterType) url += `&vital_type=${filterType}`;
      if (filterDateFrom) url += `&start_date=${filterDateFrom}`;
      if (filterDateTo) url += `&end_date=${filterDateTo}`;

      const response = await fetch(url, { credentials: 'include' });
      if (response.ok) {
        let data = await response.json();
        if (searchTerm) {
          const term = searchTerm.toLowerCase();
          data = data.filter(v =>
            getVitalTypeLabel(v.vital_type).toLowerCase().includes(term) ||
            (v.notes && v.notes.toLowerCase().includes(term))
          );
        }
        setVitalsHistory(data);
      }
    } catch (err) {
      console.error('Error loading vitals history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const getVitalTypeLabel = (type) => {
    const vitalType = allVitalTypes.find(v => v.value === type);
    return vitalType ? vitalType.label : type?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Unknown';
  };

  const getVitalTypeUnit = (type) => {
    const vitalType = allVitalTypes.find(v => v.value === type);
    return vitalType?.unit || '';
  };

  const formatVitalValue = (vital) => {
    if (vital.vital_type === 'blood_pressure') {
      if (vital.systolic && vital.diastolic) return `${vital.systolic}/${vital.diastolic}`;
      if (typeof vital.value === 'object' && vital.value) {
        return `${vital.value.systolic || '-'}/${vital.value.diastolic || '-'}`;
      }
    }
    return vital.value ?? '-';
  };

  const clearFilters = () => {
    setFilterType('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setSearchTerm('');
  };

  const hasActiveFilters = !!(filterType || filterDateFrom || filterDateTo || searchTerm);

  // Readings arrive newest-first; group them into day sections in that order.
  const dayGroups = useMemo(() => {
    const groups = [];
    const byKey = new Map();
    vitalsHistory.forEach((vital, idx) => {
      const when = vital.timestamp ? new Date(vital.timestamp) : null;
      const key = when && !Number.isNaN(when.getTime()) ? dayKeyOf(when) : 'unknown';
      let group = byKey.get(key);
      if (!group) {
        group = { key, label: key === 'unknown' ? 'Undated' : dayLabelOf(when), items: [] };
        byKey.set(key, group);
        groups.push(group);
      }
      group.items.push({ vital, when, rowKey: vital.id ?? `idx-${idx}` });
    });
    return groups;
  }, [vitalsHistory]);

  const summary = useMemo(() => {
    const types = new Set(vitalsHistory.map(v => v.vital_type).filter(Boolean));
    const latest = dayGroups[0]?.items[0] ?? null;
    return { count: vitalsHistory.length, typeCount: types.size, latest };
  }, [vitalsHistory, dayGroups]);

  const renderReading = ({ vital, when, rowKey }) => {
    const { Icon, family } = TYPE_ICONS[vital.vital_type] || { Icon: VitalsIcon, family: '' };
    const unit = getVitalTypeUnit(vital.vital_type);
    const source = vital.source || 'manual';
    return (
      <li className="vhist-row" key={rowKey}>
        <span className={`vhist-row-icon ${family}`} aria-hidden="true"><Icon size={16} /></span>
        <div className="vhist-row-body">
          <div className="vhist-row-top">
            <span className="vhist-row-type">{getVitalTypeLabel(vital.vital_type)}</span>
            <span className="vhist-row-value">
              {formatVitalValue(vital)}
              {unit && <em>{unit}</em>}
            </span>
          </div>
          <div className="vhist-row-meta">
            <span className="vhist-row-time">
              {when && !Number.isNaN(when.getTime())
                ? when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
                : '—'}
            </span>
            <span className={`vhist-src ${source}`}>{sourceLabel(source)}</span>
          </div>
          {vital.notes && <p className="vhist-row-notes">{vital.notes}</p>}
        </div>
      </li>
    );
  };

  const renderHistoryView = () => (
    <div className="vhist">
      <div className="vhist-toolbar">
        <div className="vhist-search">
          <span className="vhist-search-icon" aria-hidden="true"><SearchIcon size={16} /></span>
          <input
            type="search"
            className="em-input"
            aria-label="Search vitals"
            placeholder="Search vitals..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button
              type="button"
              className="vhist-search-clear"
              aria-label="Clear search"
              onClick={() => setSearchTerm('')}
            >
              <XIcon size={14} />
            </button>
          )}
        </div>
        <button
          type="button"
          className={`vhist-icon-btn ${rangeOpen || filterDateFrom || filterDateTo ? 'on' : ''}`}
          aria-label="Date range"
          aria-expanded={rangeOpen}
          onClick={() => setRangeOpen(o => !o)}
        >
          <CalendarIcon size={18} />
        </button>
      </div>

      <div className="vhist-chips" role="group" aria-label="Filter by vital type">
        <button
          type="button"
          className={`vhist-chip ${filterType ? '' : 'on'}`}
          aria-pressed={!filterType}
          onClick={() => setFilterType('')}
        >
          All
        </button>
        {allVitalTypes.map(vt => (
          <button
            key={vt.value}
            type="button"
            className={`vhist-chip ${filterType === vt.value ? 'on' : ''}`}
            aria-pressed={filterType === vt.value}
            onClick={() => setFilterType(filterType === vt.value ? '' : vt.value)}
          >
            {vt.label}
          </button>
        ))}
      </div>

      {rangeOpen && (
        <div className="vhist-card">
          <div className="vhist-card-head"><h3>Date Range</h3></div>
          <div className="vhist-range">
            <label className="vhist-date" htmlFor="vitals-hist-from">
              <span>From</span>
              <input
                id="vitals-hist-from"
                className="em-input"
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
              />
            </label>
            <label className="vhist-date" htmlFor="vitals-hist-to">
              <span>To</span>
              <input
                id="vitals-hist-to"
                className="em-input"
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
              />
            </label>
          </div>
        </div>
      )}

      <div className="vhist-card">
        <div className="vhist-glance">
          <div className="vhist-stat readings">
            <span className="vhist-stat-label">Readings</span>
            <span className="vhist-stat-value">{summary.count}</span>
            <span className="vhist-stat-sub">{hasActiveFilters ? 'filtered' : 'most recent'}</span>
          </div>
          <div className="vhist-stat types">
            <span className="vhist-stat-label">Types</span>
            <span className="vhist-stat-value">{summary.typeCount}</span>
            <span className="vhist-stat-sub">distinct</span>
          </div>
          <div className="vhist-stat latest">
            <span className="vhist-stat-label">Latest</span>
            <span className="vhist-stat-value">
              {summary.latest?.when && !Number.isNaN(summary.latest.when.getTime())
                ? summary.latest.when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
                : '—'}
            </span>
            <span className="vhist-stat-sub">
              {summary.latest?.when && !Number.isNaN(summary.latest.when.getTime())
                ? summary.latest.when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                : 'no readings'}
            </span>
          </div>
        </div>
        {hasActiveFilters && (
          <div className="vhist-card-foot">
            <span>Filters active</span>
            <button type="button" className="vhist-link" onClick={clearFilters}>Clear filters</button>
          </div>
        )}
      </div>

      <div className="vhist-card">
        <div className="vhist-card-head"><h3>Vitals Log</h3></div>
        {loadingHistory ? (
          <p className="vhist-loading">Loading history...</p>
        ) : dayGroups.length === 0 ? (
          <p className="vhist-empty">No vitals found</p>
        ) : (
          <ul className="vhist-list">
            {dayGroups.map(group => (
              <Fragment key={group.key}>
                <li className="vhist-day">
                  <span>{group.label}</span>
                  <span className="vhist-day-count">
                    {group.items.length} {group.items.length === 1 ? 'reading' : 'readings'}
                  </span>
                </li>
                {group.items.map(renderReading)}
              </Fragment>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        {!selectedPatient ? (
          <PatientGate message="Choose a patient to view their vitals history." />
        ) : (
          renderHistoryView()
        )}
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Vitals;
