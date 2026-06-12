/*
 * Smart Home Health Hub
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
import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import { PatientSelectorModal } from './components';
import config from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import {
  MedicationsIcon,
  SearchIcon,
  RefreshIcon,
  XIcon,
  ChevronRightIcon
} from '../../components/Icons';
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

const AdminV2MedicationsHistory = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { 
    patients, 
    selectedPatient: contextPatient, 
    selectPatient: setContextPatient,
    loadingPatients 
  } = useAdminPatient();
  
  // Use context patient as the source of truth
  const selectedPatient = contextPatient;
  const [showPatientModal, setShowPatientModal] = useState(false);
  
  // History data state
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Filter state
  const [searchText, setSearchText] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [limit, setLimit] = useState(50);

  // View mode (Table/Cards). 'cards' forces the card layout at any width.
  const [viewMode, setViewMode] = useState(
    () => localStorage.getItem('adminV2MedsHistoryViewMode') || 'auto'
  );
  useEffect(() => {
    localStorage.setItem('adminV2MedsHistoryViewMode', viewMode);
  }, [viewMode]);

  // Collapsible filter card — collapsed by default since it otherwise dominates the page.
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Debounce search
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce the search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchText);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  // Check URL params for patient ID or use context patient
  useEffect(() => {
    const patientId = searchParams.get('patient');
    if (patientId && patients.length > 0) {
      const patient = patients.find(p => p.id === parseInt(patientId));
      if (patient && patient.id !== contextPatient?.id) {
        setContextPatient(patient);
      }
    } else if (!patientId && !contextPatient && patients.length > 0 && !loadingPatients) {
      setShowPatientModal(true);
    }
  }, [searchParams, patients, loadingPatients]);

  // Update URL when context patient changes
  useEffect(() => {
    if (contextPatient && searchParams.get('patient') !== String(contextPatient.id)) {
      setSearchParams({ patient: contextPatient.id });
    }
  }, [contextPatient]);

  // Fetch history when patient or filters change
  useEffect(() => {
    if (selectedPatient) {
      fetchHistory();
    }
  }, [selectedPatient, debouncedSearch, startDate, endDate, statusFilter, limit]);

  const fetchHistory = async () => {
    if (!selectedPatient) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams();
      params.append('patient_id', selectedPatient.id);
      params.append('limit', limit.toString());
      
      if (debouncedSearch) {
        params.append('medication_name', debouncedSearch);
      }
      if (startDate) {
        params.append('start_date', startDate);
      }
      if (endDate) {
        params.append('end_date', endDate);
      }
      if (statusFilter) {
        params.append('status_filter', statusFilter);
      }
      
      const response = await fetch(
        `${config.apiUrl}/api/medications/history?${params.toString()}`,
        { credentials: 'include' }
      );

      if (response.ok) {
        const data = await response.json();
        setHistory(data.history || []);
      } else {
        setError('Failed to load history');
      }
    } catch (err) {
      setError('Error connecting to server');
      console.error('Error fetching history:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPatient = (patient) => {
    setContextPatient(patient);
    setSearchParams({ patient: patient.id });
    setShowPatientModal(false);
  };

  const handleChangePatient = () => {
    setShowPatientModal(true);
  };

  const handleClearFilters = () => {
    setSearchText('');
    setStartDate('');
    setEndDate('');
    setStatusFilter('');
    setLimit(50);
  };

  // Status helpers
  const getStatusBadge = (status) => {
    const statusMap = {
      'on-time': { label: 'On Time', className: 'success' },
      'early': { label: 'Early', className: 'warning' },
      'late': { label: 'Late', className: 'danger' },
      'skipped': { label: 'Skipped', className: 'muted' }
    };
    return statusMap[status] || { label: status, className: 'muted' };
  };

  const formatDateTime = (isoString) => {
    if (!isoString) return '-';
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatTime = (isoString) => {
    if (!isoString) return '-';
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  // Calculate stats
  const stats = {
    total: history.length,
    onTime: history.filter(h => h.status === 'on-time').length,
    late: history.filter(h => h.status === 'late').length,
    early: history.filter(h => h.status === 'early').length,
    skipped: history.filter(h => h.status === 'skipped').length
  };

  const activeFilterCount =
    [searchText, startDate, endDate, statusFilter].filter(Boolean).length +
    (limit !== 50 ? 1 : 0);

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        {selectedPatient ? (
          <>
            {/* View toggle (Table/Cards) */}
            <div className="admin-v2-meds-header">
              <div className="tw flex gap-2" role="group" aria-label="View mode">
                <Button
                  type="button"
                  variant={viewMode === 'auto' ? 'default' : 'secondary'}
                  onClick={() => setViewMode('auto')}
                  aria-pressed={viewMode === 'auto'}
                >
                  Table
                </Button>
                <Button
                  type="button"
                  variant={viewMode === 'cards' ? 'default' : 'secondary'}
                  onClick={() => setViewMode('cards')}
                  aria-pressed={viewMode === 'cards'}
                >
                  Cards
                </Button>
              </div>
            </div>

            {/* Collapsible Filters */}
            <div className={`admin-v2-filter-card${filtersOpen ? ' open' : ''}`}>
              <button
                type="button"
                className="admin-v2-filter-toggle"
                onClick={() => setFiltersOpen(o => !o)}
                aria-expanded={filtersOpen}
              >
                <span>Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</span>
                <span className="admin-v2-filter-chevron"><ChevronRightIcon size={18} /></span>
              </button>
              {filtersOpen && (
                <div className="admin-v2-filter-body">
                  <div className="tw flex flex-col gap-4">
                    {/* Search Input */}
                    <div className="relative">
                      <SearchIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="text"
                        placeholder="Search medication name..."
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        className="pl-9 pr-9"
                      />
                      {searchText && (
                        <button
                          type="button"
                          onClick={() => setSearchText('')}
                          className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                        >
                          <XIcon size={14} />
                        </button>
                      )}
                    </div>

                    {/* Filters grid */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <Field label="From" htmlFor="meds-hist-from">
                        <Input id="meds-hist-from" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                      </Field>

                      <Field label="To" htmlFor="meds-hist-to">
                        <Input id="meds-hist-to" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                      </Field>

                      <Field label="Status">
                        <Select value={statusFilter || '__none__'} onValueChange={(v) => setStatusFilter(v === '__none__' ? '' : v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">All Statuses</SelectItem>
                            <SelectItem value="on-time">On Time</SelectItem>
                            <SelectItem value="early">Early</SelectItem>
                            <SelectItem value="late">Late</SelectItem>
                            <SelectItem value="skipped">Skipped</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>

                      <Field label="Show">
                        <Select value={String(limit)} onValueChange={(v) => setLimit(parseInt(v))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="25">25</SelectItem>
                            <SelectItem value="50">50</SelectItem>
                            <SelectItem value="100">100</SelectItem>
                            <SelectItem value="250">250</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap items-center gap-2">
                      {(searchText || startDate || endDate || statusFilter || limit !== 50) && (
                        <Button variant="secondary" onClick={handleClearFilters}>
                          Clear Filters
                        </Button>
                      )}
                      <Button className="ml-auto" onClick={fetchHistory} disabled={loading}>
                        <RefreshIcon size={16} />
                        Refresh
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Stats Summary */}
            {history.length > 0 && (
              <div className="history-stats">
                <div className="history-stat">
                  <span className="history-stat-value">{stats.total}</span>
                  <span className="history-stat-label">Total Records</span>
                </div>
                <div className="history-stat success">
                  <span className="history-stat-value">{stats.onTime}</span>
                  <span className="history-stat-label">On Time</span>
                </div>
                <div className="history-stat warning">
                  <span className="history-stat-value">{stats.early}</span>
                  <span className="history-stat-label">Early</span>
                </div>
                <div className="history-stat danger">
                  <span className="history-stat-value">{stats.late}</span>
                  <span className="history-stat-label">Late</span>
                </div>
                <div className="history-stat muted">
                  <span className="history-stat-value">{stats.skipped}</span>
                  <span className="history-stat-label">Skipped</span>
                </div>
              </div>
            )}

            {/* Results */}
            {loading ? (
              <div className="admin-v2-loading">Loading history...</div>
            ) : error ? (
              <div className="admin-v2-error-container tw">
                <Alert variant="destructive">{error}</Alert>
                <Button variant="secondary" onClick={fetchHistory}>
                  Try Again
                </Button>
              </div>
            ) : history.length === 0 ? (
              <div className="admin-v2-empty-state">
                <MedicationsIcon size={48} />
                <p>No medication history found</p>
                {(searchText || startDate || endDate || statusFilter) && (
                  <div className="tw">
                    <Button variant="secondary" onClick={handleClearFilters}>
                      Clear Filters
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className={viewMode === 'cards' ? 'admin-v2-meds-force-cards' : ''}>
                {/* Desktop: dense table */}
                <div className="admin-v2-table-container admin-v2-meds-desktop">
                  <table className="admin-v2-table">
                    <thead>
                      <tr>
                        <th>Medication</th>
                        <th>Dose</th>
                        <th>Administered At</th>
                        <th>Scheduled For</th>
                        <th>Status</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((record) => {
                        const statusInfo = getStatusBadge(record.status);
                        return (
                          <tr key={record.id}>
                            <td>
                              <div className="history-med-cell">
                                <span className="history-med-name">{record.medication_name}</span>
                                {record.concentration && (
                                  <span className="history-med-concentration">{record.concentration}</span>
                                )}
                              </div>
                            </td>
                            <td>
                              {record.dose_amount > 0 ? (
                                <span className="history-dose">
                                  {record.dose_amount} {record.dose_unit || 'units'}
                                </span>
                              ) : (
                                <span className="history-dose skipped">—</span>
                              )}
                            </td>
                            <td className="history-datetime">
                              {formatDateTime(record.administered_at)}
                            </td>
                            <td className="history-datetime">
                              {record.is_scheduled && record.scheduled_time ? (
                                formatDateTime(record.scheduled_time)
                              ) : (
                                <span className="history-unscheduled">As Needed</span>
                              )}
                            </td>
                            <td>
                              <span className={`history-status-badge ${statusInfo.className}`}>
                                {statusInfo.label}
                              </span>
                            </td>
                            <td className="history-notes">
                              {record.notes || '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile / Cards: stacked card list */}
                <div className="admin-v2-meds-cards">
                  {history.map((record) => {
                    const statusInfo = getStatusBadge(record.status);
                    return (
                      <div key={record.id} className="admin-v2-med-card">
                        <div className="admin-v2-med-card-row admin-v2-med-card-header">
                          <div className="admin-v2-med-card-title">
                            <strong>{record.medication_name}</strong>
                            {record.concentration && (
                              <span className="admin-v2-med-card-concentration">{record.concentration}</span>
                            )}
                          </div>
                          <div className="admin-v2-med-card-badges">
                            <span className={`history-status-badge ${statusInfo.className}`}>
                              {statusInfo.label}
                            </span>
                          </div>
                        </div>

                        {record.notes && (
                          <div className="admin-v2-med-card-instructions">{record.notes}</div>
                        )}

                        <div className="admin-v2-med-card-row admin-v2-med-card-meta">
                          <div className="admin-v2-med-card-meta-item">
                            <span className="admin-v2-med-card-label">Dose</span>
                            <span>
                              {record.dose_amount > 0
                                ? `${record.dose_amount} ${record.dose_unit || 'units'}`
                                : 'Skipped'}
                            </span>
                          </div>
                          <div className="admin-v2-med-card-meta-item">
                            <span className="admin-v2-med-card-label">Administered</span>
                            <span>{formatDateTime(record.administered_at)}</span>
                          </div>
                          <div className="admin-v2-med-card-meta-item">
                            <span className="admin-v2-med-card-label">Scheduled</span>
                            <span>
                              {record.is_scheduled && record.scheduled_time
                                ? formatDateTime(record.scheduled_time)
                                : 'As Needed'}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="admin-v2-placeholder-page">
            <MedicationsIcon size={64} />
            <h2>Select a Patient</h2>
            <p>Choose a patient to view their medication history.</p>
          </div>
        )}

        {/* Patient Modal */}
        {showPatientModal && (
          <PatientSelectorModal
            patients={patients}
            selectedPatient={selectedPatient}
            onSelectPatient={handleSelectPatient}
            onClose={() => setShowPatientModal(false)}
            loading={loadingPatients}
          />
        )}
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2MedicationsHistory;
