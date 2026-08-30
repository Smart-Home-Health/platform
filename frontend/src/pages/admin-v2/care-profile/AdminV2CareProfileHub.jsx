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
// Configuration → Care Profiles → one profile. A hub, not a form: who this
// profile is, how far its setup has got, and a way into each section. Every
// number on this page is derived from what the API actually returned.
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertIcon, CheckCircleIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon,
  DashboardIcon, FileTextIcon, HomeIcon, VitalsIcon, XIcon,
} from '../../../components/Icons';
import config, { apiFetch } from '../../../config';
import AdminV2Layout from '../AdminV2Layout';
import { CfgSection, CfgGroup, CfgBadge } from '../settings/CfgSection';
import useCareProfile from './useCareProfile';
import {
  STATUS_META, careContextSummary, featuresSummary, homeAssistantSummary,
  measurementsSummary, setupTotals,
} from './careProfileSections';
import { ageFrom, formatDate, formatDateTime, fullName } from './careProfileFormat';
import AvatarEditor from '../components/AvatarEditor';
import { useAdminPatient } from '../../../contexts/AdminPatientContext';
import { MQTT_SECTIONS } from '../mqttConstants';
import '../../../components/vc/entity-card.css';
import '../AdminV2.css';
import './care-profile.css';

const SetupCount = ({ icon, value, label, tone }) => (
  <div className="cp-count" data-tone={value > 0 ? tone : undefined}>
    <span className="cp-count-icon" aria-hidden>{icon}</span>
    <div className="cp-count-text">
      <span className="cp-count-value">{value}</span>
      <span className="cp-count-label">{label}</span>
    </div>
  </div>
);

const SectionRow = ({ section }) => {
  const meta = STATUS_META[section.status] || STATUS_META.optional;
  return (
    <Link className="cp-row cp-row-compact cp-row-stacked" to={section.to}>
      <span className="cp-tile" data-tone={meta.tone} aria-hidden>{section.icon}</span>
      <span className="cp-row-body cp-row-body-stacked">
        <span className="cp-row-title">{section.title}</span>
        <span className="cp-row-status">
          <span className="cp-status" data-tone={meta.tone}>{meta.label}</span>
        </span>
        <span className="cp-row-summary">
          <span className="cp-row-blurb">{section.blurb}</span>
          <span className="cp-facts">
            {section.facts.map((fact) => <span className="cp-fact" key={fact}>{fact}</span>)}
          </span>
          <span className="cp-action">{section.action}</span>
        </span>
      </span>
      <span className="cp-chevron" aria-hidden><ChevronRightIcon size={18} /></span>
    </Link>
  );
};

