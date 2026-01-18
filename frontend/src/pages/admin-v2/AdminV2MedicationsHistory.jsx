import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import config from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import {
  MedicationsIcon,
  ClockIcon,
  SearchIcon,
  RefreshIcon,
  XIcon,
  EditIcon
} from '../../components/Icons';
import './AdminV2.css';

const AdminV2MedicationsHistory = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Patient state
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [showPatientModal, setShowPatientModal] = useState(false);
  const [loadingPatients, setLoadingPatients] = useState(true);
  
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
  
  // Debounce search
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce the search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchText);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  // Fetch patients on mount
  useEffect(() => {
    fetchPatients();
  }, []);

  // Check for patient param and load patient
  useEffect(() => {
    const patientId = searchParams.get('patient');
    if (patientId && patients.length > 0) {
      const patient = patients.find(p => p.id === parseInt(patientId));
      if (patient) {
        setSelectedPatient(patient);
      } else {
        setShowPatientModal(true);
      }
    } else if (!patientId && patients.length > 0) {
      setShowPatientModal(true);
    }
  }, [patients, searchParams]);

  // Fetch history when patient or filters change
  useEffect(() => {
    if (selectedPatient) {
      fetchHistory();
    }
  }, [selectedPatient, debouncedSearch, startDate, endDate, statusFilter, limit]);

  const fetchPatients = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/patients`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setPatients(data);
      }
    } catch (err) {
      console.error('Error fetching patients:', err);
    } finally {
      setLoadingPatients(false);
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
    setSelectedPatient(patient);
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

  const getInitials = (firstName, lastName) => {
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
  };

  // Calculate stats
  const stats = {
    total: history.length,
    onTime: history.filter(h => h.status === 'on-time').length,
    late: history.filter(h => h.status === 'late').length,
    early: history.filter(h => h.status === 'early').length,
    skipped: history.filter(h => h.status === 'skipped').length
  };

  // Patient selector modal
  const renderPatientModal = () => (
    <div className="admin-v2-modal-overlay">
      <div className="admin-v2-modal admin-v2-modal-sm">
        <div className="admin-v2-modal-header">
          <h3>Select Patient</h3>
          {selectedPatient && (
            <button 
              className="admin-v2-modal-close"
              onClick={() => setShowPatientModal(false)}
            >
              <XIcon size={20} />
            </button>
          )}
        </div>
        <div className="admin-v2-modal-body">
          {loadingPatients ? (
            <div className="admin-v2-loading">Loading patients...</div>
          ) : patients.length === 0 ? (
            <div className="admin-v2-empty">No patients found</div>
          ) : (
            <div className="admin-v2-patient-list">
              {patients.map(patient => (
                <button
                  key={patient.id}
                  className={`admin-v2-patient-list-item ${selectedPatient?.id === patient.id ? 'selected' : ''}`}
                  onClick={() => handleSelectPatient(patient)}
                >
                  <div className="admin-v2-patient-list-avatar">
                    {patient.first_name?.[0]}{patient.last_name?.[0]}
                  </div>
                  <div className="admin-v2-patient-list-info">
                    <span className="name">{patient.first_name} {patient.last_name}</span>
                    {patient.date_of_birth && (
                      <span className="dob">DOB: {patient.date_of_birth}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        {selectedPatient ? (
          <>
            {/* Patient Context Header */}
            <div className="schedule-patient-header">
              <div className="schedule-patient-info">
                <div className="schedule-patient-avatar">
                  {getInitials(selectedPatient.first_name, selectedPatient.last_name)}
                </div>
                <div className="schedule-patient-name-row">
                  <h2>{selectedPatient.first_name} {selectedPatient.last_name}</h2>
                  <button 
                    className="schedule-edit-patient-btn"
                    onClick={handleChangePatient}
                    title="Change Patient"
                  >
                    <EditIcon size={16} />
                  </button>
                </div>
              </div>
            </div>

            {/* Section Title */}
            <h1 className="schedule-section-title">Medication History</h1>

            {/* Filter Bar */}
            <div className="history-filter-bar">
              <div className="history-filter-row">
              {/* Search Input */}
              <div className="history-filter-group history-filter-search">
                <div className="history-search-input-wrapper">
                  <SearchIcon size={16} className="history-search-icon" />
                  <input
                    type="text"
                    placeholder="Search medication name..."
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    className="history-search-input"
                  />
                  {searchText && (
                    <button 
                      className="history-search-clear"
                      onClick={() => setSearchText('')}
                    >
                      <XIcon size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Date Range */}
              <div className="history-filter-group">
                <label>From</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="history-filter-input"
                />
              </div>

              <div className="history-filter-group">
                <label>To</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="history-filter-input"
                />
              </div>

              {/* Status Filter */}
              <div className="history-filter-group">
                <label>Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="history-filter-input"
                >
                  <option value="">All Statuses</option>
                  <option value="on-time">On Time</option>
                  <option value="early">Early</option>
                  <option value="late">Late</option>
                  <option value="skipped">Skipped</option>
                </select>
              </div>

              {/* Limit */}
              <div className="history-filter-group">
                <label>Show</label>
                <select
                  value={limit}
                  onChange={(e) => setLimit(parseInt(e.target.value))}
                  className="history-filter-input"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={250}>250</option>
                </select>
              </div>

              {/* Clear Filters */}
              {(searchText || startDate || endDate || statusFilter || limit !== 50) && (
                <button 
                  className="history-filter-clear"
                  onClick={handleClearFilters}
                >
                  Clear Filters
                </button>
              )}

              {/* Refresh Button */}
              <button 
                className="admin-v2-btn admin-v2-btn-secondary"
                onClick={fetchHistory}
                disabled={loading}
                style={{ marginLeft: 'auto' }}
              >
                <RefreshIcon size={16} />
                Refresh
              </button>
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

            {/* History Table */}
            <div className="admin-v2-table-container">
              {loading ? (
                <div className="admin-v2-loading-container">
                  <div className="admin-v2-loading">Loading history...</div>
                </div>
              ) : error ? (
                <div className="admin-v2-error-container">
                  <div className="admin-v2-error">{error}</div>
                  <button className="admin-v2-btn admin-v2-btn-secondary" onClick={fetchHistory}>
                    Try Again
                  </button>
                </div>
              ) : history.length === 0 ? (
                <div className="admin-v2-empty-container">
                  <MedicationsIcon size={48} className="admin-v2-empty-icon" />
                  <p>No medication history found</p>
                  {(searchText || startDate || endDate || statusFilter) && (
                    <button 
                      className="admin-v2-btn admin-v2-btn-secondary"
                      onClick={handleClearFilters}
                    >
                      Clear Filters
                    </button>
                  )}
                </div>
              ) : (
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
                            formatTime(record.scheduled_time)
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
            )}
          </div>
          </>
        ) : (
          <div className="admin-v2-placeholder-page">
            <MedicationsIcon size={64} />
            <h2>Select a Patient</h2>
            <p>Choose a patient to view their medication history.</p>
          </div>
        )}

        {/* Patient Modal */}
        {showPatientModal && renderPatientModal()}
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2MedicationsHistory;
