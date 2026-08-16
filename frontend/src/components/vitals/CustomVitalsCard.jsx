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
// Manage a patient's custom vital definitions (configuration surface —
// creation moved here from the old record form; the capture grid picks
// definitions up automatically, and VitalRangesCard lists them for bounds).
import { useCallback, useEffect, useState } from 'react';
import config, { apiFetch } from '../../config';
import { XIcon } from '../Icons';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { Field } from '@/components/ui/field';

export default function CustomVitalsCard({ patientId, onChanged }) {
  const [definitions, setDefinitions] = useState([]);
  const [form, setForm] = useState({ name: '', unit: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const resp = await apiFetch(
        `${config.apiUrl}/api/vitals/custom-definitions?patient_id=${patientId}`);
      if (resp.ok) setDefinitions(await resp.json());
    } catch {
      // leave the list as-is; the add/delete paths surface their own errors
    }
  }, [patientId]);

  useEffect(() => { if (patientId) load(); }, [patientId, load]);

  const add = async () => {
    if (!form.name.trim()) return;
    setBusy(true);
    setError('');
    try {
      const resp = await apiFetch(`${config.apiUrl}/api/vitals/custom-definitions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: patientId,
          name: form.name.trim(),
          unit: form.unit.trim() || null,
          display_label: form.name.trim(),
        }),
      });
      if (resp.ok) {
        setForm({ name: '', unit: '' });
        await load();
        onChanged?.();
      } else {
        setError('Could not add the vital.');
      }
    } catch {
      setError('Could not add the vital — check connection.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (def) => {
    if (!window.confirm(`Remove "${def.display_label || def.name}"? Recorded readings are kept; the vital just stops appearing on the capture screen.`)) return;
    setBusy(true);
    setError('');
    try {
      const resp = await apiFetch(
        `${config.apiUrl}/api/vitals/custom-definitions/${def.id}`, { method: 'DELETE' });
      if (resp.ok) {
        await load();
        onChanged?.();
      } else {
        setError('Could not remove the vital.');
      }
    } catch {
      setError('Could not remove the vital — check connection.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Custom vitals</CardTitle>
        <p className="text-sm text-muted-foreground">
          Extra measurements to capture for this patient (for example peak flow or
          blood glucose). They appear on the capture screen alongside the built-in
          vitals, and their expected ranges are set below once added.
        </p>
      </CardHeader>
      <CardContent>
        {error && <Alert variant="destructive" className="mb-3">{error}</Alert>}
        {definitions.length > 0 && (
          <ul className="mb-4 flex flex-col gap-1.5">
            {definitions.map((d) => (
              <li key={d.id}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-1.5 text-sm">
                <span className="text-foreground">
                  {d.display_label || d.name}
                  {d.unit && <span className="ml-2 text-muted-foreground">{d.unit}</span>}
                </span>
                <Button variant="ghost" size="sm" disabled={busy}
                        aria-label={`Remove ${d.display_label || d.name}`}
                        onClick={() => remove(d)}>
                  <XIcon size={16} />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Name">
            <Input value={form.name} placeholder="Peak flow" className="w-44"
                   onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label="Unit">
            <Input value={form.unit} placeholder="L/min" className="w-28"
                   onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} />
          </Field>
          <Button onClick={add} disabled={busy || !form.name.trim()}>Add vital</Button>
        </div>
      </CardContent>
    </Card>
  );
}
