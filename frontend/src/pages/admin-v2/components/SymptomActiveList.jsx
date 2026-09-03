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
// Active symptoms as bedside-monitor cards (from the supplied mockup):
// summary strip, per-symptom card with severity hero + band, ongoing
// elapsed time, started stamp, and resolve/edit/delete actions.
import { useEffect, useRef, useState } from 'react';
import {
  BodyIcon, CheckCircleIcon, ChevronDownIcon, ChevronRightIcon, EditIcon,
  MoreHorizontalIcon,
} from '../../../components/Icons';
import { titleCase, bandFor, elapsedLabel } from './symptomUtils';
import '../symptom-log.css';

const stamp = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
};

function ActiveCard({ symptom, onResolve, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const band = bandFor(symptom.severity);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menuOpen]);

  return (
    <article className="sa-card">
      <button type="button" className="sa-card-head" onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}>
        <span className="sa-figure"><BodyIcon size={26} /></span>
        <span className="sa-head-text">
          <span className="sa-name">{titleCase(symptom.symptom_type)}</span>
          <span className="sa-loc">{symptom.location ? titleCase(symptom.location) : 'Location not specified'}</span>
        </span>
        {expanded ? <ChevronDownIcon size={18} /> : <ChevronRightIcon size={18} />}
      </button>

      <div className="sa-grid">
        <div className="sa-cell">
          <span className="sl-label">Severity (0–10)</span>
          <span className="sa-severity">
            <span className={`sa-severity-value band-${band.key}`}>{symptom.severity ?? '—'}</span>
            <span className="sa-severity-denominator">/ 10</span>
          </span>
          <span className={`sl-severity-band band-${band.key}`}>
            <span className="sl-band-dot" aria-hidden="true" /> {band.label}
          </span>
        </div>
        <div className="sa-cell">
          <span className="sl-label">Status</span>
          <span className="sa-status">Ongoing</span>
          <span className="sa-elapsed">{elapsedLabel(symptom.timestamp)}</span>
        </div>
        <div className="sa-cell">
          <span className="sl-label">Started</span>
          <span className="sa-stamp">{stamp(symptom.timestamp)}</span>
        </div>
        <div className="sa-cell">
          <span className="sl-label">Duration noted</span>
          <span className="sa-stamp">{symptom.duration || '—'}</span>
        </div>
      </div>

      {expanded && (symptom.description || symptom.notes) && (
        <div className="sa-details">
          {symptom.description && <p><span className="sl-label">Observation</span>{symptom.description}</p>}
          {symptom.notes && <p><span className="sl-label">Care action</span>{symptom.notes}</p>}
        </div>
      )}

      <div className="sa-actions">
        <button type="button" className="sa-resolve" onClick={() => onResolve(symptom.id)}>
          <CheckCircleIcon size={16} /> Resolve
        </button>
        <button type="button" className="sa-icon-btn" aria-label="Edit symptom"
                onClick={() => onEdit(symptom)}>
          <EditIcon size={16} />
        </button>
        <div className="sa-menu-wrap" ref={menuRef}>
          <button type="button" className="sa-icon-btn" aria-label="More actions"
                  aria-haspopup="menu" aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((v) => !v)}>
            <MoreHorizontalIcon size={16} />
          </button>
          {menuOpen && (
            <div className="sa-menu" role="menu">
              <button type="button" role="menuitem" className="sa-menu-item danger"
                      onClick={() => { setMenuOpen(false); onDelete(symptom); }}>
                Delete entry
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export default function SymptomActiveList({ symptoms = [], loading,
                                            onResolve, onEdit, onDelete }) {
  if (loading) return <p className="sh-muted">Loading…</p>;
  if (symptoms.length === 0) {
    return <p className="sh-muted">No active symptoms — nothing needs attention.</p>;
  }
  const longest = symptoms.reduce((best, s) => {
    const ms = Date.now() - new Date(s.timestamp).getTime();
    return ms > best ? ms : best;
  }, 0);
  const longestDays = Math.floor(longest / 86400000);

  return (
    <div className="symptom-active">
      <div className="sa-summary">
        <span><span className="sa-summary-num">{symptoms.length}</span> Active</span>
        <span className="sa-summary-sep" aria-hidden="true" />
        <span>Longest <span className="sa-summary-num">{longestDays} day{longestDays === 1 ? '' : 's'}</span></span>
      </div>
      {symptoms.map((s) => (
        <ActiveCard key={s.id} symptom={s} onResolve={onResolve}
                    onEdit={onEdit} onDelete={onDelete} />
      ))}
    </div>
  );
}
