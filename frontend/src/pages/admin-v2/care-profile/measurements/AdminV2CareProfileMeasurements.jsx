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
// Care profile → Measurements. A summary and a list: what is set up, what
// still needs a range, and one editor per measurement instead of a wall of
// number inputs.
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import config, { apiFetch } from '../../../../config';
import {
  AlertIcon, ChevronRightIcon, DropletIcon, HeartIcon, LeafIcon, LockIcon, LungsIcon,
  ScaleIcon, ThermometerIcon, TrashIcon, VitalsIcon, WindIcon,
} from '../../../../components/Icons';
import { EmField, EmRow } from '../../../../components/vc/EntityModal';
import { CfgBadge } from '../../settings/CfgSection';
import CareProfileSection from '../CareProfileSection';
import useCareProfile from '../useCareProfile';
import {
  buildMeasurementRows, buildRoomRows, completionSummary, measurementCounts,
} from './measurementRows';
import MeasurementEditorDialog from './MeasurementEditorDialog';
import RoomConditionEditorDialog from './RoomConditionEditorDialog';
import CompletionRulesDialog from './CompletionRulesDialog';
import '../care-profile.css';

const VITAL_ICONS = {
  blood_pressure: VitalsIcon,
  heart_rate: HeartIcon,
  respiratory_rate: LungsIcon,
  spo2: DropletIcon,
  temperature: ThermometerIcon,
  weight: ScaleIcon,
};

const ROOM_ICONS = {
  temperature: ThermometerIcon,
  relative_humidity: DropletIcon,
  co2: WindIcon,
  pm25: LeafIcon,
};

const TABS = [
  { id: 'vitals', label: 'Vitals' },
  { id: 'room', label: 'Room conditions' },
  { id: 'custom', label: 'Custom' },
];

const Stat = ({ value, label, tone }) => (
  <div className="cp-stat" data-tone={tone}>
    <span className="cp-stat-value">{value}</span>
    <span className="cp-stat-label">{label}</span>
  </div>
);

// One tappable measurement. Same row chrome as the profile hub's sections.
const MeasurementRow = ({ icon, title, summary, status, badge, onClick }) => (
  <button type="button" className="cp-row cp-row-button cp-row-compact" onClick={onClick}>
    <span className="cp-tile" data-tone={status.tone} aria-hidden>{icon}</span>
    <span className="cp-row-body">
      <span className="cp-row-title cp-row-title-plain">{title}</span>
      <span className="cp-row-status">
        <span className="cp-status" data-tone={status.tone}>{status.label}</span>
        {badge && <CfgBadge>{badge}</CfgBadge>}
      </span>
      <span className="cp-row-blurb">{summary}</span>
    </span>
    <span className="cp-chevron" aria-hidden><ChevronRightIcon size={18} /></span>
  </button>
);

