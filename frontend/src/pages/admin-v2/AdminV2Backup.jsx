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
import React, { useState } from 'react';
import AdminV2Layout from './AdminV2Layout';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import { apiFetch } from '../../config';
import config from '../../config';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { Field } from '@/components/ui/field';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import './AdminV2.css';

// Radix Select forbids an empty-string value, so use a sentinel for "none".
const NONE = '__none__';

const AdminV2Backup = () => {
  const { user } = useAuth();
  const { patients, loadingPatients } = useAdminPatient();

  const [exportPatientId, setExportPatientId] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [exportSuccess, setExportSuccess] = useState('');

  const [restoreFile, setRestoreFile] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState('');
  const [restoreResult, setRestoreResult] = useState(null);

  if (user && !user.is_system_admin) {
    return (
      <AdminV2Layout>
        <div style={{ padding: '2rem', color: 'var(--muted-foreground)', textAlign: 'center' }}>
          <h3 style={{ color: 'var(--foreground)' }}>Access Denied</h3>
          <p>Backup &amp; Restore is only available to system administrators.</p>
        </div>
      </AdminV2Layout>
    );
  }

  const activePatients = (patients || []).filter(p => p.is_active);

  const handleExport = async () => {
    setExportError('');
    setExportSuccess('');
    if (!exportPatientId) {
      setExportError('Select a patient to back up.');
      return;
    }
    setExporting(true);
    try {
      const res = await apiFetch(`${config.apiUrl}/api/backup/export/${exportPatientId}`);
      if (!res.ok) {
        const text = await res.text();
        let detail = text;
        try { detail = JSON.parse(text).detail || text; } catch { /* not JSON */ }
        throw new Error(detail || `Export failed (HTTP ${res.status})`);
      }
      // Pull suggested filename from Content-Disposition if present
      const disposition = res.headers.get('content-disposition') || '';
      const match = disposition.match(/filename="?([^"]+)"?/i);
      const filename = match ? match[1] : `shh-backup-${exportPatientId}.tar.gz`;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportSuccess(`Backup downloaded: ${filename}`);
    } catch (err) {
      setExportError(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleRestore = async () => {
    setRestoreError('');
    setRestoreResult(null);
    if (!restoreFile) {
      setRestoreError('Choose a backup file (.tar.gz) to restore.');
      return;
    }
    setRestoring(true);
    try {
      const formData = new FormData();
      formData.append('file', restoreFile);
      const res = await apiFetch(`${config.apiUrl}/api/backup/import`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || `Restore failed (HTTP ${res.status})`);
      }
      setRestoreResult(data);
      setRestoreFile(null);
      const fileInput = document.getElementById('restore-file-input');
      if (fileInput) fileInput.value = '';
    } catch (err) {
      setRestoreError(err.message || 'Restore failed');
    } finally {
      setRestoring(false);
    }
  };

  const totalRestored = restoreResult
    ? Object.values(restoreResult.inserted || {}).reduce((sum, n) => sum + (n || 0), 0)
    : 0;

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        <div className="tw grid gap-6 lg:grid-cols-2">
          {/* Export */}
          <Card>
            <CardHeader><CardTitle>Export Patient</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-4">
              {exportError && <Alert variant="destructive">{exportError}</Alert>}
              {exportSuccess && <Alert variant="success">{exportSuccess}</Alert>}

              <Field
                label="Patient"
                htmlFor="export-patient"
                hint="All rows tied to this patient will be included. The download is a gzipped tar archive containing one JSON file per entity."
              >
                <Select
                  value={exportPatientId ? String(exportPatientId) : NONE}
                  onValueChange={(v) => setExportPatientId(v === NONE ? '' : v)}
                  disabled={loadingPatients || exporting}
                >
                  <SelectTrigger id="export-patient">
                    <SelectValue placeholder="-- Select patient --" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>-- Select patient --</SelectItem>
                    {activePatients.map(p => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.first_name} {p.last_name}{p.medical_record_number ? ` (MRN ${p.medical_record_number})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </CardContent>
            <CardFooter>
              <Button type="button" onClick={handleExport} disabled={exporting || !exportPatientId}>
                {exporting ? 'Exporting…' : 'Download Backup'}
              </Button>
            </CardFooter>
          </Card>

          {/* Restore */}
          <Card>
            <CardHeader><CardTitle>Restore Patient</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-4">
              {restoreError && <Alert variant="destructive">{restoreError}</Alert>}
              {restoreResult && (
                <Alert variant="success">
                  <div>
                    Restored patient as new id <strong>{restoreResult.new_patient_id}</strong>.
                    Inserted {totalRestored} rows across {Object.keys(restoreResult.inserted || {}).length} tables.
                  </div>
                  <details className="mt-2">
                    <summary className="cursor-pointer">Per-table breakdown</summary>
                    <ul className="mt-2 list-disc pl-5">
                      {Object.entries(restoreResult.inserted || {}).map(([table, count]) => (
                        <li key={table}>{table}: {count}</li>
                      ))}
                    </ul>
                  </details>
                </Alert>
              )}

              <Field
                label="Backup file (.tar.gz)"
                htmlFor="restore-file-input"
                hint="A new patient record will be created in this account. Original ids are not preserved — every foreign key is remapped. Any user references that no longer exist in this account will be attributed to the hidden “Imported (legacy attribution)” user, which is created automatically on first restore."
              >
                <Input
                  id="restore-file-input"
                  type="file"
                  accept=".gz,.tar.gz,application/gzip,application/x-tar"
                  className="h-auto cursor-pointer py-1.5 file:mr-3 file:cursor-pointer"
                  onChange={(e) => setRestoreFile(e.target.files?.[0] || null)}
                  disabled={restoring}
                />
              </Field>
            </CardContent>
            <CardFooter>
              <Button type="button" onClick={handleRestore} disabled={restoring || !restoreFile}>
                {restoring ? 'Restoring…' : 'Restore From Backup'}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Backup;
