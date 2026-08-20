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
// Care profile → Home Assistant. What this profile shares, in which direction,
// and what that produces in HA.
//
// The broker itself is not configured here: it belongs to the hub, not to one
// profile. This page shows the link read-only and sends anyone who needs to
// change it to Configuration → MQTT.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import config, { apiFetch } from '../../../../config';
import {
  BellAlertIcon, ChevronRightIcon, ClipboardListIcon, HomeIcon, LockIcon,
  RefreshIcon, VitalsIcon, WifiIcon,
} from '../../../../components/Icons';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import CareProfileSection from '../CareProfileSection';
import useCareProfile from '../useCareProfile';
import { STATUS_META, homeAssistantSummary } from '../careProfileSections';
import { fullName } from '../careProfileFormat';
import { MQTT_SECTIONS } from '../../mqttConstants';
import {
  MODE_OPTIONS, applyMode, groupRows, hasAnyShared, monitorOnlyDefaults, sharingMode,
} from './haSharing';
import PermissionGroupDialog from './PermissionGroupDialog';
import EntitiesDialog from './EntitiesDialog';
import '../care-profile.css';

const GROUP_ICONS = {
  live: VitalsIcon,
  activity: ClipboardListIcon,
  reminders: BellAlertIcon,
  alarms: BellAlertIcon,
  other: HomeIcon,
};