export default function AdminV2CareProfileHub() {
  const { patientId } = useParams();
  const { patient, mqtt, measurements, loading, error, setError, reload } =
    useCareProfile(patientId, { mqtt: true, measurements: true });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const { refreshPatients } = useAdminPatient();

  const flash = (msg) => { setNotice(msg); setTimeout(() => setNotice(''), 3000); };

  const toggleActive = async () => {
    setBusy(true);
    setError('');
    try {
      const res = patient?.is_active
        ? await apiFetch(`${config.apiUrl}/api/patients/${patientId}`, { method: 'DELETE' })
        : await apiFetch(`${config.apiUrl}/api/patients/${patientId}/activate`, { method: 'POST' });
      if (!res.ok) throw new Error('Could not change this profile’s status.');
      const wasActive = patient?.is_active;
      await reload();
      flash(wasActive ? 'Care profile deactivated.' : 'Care profile activated.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-page"><p className="cfg-loading">Loading care profile…</p></div>
      </AdminV2Layout>
    );
  }

  const base = `/care/configuration/patients/${patientId}`;
  const firstName = patient?.first_name || 'this profile';
  const age = ageFrom(patient?.date_of_birth);

  const sections = [
    {
      id: 'features',
      to: `${base}/features`,
      icon: <DashboardIcon size={18} />,
      title: 'Features',
      blurb: `Choose which parts of Smart Home Health are used for ${firstName}.`,
      action: 'View features',
      ...featuresSummary(),
    },
    {
      id: 'measurements',
      to: `${base}/measurements`,
      icon: <VitalsIcon size={18} />,
      title: 'Measurements',
      blurb: 'Vitals, expected ranges, and completion rules.',
      action: 'Manage measurements',
      ...measurementsSummary(measurements || {}),
    },
    {
      id: 'home-assistant',
      to: `${base}/home-assistant`,
      icon: <HomeIcon size={18} />,
      title: 'Home Assistant',
      blurb: 'Data sharing and device control permissions.',
      action: 'Manage integration',
      ...homeAssistantSummary({ ...(mqtt || {}), totalSections: MQTT_SECTIONS.length }),
    },
    {
      id: 'context',
      to: `${base}/context`,
      icon: <FileTextIcon size={18} />,
      title: 'Care context',
      blurb: 'Notes and home-care preferences used across the app.',
      action: patient?.notes ? 'Edit context' : 'Add context',
      ...careContextSummary(patient),
    },
  ];
  const totals = setupTotals(sections);

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        <div className="cfg">
          <div className="cfg-crumb">
            <Link to="/care/configuration/patients" className="cfg-back">
              <ChevronLeftIcon size={14} /> Care profiles
            </Link>
            <CfgBadge tone={patient?.is_active ? 'ok' : undefined}>
              {patient?.is_active ? 'Active' : 'Inactive'}
            </CfgBadge>
          </div>

          {error && <p className="em-error" role="alert">{error}</p>}
          {notice && <p className="em-success" role="status">{notice}</p>}

          {/* Who this profile is */}
          <section className="cfg-card cp-card-pad">
            <div className="cp-identity">
              <AvatarEditor kind="patient" person={patient} name={fullName(patient)}
                            onError={setError} onNotice={flash} onChange={refreshPatients} />
              <div className="cp-identity-name">
                <h1 className="cp-name">{fullName(patient)}</h1>
                <p className="cp-subtitle">
                  Home care profile · Record ID {patient?.id ?? patientId}
                  {patient?.medical_record_number ? ` · MRN ${patient.medical_record_number}` : ''}
                </p>
              </div>
              <Link className="cfg-ghost" to={`${base}/edit`}>Edit profile</Link>
            </div>

            <div className="cp-meta cp-divide">
              <div>
                <span className="cp-meta-label">Date of birth</span>
                <span className="cp-meta-value">
                  {formatDate(patient?.date_of_birth)}
                  {age !== null ? ` (${age})` : ''}
                </span>
              </div>
              <div>
                <span className="cp-meta-label">Care area</span>
                <span className="cp-meta-value">{patient?.care_area || 'Not linked'}</span>
              </div>
              <div>
                <span className="cp-meta-label">Last updated</span>
                <span className="cp-meta-value">{formatDateTime(patient?.updated_at)}</span>
              </div>
              <div>
                <span className="cp-meta-label">Added</span>
                <span className="cp-meta-value">{formatDateTime(patient?.created_at)}</span>
              </div>
            </div>
          </section>

          {/* Setup */}
          <CfgSection title="Profile setup">
            <CfgGroup>
              <div className="cp-counts">
                <SetupCount icon={<CheckCircleIcon size={18} />} value={totals.ready}
                            label={totals.ready === 1 ? 'Section ready' : 'Sections ready'}
                            tone="success" />
                <SetupCount icon={<AlertIcon size={18} />} value={totals.review}
                            label="Needs review" tone="warning" />
                <SetupCount icon={<XIcon size={18} />} value={totals.errors}
                            label={totals.errors === 1 ? 'Error' : 'Errors'} tone="danger" />
              </div>

              <div className="cp-rows boxed">
                {sections.map((section) => <SectionRow key={section.id} section={section} />)}
              </div>
            </CfgGroup>
          </CfgSection>

          {/* Advanced */}
          <section className="cfg-card">
            <details className="cp-advanced">
              <summary>
                <span className="cp-eyebrow">Advanced</span>
                <span className="cp-advanced-marker" aria-hidden><ChevronDownIcon size={16} /></span>
              </summary>
              <div className="cp-advanced-body">
                <p className="cfg-fine">
                  Deactivating hides this profile from day-to-day screens. Nothing recorded
                  against it is deleted, and it can be turned back on here at any time.
                </p>
                <button
                  type="button"
                  className={patient?.is_active ? 'em-danger' : 'em-cancel'}
                  onClick={toggleActive}
                  disabled={busy}
                >
                  {patient?.is_active ? 'Deactivate profile' : 'Activate profile'}
                </button>
              </div>
            </details>
          </section>
        </div>
      </div>
    </AdminV2Layout>
  );
}
