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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import useCareProfile from './useCareProfile';
import {
  STATUS_META, careContextSummary, featuresSummary, homeAssistantSummary,
  measurementsSummary, setupTotals,
} from './careProfileSections';
import { ageFrom, formatDate, formatDateTime, fullName, initialsOf } from './careProfileFormat';
import { MQTT_SECTIONS } from '../mqttConstants';
import '../AdminV2.css';
import './care-profile.css';

const SetupCount = ({ icon, value, label, tone }) => (
  <div className="cp-count" data-tone={value > 0 ? tone : undefined}>
    <span className="cp-count-icon" aria-hidden>{icon}</span>
    <div className="min-w-0">
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
          <Badge variant={meta.tone}>{meta.label}</Badge>
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
        <div className="admin-v2-page"><div className="admin-v2-loading">Loading care profile…</div></div>
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
        <div className="tw flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              to="/care/configuration/patients"
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronLeftIcon size={16} /> Care profiles
            </Link>
            <Badge variant={patient?.is_active ? 'success' : 'secondary'}>
              {patient?.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </div>

          {error && <Alert variant="destructive" role="alert">{error}</Alert>}
          {notice && <Alert variant="success" role="status">{notice}</Alert>}

          {/* Who this profile is */}
          <Card>
            <CardContent className="flex flex-col gap-4 p-4 sm:p-4">
              <div className="cp-identity">
                <span className="cp-avatar" aria-hidden>{initialsOf(patient)}</span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <h1 className="cp-name">{fullName(patient)}</h1>
                  <p className="cp-subtitle">
                    Home care profile · Record ID {patient?.id ?? patientId}
                    {patient?.medical_record_number ? ` · MRN ${patient.medical_record_number}` : ''}
                  </p>
                </div>
                <Button variant="secondary" size="sm" asChild>
                  <Link to={`${base}/edit`}>Edit profile</Link>
                </Button>
              </div>

              <div className="cp-meta border-t border-border pt-3">
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
            </CardContent>
          </Card>

          {/* Setup */}
          <Card>
            <CardHeader className="p-4 sm:p-4">
              <CardTitle className="cp-eyebrow">Profile setup</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 p-4 sm:p-4">
              <div className="cp-counts">
                <SetupCount icon={<CheckCircleIcon size={18} />} value={totals.ready}
                            label={totals.ready === 1 ? 'Section ready' : 'Sections ready'}
                            tone="success" />
                <SetupCount icon={<AlertIcon size={18} />} value={totals.review}
                            label="Needs review" tone="warning" />
                <SetupCount icon={<XIcon size={18} />} value={totals.errors}
                            label={totals.errors === 1 ? 'Error' : 'Errors'} tone="danger" />
              </div>

              <div className="cp-rows rounded-lg border border-border">
                {sections.map((section) => <SectionRow key={section.id} section={section} />)}
              </div>
            </CardContent>
          </Card>

          {/* Advanced */}
          <Card>
            <details className="cp-advanced">
              <summary>
                <span className="cp-eyebrow">Advanced</span>
                <span className="cp-advanced-marker" aria-hidden><ChevronDownIcon size={16} /></span>
              </summary>
              <div className="flex flex-col gap-3 border-t border-border p-4 pt-3">
                <p className="text-sm text-muted-foreground">
                  Deactivating hides this profile from day-to-day screens. Nothing recorded
                  against it is deleted, and it can be turned back on here at any time.
                </p>
                <Button
                  className="w-fit"
                  variant={patient?.is_active ? 'destructive' : 'secondary'}
                  onClick={toggleActive}
                  disabled={busy}
                >
                  {patient?.is_active ? 'Deactivate profile' : 'Activate profile'}
                </Button>
              </div>
            </details>
          </Card>
        </div>
      </div>
    </AdminV2Layout>
  );
}