export default function AdminV2CareProfileHomeAssistant() {
  const { patientId } = useParams();
  const { patient, mqtt, loading, error, setError, reload } =
    useCareProfile(patientId, { mqtt: true });

  const [status, setStatus] = useState(null);
  const [entities, setEntities] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [editingGroup, setEditingGroup] = useState(null);
  const [entitiesOpen, setEntitiesOpen] = useState(false);
  const [modeHint, setModeHint] = useState('');

  // The broker link and the published entity list are reads this page owns —
  // the hub's summary does not need either.
  const loadExtras = useCallback(async () => {
    if (!patientId) return;
    const [statusRes, entityRes] = await Promise.all([
      apiFetch(`${config.apiUrl}/api/mqtt/status`),
      apiFetch(`${config.apiUrl}/api/mqtt/patients/${patientId}/entities`),
    ]);
    if (statusRes.ok) setStatus(await statusRes.json());
    if (entityRes.ok) setEntities(await entityRes.json());
  }, [patientId]);

  useEffect(() => { loadExtras(); }, [loadExtras]);

  const flash = (msg) => { setNotice(msg); setTimeout(() => setNotice(''), 3500); };

  const sections = useMemo(() => mqtt?.sections || {}, [mqtt]);
  const mode = sharingMode(sections);
  const groups = useMemo(() => groupRows(sections), [sections]);

  const save = async (enabled, nextSections, message) => {
    setBusy(true);
    setError('');
    try {
      const res = await apiFetch(`${config.apiUrl}/api/mqtt/patients/${patientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, sections: nextSections }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof body.detail === 'string' ? body.detail
          : 'Could not save these sharing settings.');
      }
      await reload();
      await loadExtras();
      flash(message);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const toggleSharing = (on) => {
    setModeHint('');
    if (!on) {
      save(false, sections, 'Sharing turned off. Entities removed from Home Assistant.');
      return;
    }
    // A profile that has never been configured starts read-only across the
    // board rather than shared-but-empty.
    const seeded = hasAnyShared(sections) ? sections : monitorOnlyDefaults();
    save(true, seeded, hasAnyShared(sections)
      ? 'Sharing turned on.'
      : 'Sharing on — everything read-only to start. Adjust any group below.');
  };

  const chooseMode = (id) => {
    if (id === 'custom') {
      setModeHint('Open any group below and set its sections individually.');
      return;
    }
    setModeHint('');
    save(true, applyMode(sections, id),
      id === 'monitor'
        ? 'Monitor only — Home Assistant can read, not write.'
        : 'Control allowed — Home Assistant can write back where a section supports it.');
  };

  const republish = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await apiFetch(`${config.apiUrl}/api/mqtt/send-discovery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_id: Number(patientId) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof body.detail === 'string' ? body.detail
          : 'Could not republish discovery.');
      }
      flash('Discovery republished.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const base = `/care/configuration/patients/${patientId}`;
  const sectionStatus = STATUS_META[homeAssistantSummary({
    ...(mqtt || {}), totalSections: MQTT_SECTIONS.length,
  }).status];
  const activeMode = MODE_OPTIONS.find((m) => m.id === mode);

  return (
    <CareProfileSection
      patientId={patientId}
      patient={patient}
      title="Home Assistant"
      description="Data sharing and device control."
      status={sectionStatus}
      loading={loading}
      error={error}
      notice={notice}
    >
      {/* Connection — read-only. The broker belongs to the hub. */}
      {status && (
        <Card>
          <CardContent className="flex flex-col gap-3 p-4 sm:p-4">
            <h2 className="cp-eyebrow">Connection</h2>
            <div className="flex flex-wrap items-center gap-3">
              <span className="cp-tile" data-tone={status.connected ? 'success' : 'warning'} aria-hidden>
                <WifiIcon size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <span className="cp-status" data-tone={status.connected ? 'success' : 'warning'}>
                  {status.connected ? 'Connected' : status.enabled ? 'Not connected' : 'MQTT off'}
                </span>
                <p className="text-sm text-foreground">
                  {status.broker
                    ? `${status.broker}${status.port ? `:${status.port}` : ''} · MQTT`
                    : 'No broker configured'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Base topic {status.base_topic} ·{' '}
                  <Link className="underline" to="/care/configuration/mqtt">
                    Broker settings
                  </Link>{' '}
                  are shared by every profile on this hub.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {status && !status.enabled ? (
        <Alert>
          MQTT is turned off for this hub, so nothing is published for any profile.{' '}
          <Link className="underline" to="/care/configuration/mqtt">Turn it on in MQTT settings</Link>{' '}
          to share this profile with Home Assistant.
        </Alert>
      ) : (
        <>
          {/* Share + mode */}
          <Card>
            <CardContent className="flex flex-col gap-4 p-4 sm:p-4">
              <label className="flex cursor-pointer items-center justify-between gap-3">
                <span className="text-sm text-foreground">Share this care profile</span>
                <Switch
                  checked={Boolean(mqtt?.enabled)}
                  disabled={busy}
                  onCheckedChange={(v) => toggleSharing(v === true)}
                />
              </label>

              {mqtt?.enabled && (
                <div className="flex flex-col gap-2 border-t border-border pt-4">
                  <h2 className="cp-eyebrow">Sharing mode</h2>
                  <div className="cp-tabs" role="group" aria-label="Sharing mode">
                    {MODE_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className="cp-tab"
                        aria-selected={mode === option.id}
                        disabled={busy}
                        onClick={() => chooseMode(option.id)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {mode === 'none'
                      ? 'Nothing is shared yet — open a group below to choose what to publish.'
                      : activeMode?.blurb}
                  </p>
                  {modeHint && <p className="text-xs text-muted-foreground">{modeHint}</p>}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Permissions */}
          {mqtt?.enabled && (
            <div className="flex flex-col gap-2">
              <h2 className="cp-eyebrow">Permissions</h2>
              <Card>
                <CardContent className="cp-rows p-0">
                  {groups.map((group) => {
                    const Icon = GROUP_ICONS[group.id] || HomeIcon;
                    return (
                      <button
                        key={group.id}
                        type="button"
                        className="cp-row cp-row-button cp-row-compact"
                        onClick={() => setEditingGroup(group)}
                      >
                        <span className="cp-tile" data-tone={group.sharedCount ? 'success' : undefined} aria-hidden>
                          <Icon size={18} />
                        </span>
                        <span className="cp-row-body">
                          <span className="cp-row-title cp-row-title-plain">{group.label}</span>
                          <span className="cp-row-status">
                            <span className="cp-status" data-tone={group.status.tone}>
                              {group.status.label}
                            </span>
                          </span>
                          <span className="cp-row-blurb">{group.blurb}</span>
                        </span>
                        <span className="cp-chevron" aria-hidden><ChevronRightIcon size={18} /></span>
                      </button>
                    );
                  })}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Discovery */}
          {mqtt?.enabled && (
            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-4">
                <div className="min-w-0">
                  <h2 className="cp-eyebrow">Discovery</h2>
                  <p className="mt-1 text-sm text-foreground">
                    {entities
                      ? `${entities.count} ${entities.count === 1 ? 'entity' : 'entities'} published from the sections above`
                      : 'Counting entities…'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Re-announced to Home Assistant every time sharing changes here.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!entities?.count}
                    onClick={() => setEntitiesOpen(true)}
                  >
                    View entities
                  </Button>
                  <Button size="sm" className="gap-1.5" disabled={busy} onClick={republish}>
                    <RefreshIcon size={14} /> Republish
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Advanced */}
          <Card>
            <Link className="cp-row cp-row-compact" to={`${base}/home-assistant/topics`}>
              <span className="cp-tile" aria-hidden><LockIcon size={18} /></span>
              <div className="min-w-0">
                <h3 className="cp-row-title">Advanced · MQTT topics</h3>
                <p className="cp-row-blurb">
                  Where this profile publishes, and how to point it somewhere else.
                </p>
              </div>
              <span className="cp-chevron" aria-hidden><ChevronRightIcon size={18} /></span>
            </Link>
          </Card>
        </>
      )}

      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="secondary" asChild>
          <Link to={base}>Back to profile</Link>
        </Button>
        <Button asChild>
          <Link to={base}>Done</Link>
        </Button>
      </div>

      <PermissionGroupDialog
        group={editingGroup}
        sections={sections}
        open={Boolean(editingGroup)}
        saving={busy}
        onOpenChange={(o) => { if (!o) setEditingGroup(null); }}
        onSave={async (next) => {
          const ok = await save(true, next, `${editingGroup.label} permissions saved.`);
          if (ok) setEditingGroup(null);
        }}
      />
      <EntitiesDialog
        entities={entities?.entities}
        patientName={patient ? fullName(patient) : ''}
        open={entitiesOpen}
        onOpenChange={setEntitiesOpen}
      />
    </CareProfileSection>
  );
}