export default function AdminV2CareProfileMeasurements() {
  const { patientId } = useParams();
  const { patient, measurements, loading, error, setError, reload } =
    useCareProfile(patientId, { measurements: true });

  const [tab, setTab] = useState('vitals');
  const [editing, setEditing] = useState(null);      // measurement row
  const [editingRoom, setEditingRoom] = useState(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [newVital, setNewVital] = useState({ name: '', unit: '' });
  const [addingVital, setAddingVital] = useState(false);

  const rows = useMemo(
    () => buildMeasurementRows(measurements?.ranges), [measurements]);
  const roomRows = useMemo(
    () => buildRoomRows(measurements?.envRanges), [measurements]);

  const vitalRows = rows.filter((r) => r.builtin);
  const customRows = rows.filter((r) => !r.builtin);
  const counts = measurementCounts(rows);
  const completion = completionSummary(rows);
  const base = `/care/configuration/patients/${patientId}`;

  const flash = (msg) => { setNotice(msg); setTimeout(() => setNotice(''), 3000); };

  const afterSave = async (msg) => { await reload(); flash(msg); };

  // The needs-review callout jumps straight to the measurement it names.
  const reviewFirst = () => {
    const target = counts.unconfigured[0];
    if (!target) return;
    setTab(target.builtin ? 'vitals' : 'custom');
    setEditing(target);
  };

  const addCustomVital = async (e) => {
    e.preventDefault();
    setAddingVital(true);
    setError('');
    try {
      const res = await apiFetch(`${config.apiUrl}/api/vitals/custom-definitions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: Number(patientId),
          name: newVital.name.trim(),
          unit: newVital.unit.trim(),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail || 'Could not add this measurement.');
      setNewVital({ name: '', unit: '' });
      await afterSave('Measurement added.');
    } catch (err) {
      setError(err.message);
    } finally {
      setAddingVital(false);
    }
  };

  const removeCustomVital = async (row) => {
    const definition = (measurements?.customDefinitions || [])
      .find((d) => d.name === row.key);
    if (!definition) return;
    setError('');
    try {
      const res = await apiFetch(
        `${config.apiUrl}/api/vitals/custom-definitions/${definition.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Could not remove this measurement.');
      await afterSave('Measurement removed.');
    } catch (err) {
      setError(err.message);
    }
  };

  const statusOf = (row) => (row.configured
    ? { label: 'Configured', tone: 'success' }
    : { label: 'Needs range', tone: 'warning' });

  return (
    <CareProfileSection
      patientId={patientId}
      patient={patient}
      title="Measurements"
      description="Ranges and completion rules for captured readings."
      loading={loading}
      error={error}
      notice={notice}
    >
      {/* Summary */}
      <section className="cfg-card">
          <div className="cp-stats">
            <Stat value={counts.standard} label="Standard" />
            <Stat value={counts.custom} label="Custom" />
            <Stat value={counts.configured} label="Configured" />
            <Stat value={counts.needsReview} label="Needs review"
                  tone={counts.needsReview > 0 ? 'warning' : undefined} />
          </div>
          {counts.needsReview > 0 && (
            <button type="button" className="cp-callout" onClick={reviewFirst}>
              <span className="cp-callout-icon" aria-hidden><AlertIcon size={18} /></span>
              <span className="cp-callout-text">
                {counts.unconfigured.length === 1
                  ? `${counts.unconfigured[0].label} has no expected range`
                  : `${counts.unconfigured.length} measurements have no expected range`}
              </span>
              <span className="cp-action">Review</span>
              <span className="cp-chevron" aria-hidden><ChevronRightIcon size={16} /></span>
            </button>
          )}
      </section>

      {/* Tabs */}
      <div className="cp-tabs" role="tablist" aria-label="Measurement groups">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`cp-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`cp-panel-${t.id}`}
            className="cp-tab"
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'vitals' && (
        <div id="cp-panel-vitals" role="tabpanel" aria-labelledby="cp-tab-vitals"
             className="cp-panel">
          <div className="cfg-listgroup-head">
            <h2 className="cp-eyebrow">Standard vitals</h2>
            <p className="cfg-fine">Tap a measurement to edit.</p>
          </div>
          <section className="cfg-card cp-rows">
              {vitalRows.map((row) => {
                const Icon = VITAL_ICONS[row.key] || VitalsIcon;
                return (
                  <MeasurementRow
                    key={row.key}
                    icon={<Icon size={18} />}
                    title={row.label}
                    summary={row.summary}
                    status={statusOf(row)}
                    badge={row.required ? 'Required' : 'Optional'}
                    onClick={() => setEditing(row)}
                  />
                );
              })}
          </section>

          {/* Completion rules */}
          <section className="cfg-card cp-card-pad">
            <div className="cp-spread">
              <div className="cp-spread-text">
                <h3 className="cp-eyebrow">Completion rules</h3>
                <p className="cp-meta-value">{completion.headline}</p>
                <p className="cfg-fine">{completion.detail}</p>
              </div>
              <button type="button" className="cfg-ghost" onClick={() => setRulesOpen(true)}>
                Edit requirements
              </button>
            </div>
          </section>

          {/* Hard limits */}
          <section className="cfg-card">
            <Link className="cp-row cp-row-compact" to={`${base}/measurements/limits`}>
              <span className="cp-tile" aria-hidden><LockIcon size={18} /></span>
              <div className="cp-spread-text">
                <h3 className="cp-row-title">Advanced · hard limits</h3>
                <p className="cp-row-blurb">
                  The values a reading can never plausibly take.
                </p>
              </div>
              <span className="cp-chevron" aria-hidden><ChevronRightIcon size={18} /></span>
            </Link>
          </section>
        </div>
      )}

      {tab === 'room' && (
        <div id="cp-panel-room" role="tabpanel" aria-labelledby="cp-tab-room"
             className="cp-panel">
          <div>
            <h2 className="cp-eyebrow">Room conditions</h2>
            <p className="cfg-fine">
              When to flag the room on this profile&rsquo;s timeline. Caution is worth
              noticing; critical is worth acting on.
            </p>
          </div>
          <section className="cfg-card cp-rows">
              {roomRows.map((metric) => {
                const Icon = ROOM_ICONS[metric.key] || LeafIcon;
                return (
                  <MeasurementRow
                    key={metric.key}
                    icon={<Icon size={18} />}
                    title={metric.label}
                    summary={metric.summary}
                    status={metric.configured
                      ? { label: metric.row.source === 'patient' ? 'Configured' : 'Default', tone: metric.row.source === 'patient' ? 'success' : 'muted' }
                      : { label: 'Not bounded', tone: 'warning' }}
                    onClick={() => setEditingRoom(metric)}
                  />
                );
              })}
          </section>
        </div>
      )}

      {tab === 'custom' && (
        <div id="cp-panel-custom" role="tabpanel" aria-labelledby="cp-tab-custom"
             className="cp-panel">
          <div>
            <h2 className="cp-eyebrow">Custom measurements</h2>
            <p className="cfg-fine">
              Extra readings to capture for this profile — peak flow, blood glucose,
              anything the care team tracks. They appear on the capture screen beside
              the standard vitals.
            </p>
          </div>

          {customRows.length > 0 && (
            <section className="cfg-card cp-rows">
                {customRows.map((row) => (
                  <div key={row.key} className="cp-row cp-row-static cp-row-compact">
                    <span className="cp-tile" data-tone={statusOf(row).tone} aria-hidden>
                      <VitalsIcon size={18} />
                    </span>
                    <button type="button" className="cp-row-main cp-row-body"
                            onClick={() => setEditing(row)}>
                      <span className="cp-row-title cp-row-title-plain">{row.label}</span>
                      <span className="cp-row-status">
                        <span className="cp-status" data-tone={statusOf(row).tone}>
                          {statusOf(row).label}
                        </span>
                        <CfgBadge>{row.required ? 'Required' : 'Optional'}</CfgBadge>
                      </span>
                      <span className="cp-row-blurb">{row.summary}</span>
                    </button>
                    <button
                      type="button"
                      className="cfg-iconbtn danger"
                      aria-label={`Remove ${row.label}`}
                      onClick={() => removeCustomVital(row)}
                    >
                      <TrashIcon size={16} />
                    </button>
                  </div>
                ))}
            </section>
          )}

          <section className="cfg-card cp-card-pad">
            <form onSubmit={addCustomVital} className="cfg-form">
              <EmRow>
                <EmField label="Name" htmlFor="cp-custom-name" required>
                  <input
                    id="cp-custom-name"
                    className="em-input"
                    value={newVital.name}
                    onChange={(e) => setNewVital((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Peak flow"
                  />
                </EmField>
                <EmField label="Unit" htmlFor="cp-custom-unit">
                  <input
                    id="cp-custom-unit"
                    className="em-input"
                    value={newVital.unit}
                    onChange={(e) => setNewVital((p) => ({ ...p, unit: e.target.value }))}
                    placeholder="L/min"
                  />
                </EmField>
              </EmRow>
              <div className="cp-actions">
                <button
                  type="submit"
                  className="em-submit"
                  disabled={addingVital || !newVital.name.trim()}
                >
                  {addingVital ? 'Adding…' : 'Add measurement'}
                </button>
              </div>
            </form>
          </section>

          {customRows.length === 0 && (
            <p className="cfg-note">
              No custom measurements yet. Standard vitals are always available.
            </p>
          )}
        </div>
      )}

      <div className="cp-actions end">
        <Link className="em-cancel" to={base}>Back to profile</Link>
        <Link className="em-submit" to={base}>Done</Link>
      </div>

      <MeasurementEditorDialog
        patientId={patientId}
        row={editing}
        open={Boolean(editing)}
        onOpenChange={(o) => { if (!o) setEditing(null); }}
        onSaved={() => afterSave('Measurement saved.')}
      />
      <RoomConditionEditorDialog
        patientId={patientId}
        metric={editingRoom}
        open={Boolean(editingRoom)}
        onOpenChange={(o) => { if (!o) setEditingRoom(null); }}
        onSaved={() => afterSave('Room bounds saved.')}
      />
      <CompletionRulesDialog
        patientId={patientId}
        rows={rows}
        open={rulesOpen}
        onOpenChange={setRulesOpen}
        onSaved={() => afterSave('Completion rules saved.')}
      />
    </CareProfileSection>
  );
}
