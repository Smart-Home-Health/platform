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
// What counts as a bad room for this patient. Sits beside VitalRangesCard on
// the patient record because it is the same kind of thing — a bound the care
// team sets — even though it is stored apart from the clinical ranges.
//
// Values are entered by the care team, not supplied as clinical guidance; the
// defaults are ordinary public comfort/air-quality figures and are labelled as
// defaults until somebody overrides them.
import { useCallback, useEffect, useState } from 'react';
import config, { apiFetch } from '../../config';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';

// hasFloor marks the metrics where a low reading means something. CO2 and
// PM2.5 only have ceilings — offering a floor for them would invite a 0 that
// reads as a real bound and flags every clean reading.
const ENV_METRICS = [
  { key: 'temperature', label: 'Room temperature', unit: '°C', hasFloor: true },
  { key: 'relative_humidity', label: 'Room humidity', unit: '%', hasFloor: true },
  { key: 'co2', label: 'CO2', unit: 'ppm', hasFloor: false },
  { key: 'pm25', label: 'PM2.5', unit: 'µg/m³', hasFloor: false },
];
const META = Object.fromEntries(ENV_METRICS.map((m) => [m.key, m]));
const FIELDS = ['critical_min', 'caution_min', 'caution_max', 'critical_max'];

export default function EnvRangesCard({ patientId }) {
  const [rows, setRows] = useState([]);
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const load = useCallback(async () => {
    try {
      const resp = await apiFetch(
        `${config.apiUrl}/api/environment/ranges?patient_id=${patientId}`);
      if (resp.ok) {
        setRows((await resp.json()).ranges || []);
        setEdits({});
      }
    } catch {
      // The patient page owns error reporting; an unreachable card just has
      // nothing to edit.
    }
  }, [patientId]);

  useEffect(() => { if (patientId) load(); }, [patientId, load]);

  const valueOf = (row, field) => {
    const edited = edits[row.metric]?.[field];
    if (edited !== undefined) return edited;
    return row[field] === null || row[field] === undefined ? '' : String(row[field]);
  };

  const setValue = (metric, field, value) => {
    setEdits((prev) => ({ ...prev, [metric]: { ...prev[metric], [field]: value } }));
    setMessage(null);
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    // Send every metric, not just the edited ones: a metric the user emptied
    // has to reach the server to be cleared back to its default.
    const payload = rows.map((row) => {
      const out = { metric: row.metric, note: row.note ?? null };
      FIELDS.forEach((field) => {
        const raw = valueOf(row, field);
        const num = raw === '' ? null : Number(raw);
        out[field] = num === null || Number.isNaN(num) ? null : num;
      });
      return out;
    });
    try {
      const resp = await apiFetch(`${config.apiUrl}/api/environment/ranges`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_id: patientId, ranges: payload }),
      });
      if (!resp.ok) throw new Error('Could not save these bounds.');
      setRows((await resp.json()).ranges || []);
      setEdits({});
      setMessage({ tone: 'success', text: 'Saved.' });
    } catch (err) {
      setMessage({ tone: 'destructive', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const dirty = Object.keys(edits).length > 0;

  return (
    <Card className="tw">
      <CardHeader>
        <CardTitle>Room conditions</CardTitle>
        <p className="text-sm text-muted-foreground">
          When to flag the room on this patient&rsquo;s timeline. Caution is worth
          noticing; critical is worth acting on. Leave a field blank for no bound.
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Metric</th>
                <th className="py-2 pr-3 font-medium">Critical low</th>
                <th className="py-2 pr-3 font-medium">Caution low</th>
                <th className="py-2 pr-3 font-medium">Caution high</th>
                <th className="py-2 pr-3 font-medium">Critical high</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const meta = META[row.metric] || { label: row.metric, unit: '' };
                return (
                  <tr key={row.metric} className="border-t border-border">
                    <td className="py-2 pr-3 align-middle">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{meta.label}</span>
                        <span className="text-xs text-muted-foreground">{meta.unit}</span>
                        {row.source === 'default' && (
                          <Badge variant="outline" className="text-[10px]">Default</Badge>
                        )}
                      </div>
                    </td>
                    {FIELDS.map((field) => {
                      const isFloor = field.endsWith('_min');
                      if (isFloor && !meta.hasFloor) {
                        return (
                          <td key={field} className="py-2 pr-3 text-muted-foreground">
                            <span aria-hidden="true">—</span>
                            <span className="sr-only">not applicable</span>
                          </td>
                        );
                      }
                      return (
                        <td key={field} className="py-2 pr-3">
                          <Input
                            type="number"
                            inputMode="decimal"
                            className="w-24"
                            aria-label={`${meta.label} ${field.replace('_', ' ')}`}
                            value={valueOf(row, field)}
                            onChange={(e) => setValue(row.metric, field, e.target.value)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {message && (
          <div className="mt-3">
            <Alert variant={message.tone === 'success' ? 'success' : 'destructive'}>
              {message.text}
            </Alert>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex items-center gap-2">
        <Button onClick={save} disabled={!dirty || saving}>
          {saving ? 'Saving…' : 'Save room conditions'}
        </Button>
        {dirty && !saving && (
          <Button variant="ghost" onClick={() => { setEdits({}); setMessage(null); }}>
            Discard
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
