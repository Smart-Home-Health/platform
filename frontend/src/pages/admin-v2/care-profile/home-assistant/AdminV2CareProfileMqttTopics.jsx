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
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { Field } from '@/components/ui/field';
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
        <Alert>
          Nothing is published for this profile yet. Turn sharing on under{' '}
          <Link className="underline" to={`/care/configuration/patients/${patientId}/home-assistant`}>
            Home Assistant
          </Link>{' '}
          and its topics will appear here.
        </Alert>
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-col gap-3 p-4 sm:p-4">
              <h2 className="cp-eyebrow">In use now</h2>
              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">Device → Home Assistant</span>
                  <code className="break-all font-mono text-sm text-foreground">
                    {effective(overrides.state_topic, defaultState)}
                  </code>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">Home Assistant → device</span>
                  <code className="break-all font-mono text-sm text-foreground">
                    {effective(overrides.set_topic, defaultSet)}
                  </code>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                The <code className="font-mono">{baseTopic}</code> prefix is hub-wide —
                change it in{' '}
                <Link className="underline" to="/care/configuration/mqtt">MQTT settings</Link>.
              </p>
            </CardContent>
          </Card>

          <form onSubmit={save}>
            <Card>
              <CardContent className="flex flex-col gap-4">
                <p className="text-sm text-muted-foreground">
                  Leave these blank unless the broker expects topics of its own. An
                  override replaces the default entirely.
                </p>
                <Field label="State topic override" hint={`Default: ${defaultState}`}>
                  <Input
                    value={overrides.state_topic}
                    onChange={(e) => setOverrides((p) => ({ ...p, state_topic: e.target.value }))}
                    placeholder={defaultState}
                  />
                </Field>
                <Field label="Set topic override" hint={`Default: ${defaultSet}`}>
                  <Input
                    value={overrides.set_topic}
                    onChange={(e) => setOverrides((p) => ({ ...p, set_topic: e.target.value }))}
                    placeholder={defaultSet}
                  />
                </Field>
              </CardContent>
              <CardFooter className="justify-start">
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving…' : 'Save topics'}
                </Button>
              </CardFooter>
            </Card>
          </form>

          <Alert>
            Changing a topic does not move the entities Home Assistant already knows
            about — republish discovery from the Home Assistant page afterwards.
          </Alert>
        </>
      )}
    </CareProfileSection>
  );
}
