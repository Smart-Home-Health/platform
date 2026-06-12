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
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import { PatientHeader, PatientSelectorModal } from './components';
import config from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import {
  TasksIcon,
  SearchIcon,
  RefreshIcon,
  XIcon
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

const AdminV2CareTasksHistory = () => {
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
  
  // Categories state
  const [categories, setCategories] = useState([]);
  
  // History data state
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Filter state
  const [searchText, setSearchText] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [limit, setLimit] = useState(50);
  
  // Debounce search
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce the search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchText);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  // Fetch categories on mount
  useEffect(() => {
    fetchCategories();
  }, []);

  // Check for patient param and sync with context
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
  }, [patients, searchParams, loadingPatients]);

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
  }, [selectedPatient, debouncedSearch, startDate, endDate, statusFilter, categoryFilter, limit]);

  const fetchCategories = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/care-task-categories`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setCategories(data.categories || []);
      }
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
  };

  const fetchHistory = async () => {
    if (!selectedPatient) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams();
      params.append('patient_id', selectedPatient.id);
      params.append('limit', limit.toString());
      
      if (debouncedSearch) {
        params.append('task_name', debouncedSearch);
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
      if (categoryFilter) {
        params.append('category_id', categoryFilter);
      }
      
      const response = await fetch(
        `${config.apiUrl}/api/care-tasks/history?${params.toString()}`,
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
    setCategoryFilter('');
    setLimit(50);
  };

  // Status helpers
  const getStatusBadge = (status) => {
    const statusMap = {
      'completed': { label: 'Completed', className: 'success' },
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
    completed: history.filter(h => h.completion_status === 'completed').length,
    skipped: history.filter(h => h.completion_status === 'skipped').length
  };

  // Get unique categories from history for filter display
  const historyCategories = [...new Set(history.map(h => h.task_category).filter(Boolean))];

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        {selectedPatient ? (
          <>
            {/* Filter Bar */}
            <div className="history-filter-bar">
              <div className="tw flex flex-col gap-4">
                {/* Search Input */}
                <div className="relative">
                  <SearchIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Search task name..."
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
                  <Field label="Category">
                    <Select value={categoryFilter || '__none__'} onValueChange={(v) => setCategoryFilter(v === '__none__' ? '' : v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">All Categories</SelectItem>
                        {categories.filter(c => c.active).map(cat => (
                          <SelectItem key={cat.id} value={String(cat.id)}>{cat.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field label="From" htmlFor="hist-from">
                    <Input id="hist-from" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </Field>

                  <Field label="To" htmlFor="hist-to">
                    <Input id="hist-to" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                  </Field>

                  <Field label="Status">
                    <Select value={statusFilter || '__none__'} onValueChange={(v) => setStatusFilter(v === '__none__' ? '' : v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">All Statuses</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
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
                  {(searchText || startDate || endDate || statusFilter || categoryFilter || limit !== 50) && (
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

            {/* Stats Summary */}
            {history.length > 0 && (
              <div className="history-stats">
                <div className="history-stat">
                  <span className="history-stat-value">{stats.total}</span>
                  <span className="history-stat-label">Total Records</span>
                </div>
                <div className="history-stat success">
                  <span className="history-stat-value">{stats.completed}</span>
                  <span className="history-stat-label">Completed</span>
                </div>
                <div className="history-stat muted">
                  <span className="history-stat-value">{stats.skipped}</span>
                  <span className="history-stat-label">Skipped</span>
                </div>
              </div>
            )}

            {/* History Table */}
            <div className="admin-v2-table-container">
              {loading ? (
                <div className="admin-v2-loading-container">
                  <div className="admin-v2-loading">Loading history...</div>
                </div>
              ) : error ? (
                <div className="admin-v2-error-container tw">
                  <Alert variant="destructive">{error}</Alert>
                  <Button variant="secondary" onClick={fetchHistory}>
                    Try Again
                  </Button>
                </div>
              ) : history.length === 0 ? (
                <div className="admin-v2-empty-container">
                  <TasksIcon size={48} className="admin-v2-empty-icon" />
                  <p>No care task history found</p>
                  {(searchText || startDate || endDate || statusFilter || categoryFilter) && (
                    <div className="tw">
                      <Button variant="secondary" onClick={handleClearFilters}>
                        Clear Filters
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <table className="admin-v2-table">
                  <thead>
                    <tr>
                      <th>Task Name</th>
                      <th>Category</th>
                      <th>Completed At</th>
                      <th>Scheduled For</th>
                      <th>Status</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((record) => {
                      const statusInfo = getStatusBadge(record.completion_status);
                      const categoryColor = record.task_category_color || '#6f42c1';
                      return (
                        <tr key={record.id}>
                          <td>
                            <div className="history-med-cell">
                              <span className="history-med-name">{record.task_name}</span>
                              {record.task_description && (
                                <span className="history-med-concentration">{record.task_description}</span>
                              )}
                            </div>
                          </td>
                          <td>
                            {record.task_category ? (
                              <span 
                                className="history-category-badge"
                                style={{ 
                                  backgroundColor: categoryColor + '30',
                                  color: categoryColor,
                                  padding: '4px 8px',
                                  borderRadius: '4px',
                                  fontSize: '0.8rem',
                                  fontWeight: 500
                                }}
                              >
                                {record.task_category}
                              </span>
                            ) : (
                              <span className="history-unscheduled">—</span>
                            )}
                          </td>
                          <td className="history-datetime">
                            {formatDateTime(record.completed_at)}
                          </td>
                          <td className="history-datetime">
                            {record.scheduled_time ? (
                              formatTime(record.scheduled_time)
                            ) : (
                              <span className="history-unscheduled">Manual</span>
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
              )}
            </div>
          </>
        ) : (
          <div className="admin-v2-placeholder-page">
            <TasksIcon size={64} />
            <h2>Select a Patient</h2>
            <p>Choose a patient to view their care task history.</p>
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

export default AdminV2CareTasksHistory;
