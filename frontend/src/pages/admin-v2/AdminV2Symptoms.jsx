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
import { useLocation } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import config from '../../config';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import {
  EditIcon,
  TrashIcon,
  XIcon,
  CheckIcon,
  SearchIcon
} from '../../components/Icons';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Field, FormRow } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import './AdminV2.css';

// Severity color mapping
const getSeverityColor = (severity) => {
  if (!severity) return 'var(--muted-foreground)';
  if (severity <= 3) return '#3fb950';  // Green - mild
  if (severity <= 6) return '#d29922';  // Yellow - moderate
  if (severity <= 8) return '#db6d28';  // Orange - significant
  return '#f85149';  // Red - severe
};

// Format symptom type for display
const formatSymptomType = (type) => {
  if (!type) return '';
  return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

// Format body location for display
const formatLocation = (location) => {
  if (!location) return '';
  return location.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

const AdminV2Symptoms = () => {
  const location = useLocation();
  const { selectedPatient: contextPatient } = useAdminPatient();

  const selectedPatient = contextPatient;

  // Helper to get local datetime string for datetime-local input
  const getLocalDateTimeString = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const local = new Date(now.getTime() - offset * 60 * 1000);
    return local.toISOString().slice(0, 16);
  };

  // Determine active view based on URL
  const isHistoryView = location.pathname.includes('/history');
  const isActiveView = location.pathname.includes('/active');

  // Symptoms state
  const [symptoms, setSymptoms] = useState([]);
  const [symptomTypes, setSymptomTypes] = useState([]);
  const [bodyLocations, setBodyLocations] = useState([]);
  const [loadingSymptoms, setLoadingSymptoms] = useState(false);

  // History/filtering state
  const [historySymptoms, setHistorySymptoms] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'active', 'resolved'
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Modal states
  const [showSymptomModal, setShowSymptomModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedSymptom, setSelectedSymptom] = useState(null);
  const [editingSymptom, setEditingSymptom] = useState(null);

  // Symptom form state
  const [symptomFormData, setSymptomFormData] = useState({
    symptom_type: '',
    severity: 5,
    location: '',
    duration: '',
    description: '',
    notes: '',
    timestamp: getLocalDateTimeString()
  });

  // Form states
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Load symptom types and locations on mount
  useEffect(() => {
    loadSymptomTypes();
    loadBodyLocations();
  }, []);

  // Load symptoms when patient changes
  useEffect(() => {
    if (selectedPatient) {
      if (isHistoryView) {
        loadHistorySymptoms();
      } else if (isActiveView) {
        loadSymptoms();
      }
    }
  }, [selectedPatient, isHistoryView, isActiveView]);

  const loadSymptomTypes = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/symptoms/types`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setSymptomTypes(data);
      }
    } catch (err) {
      console.error('Error loading symptom types:', err);
    }
  };

  const loadBodyLocations = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/symptoms/locations`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setBodyLocations(data);
      }
    } catch (err) {
      console.error('Error loading body locations:', err);
    }
  };

  const loadSymptoms = async () => {
    if (!selectedPatient) return;

    setLoadingSymptoms(true);
    try {
      const response = await fetch(
        `${config.apiUrl}/api/symptoms/patient/${selectedPatient.id}?limit=20&resolved=false`,
        { credentials: 'include' }
      );
      if (response.ok) {
        const data = await response.json();
        setSymptoms(data);
      }
    } catch (err) {
      console.error('Error loading symptoms:', err);
    } finally {
      setLoadingSymptoms(false);
    }
  };

  const loadHistorySymptoms = async () => {
    if (!selectedPatient) return;

    setLoadingHistory(true);
    try {
      let url = `${config.apiUrl}/api/symptoms/patient/${selectedPatient.id}?limit=100`;

      if (filterStatus === 'active') {
        url += '&resolved=false';
      } else if (filterStatus === 'resolved') {
        url += '&resolved=true';
      }

      if (filterType) {
        url += `&symptom_type=${filterType}`;
      }

      const response = await fetch(url, { credentials: 'include' });
      if (response.ok) {
        let data = await response.json();

        // Client-side date filtering
        if (filterDateFrom) {
          const fromDate = new Date(filterDateFrom);
          data = data.filter(s => new Date(s.timestamp) >= fromDate);
        }
        if (filterDateTo) {
          const toDate = new Date(filterDateTo);
          toDate.setHours(23, 59, 59);
          data = data.filter(s => new Date(s.timestamp) <= toDate);
        }

        // Client-side search
        if (searchTerm) {
          const term = searchTerm.toLowerCase();
          data = data.filter(s =>
            formatSymptomType(s.symptom_type).toLowerCase().includes(term) ||
            (s.description && s.description.toLowerCase().includes(term)) ||
            (s.notes && s.notes.toLowerCase().includes(term)) ||
            (s.location && formatLocation(s.location).toLowerCase().includes(term))
          );
        }

        setHistorySymptoms(data);
      }
    } catch (err) {
      console.error('Error loading symptom history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Reload history when filters change
  useEffect(() => {
    if (isHistoryView && selectedPatient) {
      loadHistorySymptoms();
    }
  }, [filterType, filterStatus, filterDateFrom, filterDateTo, searchTerm]);

  const handleSymptomSubmit = async (e) => {
    e.preventDefault();
    if (!selectedPatient) {
      setError('Please select a patient first');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = {
        symptom_type: symptomFormData.symptom_type,
        patient_id: selectedPatient.id,
        severity: parseInt(symptomFormData.severity),
        location: symptomFormData.location || null,
        duration: symptomFormData.duration || null,
        description: symptomFormData.description || null,
        notes: symptomFormData.notes || null,
        timestamp: symptomFormData.timestamp
      };

      const url = editingSymptom
        ? `${config.apiUrl}/api/symptoms/${editingSymptom.id}`
        : `${config.apiUrl}/api/symptoms`;

      const response = await fetch(url, {
        method: editingSymptom ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        setSuccess(editingSymptom ? 'Symptom updated!' : 'Symptom logged!');
        setShowSymptomModal(false);
        setEditingSymptom(null);
        resetSymptomForm();
        if (isHistoryView) {
          loadHistorySymptoms();
        } else {
          loadSymptoms();
        }
        setTimeout(() => setSuccess(null), 3000);
      } else {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to save symptom');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleResolveSymptom = async (symptomId) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/symptoms/${symptomId}/resolve`, {
        method: 'POST',
        credentials: 'include'
      });

      if (response.ok) {
        if (isHistoryView) {
          loadHistorySymptoms();
        } else {
          loadSymptoms();
        }
        setSuccess('Symptom marked as resolved');
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch {
      setError('Failed to resolve symptom');
    }
  };

  const handleDeleteSymptom = async () => {
    if (!selectedSymptom) return;

    try {
      const response = await fetch(`${config.apiUrl}/api/symptoms/${selectedSymptom.id}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (response.ok) {
        if (isHistoryView) {
          loadHistorySymptoms();
        } else {
          loadSymptoms();
        }
        setShowDeleteModal(false);
        setSelectedSymptom(null);
        setSuccess('Symptom deleted');
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch {
      setError('Failed to delete symptom');
    }
  };

  const openEditSymptom = (symptom) => {
    setEditingSymptom(symptom);
    setSymptomFormData({
      symptom_type: symptom.symptom_type,
      severity: symptom.severity || 5,
      location: symptom.location || '',
      duration: symptom.duration || '',
      description: symptom.description || '',
      notes: symptom.notes || '',
      timestamp: symptom.timestamp ? symptom.timestamp.slice(0, 16) : getLocalDateTimeString()
    });
    setShowSymptomModal(true);
  };

  const resetSymptomForm = () => {
    setSymptomFormData({
      symptom_type: '',
      severity: 5,
      location: '',
      duration: '',
      description: '',
      notes: '',
      timestamp: getLocalDateTimeString()
    });
  };

  const clearFilters = () => {
    setFilterType('');
    setFilterStatus('all');
    setFilterDateFrom('');
    setFilterDateTo('');
    setSearchTerm('');
  };

  const hasActiveFilters = !!(filterType || filterStatus !== 'all' || filterDateFrom || filterDateTo || searchTerm);

  // The severity slider keeps its dedicated chrome classes
  // (.symptom-severity-slider styles the range track/thumb itself, so it
  // survives inside .tw where bare element rules are scoped out).
  const renderSeveritySlider = () => (
    <div className="symptom-severity-slider">
      <input
        type="range"
        min="1"
        max="10"
        value={symptomFormData.severity}
        onChange={(e) => setSymptomFormData(prev => ({ ...prev, severity: e.target.value }))}
        style={{
          '--severity-color': getSeverityColor(symptomFormData.severity),
          '--severity-percent': `${(symptomFormData.severity - 1) / 9 * 100}%`
        }}
      />
      <div className="severity-labels">
        <span>Mild</span>
        <span>Severe</span>
      </div>
    </div>
  );

  const severityLabel = (
    <span className="flex w-full items-center justify-between">
      <span>Severity</span>
      <span className="font-semibold" style={{ color: getSeverityColor(symptomFormData.severity) }}>
        {symptomFormData.severity}/10
      </span>
    </span>
  );

  // Render log symptom view
  const renderLogView = () => (
    <div className="admin-v2-vitals-content">
      {/* Log Form */}
      <div className="admin-v2-settings-card">
        <form onSubmit={handleSymptomSubmit} className="tw">
          <div className="flex flex-col gap-4">
            <FormRow>
              <Field label="Symptom Type" required>
                <Select
                  value={symptomFormData.symptom_type || undefined}
                  onValueChange={(v) => setSymptomFormData(prev => ({ ...prev, symptom_type: v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Select symptom..." /></SelectTrigger>
                  <SelectContent>
                    {symptomTypes.map(type => (
                      <SelectItem key={type} value={type}>{formatSymptomType(type)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Date/Time" required>
                <Input
                  type="datetime-local"
                  value={symptomFormData.timestamp}
                  onChange={(e) => setSymptomFormData(prev => ({ ...prev, timestamp: e.target.value }))}
                  required
                />
              </Field>
            </FormRow>

            <FormRow>
              <Field label={severityLabel}>
                {renderSeveritySlider()}
              </Field>

              <Field label="Body Location">
                <Select
                  value={symptomFormData.location || '__none__'}
                  onValueChange={(v) => setSymptomFormData(prev => ({ ...prev, location: v === '__none__' ? '' : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Select location..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Not specified</SelectItem>
                    {bodyLocations.map(loc => (
                      <SelectItem key={loc} value={loc}>{formatLocation(loc)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </FormRow>

            <FormRow>
              <Field label="Duration">
                <Input
                  type="text"
                  value={symptomFormData.duration}
                  onChange={(e) => setSymptomFormData(prev => ({ ...prev, duration: e.target.value }))}
                  placeholder="e.g., 30 minutes"
                />
              </Field>
            </FormRow>

            <Field label="Description">
              <Textarea
                value={symptomFormData.description}
                onChange={(e) => setSymptomFormData(prev => ({ ...prev, description: e.target.value }))}
                rows={2}
                placeholder="Describe the symptom..."
              />
            </Field>

            <Field label="Notes (optional)">
              <Textarea
                value={symptomFormData.notes}
                onChange={(e) => setSymptomFormData(prev => ({ ...prev, notes: e.target.value }))}
                rows={2}
                placeholder="Any additional notes..."
              />
            </Field>

            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={saving || !selectedPatient || !symptomFormData.symptom_type}
              >
                {saving ? 'Saving...' : 'Log Symptom'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );

  // Render active symptoms view
  const renderActiveView = () => (
    <div className="admin-v2-vitals-content">
      <div className="admin-v2-symptoms-list">
        {loadingSymptoms ? (
          <div className="admin-v2-loading">Loading symptoms...</div>
        ) : symptoms.length === 0 ? (
          <div className="admin-v2-empty-state">
            <p>No active symptoms</p>
          </div>
        ) : (
          symptoms.map(symptom => (
            <div key={symptom.id} className="admin-v2-symptom-card">
              <div className="admin-v2-symptom-header">
                <div className="admin-v2-symptom-type">
                  <span
                    className="admin-v2-symptom-severity-badge"
                    style={{ backgroundColor: getSeverityColor(symptom.severity) }}
                  >
                    {symptom.severity || '?'}/10
                  </span>
                  <span className="admin-v2-symptom-name">
                    {formatSymptomType(symptom.symptom_type)}
                  </span>
                  {symptom.location && (
                    <span className="admin-v2-symptom-location">
                      — {formatLocation(symptom.location)}
                    </span>
                  )}
                </div>
                <div className="admin-v2-symptom-actions tw">
                  <Button
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleResolveSymptom(symptom.id)}
                    title="Mark as resolved"
                  >
                    <CheckIcon size={14} />
                  </Button>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => openEditSymptom(symptom)}
                    title="Edit"
                  >
                    <EditIcon size={14} />
                  </Button>
                  <Button
                    variant="destructive"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => {
                      setSelectedSymptom(symptom);
                      setShowDeleteModal(true);
                    }}
                    title="Delete"
                  >
                    <TrashIcon size={14} />
                  </Button>
                </div>
              </div>

              <div className="admin-v2-symptom-meta">
                <span className="admin-v2-symptom-time">
                  {symptom.timestamp ? new Date(symptom.timestamp).toLocaleString() : 'Unknown time'}
                </span>
                {symptom.duration && (
                  <span className="admin-v2-symptom-duration">Duration: {symptom.duration}</span>
                )}
              </div>

              {symptom.description && (
                <p className="admin-v2-symptom-description">{symptom.description}</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );

  // Render history view with table
  const renderHistoryView = () => (
    <div className="admin-v2-vitals-content">
      {/* Filters */}
      <div className="vitals-history-filters">
        <div className="tw flex flex-col gap-4">
          {/* Search Input */}
          <div className="relative">
            <SearchIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search symptoms..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-9"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground"
              >
                <XIcon size={14} />
              </button>
            )}
          </div>

          {/* Filters grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Type">
              <Select value={filterType || '__all__'} onValueChange={(v) => setFilterType(v === '__all__' ? '' : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Types</SelectItem>
                  {symptomTypes.map(type => (
                    <SelectItem key={type} value={type}>{formatSymptomType(type)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Status">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field label="From" htmlFor="symptoms-hist-from">
              <Input
                id="symptoms-hist-from"
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
              />
            </Field>

            <Field label="To" htmlFor="symptoms-hist-to">
              <Input
                id="symptoms-hist-to"
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
              />
            </Field>
          </div>

          {/* Actions */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={clearFilters}>
                Clear Filters
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* History Table */}
      <div className="admin-v2-table-container">
        {loadingHistory ? (
          <div className="admin-v2-loading">Loading history...</div>
        ) : historySymptoms.length === 0 ? (
          <div className="admin-v2-empty-state">
            <p>No symptoms found</p>
          </div>
        ) : (
          <table className="admin-v2-table">
            <thead>
              <tr>
                <th>Date/Time</th>
                <th>Type</th>
                <th>Severity</th>
                <th>Location</th>
                <th>Duration</th>
                <th>Status</th>
                <th>Description</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {historySymptoms.map(symptom => (
                <tr key={symptom.id} className={symptom.is_resolved ? 'resolved-row' : ''}>
                  <td>{symptom.timestamp ? new Date(symptom.timestamp).toLocaleString() : '-'}</td>
                  <td>{formatSymptomType(symptom.symptom_type)}</td>
                  <td>
                    <span
                      className="admin-v2-symptom-severity-badge"
                      style={{ backgroundColor: getSeverityColor(symptom.severity) }}
                    >
                      {symptom.severity || '?'}/10
                    </span>
                  </td>
                  <td>{symptom.location ? formatLocation(symptom.location) : '-'}</td>
                  <td>{symptom.duration || '-'}</td>
                  <td>
                    <span className={`admin-v2-status-badge ${symptom.is_resolved ? 'resolved' : 'active'}`}>
                      {symptom.is_resolved ? 'Resolved' : 'Active'}
                    </span>
                  </td>
                  <td className="admin-v2-table-description">
                    {symptom.description || '-'}
                  </td>
                  <td>
                    <div className="admin-v2-table-actions">
                      {!symptom.is_resolved && (
                        <button
                          className="admin-v2-btn admin-v2-btn-sm admin-v2-btn-success"
                          onClick={() => handleResolveSymptom(symptom.id)}
                          title="Resolve"
                        >
                          <CheckIcon size={14} />
                        </button>
                      )}
                      <button
                        className="admin-v2-btn admin-v2-btn-sm admin-v2-btn-secondary"
                        onClick={() => openEditSymptom(symptom)}
                        title="Edit"
                      >
                        <EditIcon size={14} />
                      </button>
                      <button
                        className="admin-v2-btn admin-v2-btn-sm admin-v2-btn-danger"
                        onClick={() => {
                          setSelectedSymptom(symptom);
                          setShowDeleteModal(true);
                        }}
                        title="Delete"
                      >
                        <TrashIcon size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        {/* Alerts */}
        {error && (
          <div className="tw" style={{ marginBottom: '1rem' }}>
            <Alert variant="destructive" className="flex items-center justify-between gap-2">
              {error}
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => setError(null)}
                aria-label="Dismiss"
              >
                <XIcon size={14} />
              </Button>
            </Alert>
          </div>
        )}
        {success && (
          <div className="tw" style={{ marginBottom: '1rem' }}>
            <Alert variant="success">{success}</Alert>
          </div>
        )}

        {!selectedPatient ? (
          <div className="admin-v2-empty-state">
            <p>Please select a patient from the sidebar</p>
          </div>
        ) : (
          isHistoryView ? renderHistoryView() : isActiveView ? renderActiveView() : renderLogView()
        )}

        {/* Edit Symptom Dialog */}
        <Dialog open={showSymptomModal} onOpenChange={(o) => { if (!o) setShowSymptomModal(false); }}>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[560px]" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Edit Symptom</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSymptomSubmit} className="flex flex-col gap-4">
              <Field label="Symptom Type" required>
                <Select
                  value={symptomFormData.symptom_type || undefined}
                  onValueChange={(v) => setSymptomFormData(prev => ({ ...prev, symptom_type: v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Select symptom..." /></SelectTrigger>
                  <SelectContent>
                    {symptomTypes.map(type => (
                      <SelectItem key={type} value={type}>{formatSymptomType(type)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <FormRow>
                <Field label={severityLabel}>
                  {renderSeveritySlider()}
                </Field>

                <Field label="Body Location">
                  <Select
                    value={symptomFormData.location || '__none__'}
                    onValueChange={(v) => setSymptomFormData(prev => ({ ...prev, location: v === '__none__' ? '' : v }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Select location..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Not specified</SelectItem>
                      {bodyLocations.map(loc => (
                        <SelectItem key={loc} value={loc}>{formatLocation(loc)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </FormRow>

              <FormRow>
                <Field label="Duration">
                  <Input
                    type="text"
                    value={symptomFormData.duration}
                    onChange={(e) => setSymptomFormData(prev => ({ ...prev, duration: e.target.value }))}
                    placeholder="e.g., 30 minutes, 2 hours"
                  />
                </Field>

                <Field label="Date/Time" required>
                  <Input
                    type="datetime-local"
                    value={symptomFormData.timestamp}
                    onChange={(e) => setSymptomFormData(prev => ({ ...prev, timestamp: e.target.value }))}
                    required
                  />
                </Field>
              </FormRow>

              <Field label="Description">
                <Textarea
                  value={symptomFormData.description}
                  onChange={(e) => setSymptomFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  placeholder="Describe the symptom..."
                />
              </Field>

              <Field label="Notes">
                <Textarea
                  value={symptomFormData.notes}
                  onChange={(e) => setSymptomFormData(prev => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                  placeholder="Any additional notes..."
                />
              </Field>

              <DialogFooter>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowSymptomModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={saving || !symptomFormData.symptom_type}
                >
                  {saving ? 'Saving...' : 'Update Symptom'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={showDeleteModal && !!selectedSymptom} onOpenChange={(o) => { if (!o) setShowDeleteModal(false); }}>
          <DialogContent className="sm:max-w-[420px]">
            <DialogHeader>
              <DialogTitle>Delete Symptom</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this symptom record?
              </DialogDescription>
            </DialogHeader>
            {selectedSymptom && (
              <p className="text-sm">
                <strong>{formatSymptomType(selectedSymptom.symptom_type)}</strong>
                {selectedSymptom.timestamp && (
                  <span> — {new Date(selectedSymptom.timestamp).toLocaleString()}</span>
                )}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowDeleteModal(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDeleteSymptom}
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Symptoms;
