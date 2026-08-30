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
import { useState } from 'react';
import AdminV2Layout from './AdminV2Layout';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import { apiFetch } from '../../config';
import config from '../../config';
import { DatabaseIcon, UndoIcon, ChevronDownIcon } from '../../components/Icons';
import { EmField, EmSelect } from '../../components/vc/EntityModal';
import { CfgSection, CfgGroup } from './settings/CfgSection';
import '../../components/vc/entity-card.css';
import './AdminV2.css';
import './settings/settings-page.css';

// Keep an explicit sentinel so "no patient chosen" is a real row rather than
// a blank first option.
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
        <div className="admin-v2-page">
          <div className="cfg">
            <CfgSection icon={<DatabaseIcon size={16} />} title="Access Denied">
              <CfgGroup>
                <p className="cfg-empty">
                  Backup &amp; Restore is only available to system administrators.
                </p>
              </CfgGroup>
            </CfgSection>
          </div>
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
        <div className="cfg cfg-cols">
          <CfgSection
            icon={<DatabaseIcon size={16} />}
            title="Export Patient"
            actions={
              <button type="button" className="em-submit" onClick={handleExport}
                      disabled={exporting || !exportPatientId}>
                {exporting ? 'Exporting…' : 'Download Backup'}
              </button>
            }
          >
            <CfgGroup>
              {exportError && <p className="em-error" role="alert">{exportError}</p>}
              {exportSuccess && <p className="em-success" role="status">{exportSuccess}</p>}

              <EmField
                label="Patient"
                htmlFor="export-patient"
                hint="All rows tied to this patient will be included. The download is a gzipped tar archive containing one JSON file per entity."
              >
                <EmSelect
                  id="export-patient"
                  value={exportPatientId ? String(exportPatientId) : NONE}
                  onChange={(e) => setExportPatientId(e.target.value === NONE ? '' : e.target.value)}
                  disabled={loadingPatients || exporting}
                >
                  <option value={NONE}>-- Select patient --</option>
                  {activePatients.map(p => (
                    <option key={p.id} value={String(p.id)}>
                      {p.first_name} {p.last_name}{p.medical_record_number ? ` (MRN ${p.medical_record_number})` : ''}
                    </option>
                  ))}
                </EmSelect>
              </EmField>
            </CfgGroup>
          </CfgSection>

          <CfgSection
            icon={<UndoIcon size={16} />}
            title="Restore Patient"
            actions={
              <button type="button" className="em-submit" onClick={handleRestore}
                      disabled={restoring || !restoreFile}>
                {restoring ? 'Restoring…' : 'Restore From Backup'}
              </button>
            }
          >
            <CfgGroup>
              {restoreError && <p className="em-error" role="alert">{restoreError}</p>}
              {restoreResult && (
                <div className="em-success" role="status">
                  Restored patient as new id <strong>{restoreResult.new_patient_id}</strong>.
                  Inserted {totalRestored} rows across {Object.keys(restoreResult.inserted || {}).length} tables.
                  <details className="cfg-details">
                    <summary><ChevronDownIcon size={12} />Per-table breakdown</summary>
                    <ul className="cfg-kv">
                      {Object.entries(restoreResult.inserted || {}).map(([table, count]) => (
                        <li key={table}>{table}<b>{count}</b></li>
                      ))}
                    </ul>
                  </details>
                </div>
              )}

              <EmField
                label="Backup file (.tar.gz)"
                htmlFor="restore-file-input"
                hint="A new patient record will be created in this account. Original ids are not preserved — every foreign key is remapped. Any user references that no longer exist in this account will be attributed to the hidden “Imported (legacy attribution)” user, which is created automatically on first restore."
              >
                <input
                  id="restore-file-input"
                  className="em-input"
                  type="file"
                  accept=".gz,.tar.gz,application/gzip,application/x-tar"
                  onChange={(e) => setRestoreFile(e.target.files?.[0] || null)}
                  disabled={restoring}
                />
              </EmField>
            </CfgGroup>
          </CfgSection>
        </div>
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Backup;
