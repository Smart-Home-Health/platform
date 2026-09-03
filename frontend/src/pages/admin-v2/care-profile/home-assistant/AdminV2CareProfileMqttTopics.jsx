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
// Care profile → Home Assistant → Advanced · MQTT topics.
//
// Only the per-profile overrides live here. The base topic and the broker are
// hub-wide settings and are shown read-only, with a link to where they are set.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import config, { apiFetch } from '../../../../config';
import { EmField } from '../../../../components/vc/EntityModal';
import { CfgSection, CfgGroup } from '../../settings/CfgSection';
import CareProfileSection from '../CareProfileSection';
import useCareProfile from '../useCareProfile';
import '../care-profile.css';

export default function AdminV2CareProfileMqttTopics() {
  const { patientId } = useParams();
  const { patient, mqtt, loading, error, setError, reload } =
    useCareProfile(patientId, { mqtt: true });

  const [overrides, setOverrides] = useState({ state_topic: '', set_topic: '' });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!mqtt) return;
    setOverrides(mqtt.topicOverrides);
  }, [mqtt]);

  const baseTopic = mqtt?.baseTopic || 'shh';
  const defaultState = `${baseTopic}/patient/${patientId}/state`;
  const defaultSet = `${baseTopic}/patient/${patientId}/set`;

  const save = async (e) => {
    e.preventDefault();
    if (!mqtt?.integration) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const res = await apiFetch(
        `${config.apiUrl}/api/integrations/patient/${patientId}/${mqtt.integration.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(mqtt.integration.settings || {}),
            topic_overrides: {
              state_topic: overrides.state_topic.trim(),
              set_topic: overrides.set_topic.trim(),
            },
          }),
        });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof body.detail === 'string' ? body.detail
          : 'Could not save these topics.');
      }
      await reload();
      setNotice('Topics saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const effective = (override, fallback) => override?.trim() || fallback;

  return (
    <CareProfileSection
      patientId={patientId}
      patient={patient}
      title="MQTT topics"
      description="Where this profile publishes, and how to point it somewhere else."
      loading={loading}
      error={error}
      notice={notice}
    >
      {!mqtt?.integration ? (
        <p className="cfg-note">
          Nothing is published for this profile yet. Turn sharing on under{' '}
          <Link className="cfg-link" to={`/care/configuration/patients/${patientId}/home-assistant`}>
            Home Assistant
          </Link>{' '}
          and its topics will appear here.
        </p>
      ) : (
        <>
          <CfgSection title="In use now">
            <CfgGroup>
              <dl className="cfg-facts">
                <div>
                  <dt>Device → Home Assistant</dt>
                  <dd>{effective(overrides.state_topic, defaultState)}</dd>
                </div>
                <div>
                  <dt>Home Assistant → device</dt>
                  <dd>{effective(overrides.set_topic, defaultSet)}</dd>
                </div>
              </dl>
              <p className="cfg-fine">
                The <code>{baseTopic}</code> prefix is hub-wide —
                change it in{' '}
                <Link className="cfg-link" to="/care/configuration/mqtt">MQTT settings</Link>.
              </p>
            </CfgGroup>
          </CfgSection>

          <CfgSection
            title="Overrides"
            actions={
              <button type="submit" form="cp-mqtt-form" className="em-submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save topics'}
              </button>
            }
          >
            <CfgGroup hint="Leave these blank unless the broker expects topics of its own. An override replaces the default entirely.">
              <form id="cp-mqtt-form" className="cfg-form" onSubmit={save}>
                <EmField label="State topic override" htmlFor="cp-mqtt-state" hint={`Default: ${defaultState}`}>
                  <input
                    id="cp-mqtt-state"
                    className="em-input"
                    value={overrides.state_topic}
                    onChange={(e) => setOverrides((p) => ({ ...p, state_topic: e.target.value }))}
                    placeholder={defaultState}
                  />
                </EmField>
                <EmField label="Set topic override" htmlFor="cp-mqtt-set" hint={`Default: ${defaultSet}`}>
                  <input
                    id="cp-mqtt-set"
                    className="em-input"
                    value={overrides.set_topic}
                    onChange={(e) => setOverrides((p) => ({ ...p, set_topic: e.target.value }))}
                    placeholder={defaultSet}
                  />
                </EmField>
              </form>
            </CfgGroup>
          </CfgSection>

          <p className="cfg-note">
            Changing a topic does not move the entities Home Assistant already knows
            about — republish discovery from the Home Assistant page afterwards.
          </p>
        </>
      )}
    </CareProfileSection>
  );
}
