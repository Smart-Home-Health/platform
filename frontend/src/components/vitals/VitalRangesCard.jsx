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
// Per-patient expected ranges + required flags for the capture flow.
// Values are entered by the care team ("as specified by the doctor") —
// they are user-configured settings, not app-provided clinical guidance.
import { useCallback, useEffect, useMemo, useState } from 'react';
import config, { apiFetch } from '../../config';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';

const FIELD_LABELS = { systolic: 'Systolic', diastolic: 'Diastolic' };

function labelFor(entry) {
  const base = entry.vital_key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return entry.field_key ? `${base} — ${FIELD_LABELS[entry.field_key] || entry.field_key}` : base;
}

export default function VitalRangesCard({ patientId }) {
  const [rows, setRows] = useState([]);
  const [edits, setEdits] = useState({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const load = useCallback(async () => {
    try {
      const resp = await apiFetch(`${config.apiUrl}/api/vitals/ranges?patient_id=${patientId}`);
      if (resp.ok) {
        setRows((await resp.json()).ranges || []);
        setEdits({});
      }
    } catch {
      // page-level error handling stays quiet; card just shows nothing to edit
    }
  }, [patientId]);

  useEffect(() => { if (patientId) load(); }, [patientId, load]);

  const keyOf = (r) => `${r.vital_key}|${r.field_key || ''}`;

  const valueOf = (r, field) => {
    const edited = edits[keyOf(r)]?.[field];
    if (edited !== undefined) return edited;
    const v = r[field];
    return v === null || v === undefined ? '' : String(v);
  };

  const requiredOf = (r) => {
    const edited = edits[keyOf(r)]?.required;
    return edited !== undefined ? edited : Boolean(r.required);
  };

  const setEdit = (r, field, value) => {
    setEdits((prev) => ({ ...prev, [keyOf(r)]: { ...prev[keyOf(r)], [field]: value } }));
  };

  const dirty = Object.keys(edits).length > 0;

  // The required flag lives on the vital-level row (field_key ''); BP
  // component rows only carry bounds.
  const vitalRows = useMemo(() => rows.filter((r) => !r.field_key || r.field_key === ''), [rows]);
  const componentRows = useMemo(() => rows.filter((r) => r.field_key), [rows]);

  const orderedRows = useMemo(() => {
    const out = [];
    for (const vr of vitalRows) {
      out.push(vr);
      out.push(...componentRows.filter((c) => c.vital_key === vr.vital_key));
    }
    return out;
  }, [vitalRows, componentRows]);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    const num = (s) => (s === '' || s === undefined ? null : parseFloat(s));
    const payload = orderedRows.map((r) => ({
      vital_key: r.vital_key,
      field_key: r.field_key || '',
      expected_min: num(valueOf(r, 'expected_min')),
      expected_max: num(valueOf(r, 'expected_max')),
      implausible_min: r.source === 'patient' || edits[keyOf(r)]?.implausible_min !== undefined
        ? num(valueOf(r, 'implausible_min')) : null,
      implausible_max: r.source === 'patient' || edits[keyOf(r)]?.implausible_max !== undefined
        ? num(valueOf(r, 'implausible_max')) : null,
      required: r.field_key ? false : requiredOf(r),
      note: r.note || null,
    }));
    try {
      const resp = await apiFetch(`${config.apiUrl}/api/vitals/ranges`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_id: patientId, ranges: payload }),
      });
      if (resp.ok) {
        setRows((await resp.json()).ranges || []);
        setEdits({});
        setMessage({ kind: 'success', text: 'Vital ranges saved.' });
      } else {
        const detail = (await resp.json())?.detail;
        setMessage({ kind: 'error',
                     text: typeof detail === 'string' ? detail : 'Could not save ranges.' });
      }
    } catch {
      setMessage({ kind: 'error', text: 'Could not save ranges — check connection.' });
    } finally {
      setSaving(false);
    }
  };

  if (!rows.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vital ranges &amp; required readings</CardTitle>
        <p className="text-sm text-muted-foreground">
          Expected ranges drive the capture screen&apos;s out-of-range warnings — enter the
          bounds the care team specifies. Required readings must be captured before an
          encounter counts as complete. These are your settings, not medical guidance.
        </p>
      </CardHeader>
      <CardContent>
        {message && (
          <Alert variant={message.kind === 'error' ? 'destructive' : 'success'} className="mb-3">
            {message.text}
          </Alert>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1.5 pr-2 font-medium">Vital</th>
                <th className="py-1.5 pr-2 font-medium">Expected min</th>
                <th className="py-1.5 pr-2 font-medium">Expected max</th>
                {showAdvanced && (
                  <>
                    <th className="py-1.5 pr-2 font-medium">Hard min</th>
                    <th className="py-1.5 pr-2 font-medium">Hard max</th>
                  </>
                )}
                <th className="py-1.5 font-medium">Required</th>
              </tr>
            </thead>
            <tbody>
              {orderedRows.map((r) => (
                <tr key={keyOf(r)} className="border-t border-border">
                  <td className={`py-1.5 pr-2 whitespace-nowrap ${r.field_key ? 'pl-4 text-muted-foreground' : 'text-foreground'}`}>
                    {labelFor(r)}
                    {r.source === 'default' && !r.field_key && (
                      <Badge variant="muted" className="ml-2">default</Badge>
                    )}
                  </td>
                  <td className="py-1.5 pr-2">
                    <Input inputMode="decimal" className="h-8 w-20"
                           aria-label={`${labelFor(r)} expected minimum`}
                           value={valueOf(r, 'expected_min')}
                           onChange={(e) => setEdit(r, 'expected_min', e.target.value)} />
                  </td>
                  <td className="py-1.5 pr-2">
                    <Input inputMode="decimal" className="h-8 w-20"
                           aria-label={`${labelFor(r)} expected maximum`}
                           value={valueOf(r, 'expected_max')}
                           onChange={(e) => setEdit(r, 'expected_max', e.target.value)} />
                  </td>
                  {showAdvanced && (
                    <>
                      <td className="py-1.5 pr-2">
                        <Input inputMode="decimal" className="h-8 w-20"
                               aria-label={`${labelFor(r)} implausible minimum`}
                               value={valueOf(r, 'implausible_min')}
                               onChange={(e) => setEdit(r, 'implausible_min', e.target.value)} />
                      </td>
                      <td className="py-1.5 pr-2">
                        <Input inputMode="decimal" className="h-8 w-20"
                               aria-label={`${labelFor(r)} implausible maximum`}
                               value={valueOf(r, 'implausible_max')}
                               onChange={(e) => setEdit(r, 'implausible_max', e.target.value)} />
                      </td>
                    </>
                  )}
                  <td className="py-1.5">
                    {!r.field_key && (
                      <Checkbox
                        checked={requiredOf(r)}
                        aria-label={`${labelFor(r)} required`}
                        onCheckedChange={(v) => setEdit(r, 'required', Boolean(v))}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button variant="ghost" size="sm" className="mt-2"
                onClick={() => setShowAdvanced((v) => !v)}>
          {showAdvanced ? 'Hide hard limits' : 'Advanced: hard limits'}
        </Button>
        {showAdvanced && (
          <p className="mt-1 text-xs text-muted-foreground">
            Hard limits block a reading outright (entry typos, impossible values). Leave
            blank to keep the built-in physical limits.
          </p>
        )}
      </CardContent>
      <CardFooter>
        <Button onClick={save} disabled={!dirty || saving}>
          {saving ? 'Saving…' : 'Save ranges'}
        </Button>
      </CardFooter>
    </Card>
  );
}
