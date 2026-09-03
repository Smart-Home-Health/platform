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
// Loads one care profile and, on request, the extra reads the hub needs to
// summarise its setup sections. Sub-pages ask only for what they render, so
// opening "Care context" does not fetch every vital range in the account.
import { useCallback, useEffect, useState } from 'react';
import config, { apiFetch } from '../../../config';

const jsonOr = async (res, fallback) => (res.ok ? res.json() : fallback);

// FastAPI returns `detail` as a string for our own errors and as a list of
// objects for validation failures; stringifying the list blindly renders
// "[object Object]".
const detailText = (detail, fallback) => {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const msgs = detail.map((d) => d?.msg).filter(Boolean);
    if (msgs.length) return msgs.join('; ');
  }
  return fallback;
};

// Partial update of the profile record. Fields left out keep their value —
// the API drops nulls — so each section page sends only what it edits.
export async function updateCareProfile(patientId, payload) {
  const res = await apiFetch(`${config.apiUrl}/api/patients/${patientId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(detailText(body.detail, 'Could not save these changes.'));
  return body;
}

export default function useCareProfile(patientId, { mqtt = false, measurements = false } = {}) {
  const [patient, setPatient] = useState(null);
  const [mqttState, setMqttState] = useState(null);
  const [measurementState, setMeasurementState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!patientId) return;
    setLoading(true);
    setError('');
    try {
      const requests = [apiFetch(`${config.apiUrl}/api/patients/${patientId}`)];
      if (mqtt) {
        requests.push(
          apiFetch(`${config.apiUrl}/api/mqtt/settings`),
          apiFetch(`${config.apiUrl}/api/mqtt/patients`),
          apiFetch(`${config.apiUrl}/api/integrations/patient/${patientId}?include_disabled=true`),
        );
      }
      if (measurements) {
        requests.push(
          apiFetch(`${config.apiUrl}/api/vitals/ranges?patient_id=${patientId}`),
          apiFetch(`${config.apiUrl}/api/vitals/custom-definitions?patient_id=${patientId}`),
          apiFetch(`${config.apiUrl}/api/environment/ranges?patient_id=${patientId}`),
        );
      }
      const responses = await Promise.all(requests);
      const [patientRes, ...rest] = responses;
      if (!patientRes.ok) throw new Error('Could not load this care profile.');
      setPatient(await patientRes.json());

      let cursor = 0;
      if (mqtt) {
        const [settingsRes, patientsRes, integrationsRes] = rest.slice(cursor, cursor + 3);
        cursor += 3;
        const settings = await jsonOr(settingsRes, {});
        const rows = await jsonOr(patientsRes, []);
        const integrations = await jsonOr(integrationsRes, []);
        const row = rows.find((r) => String(r.patient_id) === String(patientId));
        const integration = integrations.find((i) => i.integration_slug === 'mqtt');
        setMqttState({
          globalOn: settings.mqtt_enabled === true || settings.mqtt_enabled === 'true',
          baseTopic: settings.mqtt_base_topic || 'shh',
          enabled: Boolean(row?.enabled),
          sections: row?.sections || {},
          integration: integration ? { id: integration.id, settings: integration.settings || {} } : null,
          topicOverrides: {
            state_topic: integration?.settings?.topic_overrides?.state_topic || '',
            set_topic: integration?.settings?.topic_overrides?.set_topic || '',
          },
        });
      }
      if (measurements) {
        const [rangesRes, customRes, envRes] = rest.slice(cursor, cursor + 3);
        const ranges = await jsonOr(rangesRes, {});
        const envRanges = await jsonOr(envRes, {});
        setMeasurementState({
          ranges: ranges.ranges || [],
          customDefinitions: await jsonOr(customRes, []),
          envRanges: envRanges.ranges || [],
        });
      }
    } catch (e) {
      setError(e.message || 'Could not load this care profile.');
    } finally {
      setLoading(false);
    }
  }, [patientId, mqtt, measurements]);

  useEffect(() => { load(); }, [load]);

  return {
    patient,
    setPatient,
    mqtt: mqttState,
    measurements: measurementState,
    loading,
    error,
    setError,
    reload: load,
  };
}
