import React, { useState } from 'react';
import AdminV2Layout from './AdminV2Layout';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import { apiFetch } from '../../config';
import config from '../../config';
import './AdminV2.css';

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
        <div style={{ padding: '2rem', color: '#8b949e', textAlign: 'center' }}>
          <h3 style={{ color: '#e6edf3' }}>Access Denied</h3>
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
        <div className="admin-v2-page-header">
          <h1 className="admin-v2-page-title">Backup &amp; Restore</h1>
          <p className="admin-v2-page-subtitle">
            Export a patient and all of their related history (medications, providers,
            care tasks, vitals, nutrition, diagnoses, implants, equipment, and more) into
            a single compressed archive — or restore one back into this account.
          </p>
        </div>

        <div className="admin-v2-content-grid">
          {/* Export */}
          <div className="admin-v2-card">
            <div className="admin-v2-card-header">
              <h2>Export Patient</h2>
            </div>
            <div className="admin-v2-card-body">
              {exportError && <div className="admin-v2-alert error">{exportError}</div>}
              {exportSuccess && <div className="admin-v2-alert success">{exportSuccess}</div>}

              <div className="admin-v2-form-group">
                <label htmlFor="export-patient">Patient</label>
                <select
                  id="export-patient"
                  value={exportPatientId}
                  onChange={(e) => setExportPatientId(e.target.value)}
                  disabled={loadingPatients || exporting}
                >
                  <option value="">-- Select patient --</option>
                  {activePatients.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.first_name} {p.last_name}{p.medical_record_number ? ` (MRN ${p.medical_record_number})` : ''}
                    </option>
                  ))}
                </select>
                <span className="admin-v2-form-help">
                  All rows tied to this patient will be included. The download is a
                  gzipped tar archive containing one JSON file per entity.
                </span>
              </div>

              <div className="admin-v2-form-actions">
                <button
                  type="button"
                  className="admin-v2-btn primary"
                  onClick={handleExport}
                  disabled={exporting || !exportPatientId}
                >
                  {exporting ? 'Exporting…' : 'Download Backup'}
                </button>
              </div>
            </div>
          </div>

          {/* Restore */}
          <div className="admin-v2-card">
            <div className="admin-v2-card-header">
              <h2>Restore Patient</h2>
            </div>
            <div className="admin-v2-card-body">
              {restoreError && <div className="admin-v2-alert error">{restoreError}</div>}
              {restoreResult && (
                <div className="admin-v2-alert success">
                  <div>
                    Restored patient as new id <strong>{restoreResult.new_patient_id}</strong>.
                    Inserted {totalRestored} rows across {Object.keys(restoreResult.inserted || {}).length} tables.
                  </div>
                  <details style={{ marginTop: '0.5rem' }}>
                    <summary style={{ cursor: 'pointer' }}>Per-table breakdown</summary>
                    <ul style={{ marginTop: '0.5rem' }}>
                      {Object.entries(restoreResult.inserted || {}).map(([table, count]) => (
                        <li key={table}>{table}: {count}</li>
                      ))}
                    </ul>
                  </details>
                </div>
              )}

              <div className="admin-v2-form-group">
                <label htmlFor="restore-file-input">Backup file (.tar.gz)</label>
                <input
                  id="restore-file-input"
                  type="file"
                  accept=".gz,.tar.gz,application/gzip,application/x-tar"
                  onChange={(e) => setRestoreFile(e.target.files?.[0] || null)}
                  disabled={restoring}
                />
                <span className="admin-v2-form-help">
                  A new patient record will be created in this account. Original ids are
                  not preserved — every foreign key is remapped. Any user references that
                  no longer exist in this account will be attributed to the hidden
                  &ldquo;Imported (legacy attribution)&rdquo; user, which is created
                  automatically on first restore.
                </span>
              </div>

              <div className="admin-v2-form-actions">
                <button
                  type="button"
                  className="admin-v2-btn primary"
                  onClick={handleRestore}
                  disabled={restoring || !restoreFile}
                >
                  {restoring ? 'Restoring…' : 'Restore From Backup'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Backup;
