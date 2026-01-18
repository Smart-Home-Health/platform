import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import config from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import {
  EquipmentIcon,
  SearchIcon,
  RefreshIcon,
  XIcon,
  ClockIcon,
  EditIcon
} from '../../components/Icons';
import './AdminV2.css';

const AdminV2EquipmentHistory = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Patient state
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [showPatientModal, setShowPatientModal] = useState(false);
  const [loadingPatients, setLoadingPatients] = useState(true);
  
  // Equipment list for filter dropdown
  const [equipment, setEquipment] = useState([]);
  
  // History data state
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Filter state
  const [equipmentFilter, setEquipmentFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [limit, setLimit] = useState(50);

  // Fetch patients on mount
  useEffect(() => {
    fetchPatients();
  }, []);

  // Check URL params for patient ID
  useEffect(() => {
    const patientId = searchParams.get('patient');
    if (patientId && patients.length > 0) {
      const patient = patients.find(p => p.id === parseInt(patientId));
      if (patient) {
        setSelectedPatient(patient);
      } else if (!selectedPatient) {
        setShowPatientModal(true);
      }
    } else if (!patientId && patients.length > 0 && !selectedPatient) {
      setShowPatientModal(true);
    }
  }, [searchParams, patients]);

  // Fetch equipment and history when patient is selected
  useEffect(() => {
    if (selectedPatient) {
      fetchEquipment();
    }
  }, [selectedPatient]);

  // Fetch history when filters change
  useEffect(() => {
    if (selectedPatient) {
      fetchHistory();
    }
  }, [selectedPatient, equipmentFilter, startDate, endDate, limit]);

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

  const fetchEquipment = async () => {
    if (!selectedPatient) return;
    
    try {
      const response = await fetch(`${config.apiUrl}/api/equipment?patient_id=${selectedPatient.id}`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setEquipment(data);
      }
    } catch (err) {
      console.error('Error fetching equipment:', err);
    }
  };

  const fetchHistory = async () => {
    if (!selectedPatient) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams();
      params.append('limit', limit.toString());
      params.append('patient_id', selectedPatient.id.toString());
      
      if (equipmentFilter) {
        params.append('equipment_id', equipmentFilter);
      }
      if (startDate) {
        params.append('start_date', startDate);
      }
      if (endDate) {
        params.append('end_date', endDate);
      }
      
      const response = await fetch(
        `${config.apiUrl}/api/equipment/history?${params.toString()}`,
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
    // Reset filters when patient changes
    setEquipmentFilter('');
    setHistory([]);
  };

  const handleChangePatient = () => {
    setShowPatientModal(true);
  };

  const getInitials = (firstName, lastName) => {
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
  };

  const handleClearFilters = () => {
    setEquipmentFilter('');
    setStartDate('');
    setEndDate('');
    setLimit(50);
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString();
  };

  // Group history by day
  const groupHistoryByDay = (historyItems) => {
    const groups = {};
    
    historyItems.forEach(item => {
      const dateObj = new Date(item.changed_at);
      const dayKey = dateObj.toLocaleDateString(undefined, { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      
      if (!groups[dayKey]) groups[dayKey] = [];
      groups[dayKey].push(item);
    });
    
    return groups;
  };

  const groupedHistory = groupHistoryByDay(history);
  const sortedDays = Object.keys(groupedHistory).sort((a, b) => new Date(b) - new Date(a));

  const hasActiveFilters = equipmentFilter || startDate || endDate || limit !== 50;

  // Loading state
  if (loadingPatients) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-loading">Loading patients...</div>
      </AdminV2Layout>
    );
  }

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

            {/* Page Header */}
            <div className="admin-v2-page-header">
              <div>
                <h1>Equipment Change History</h1>
                <p className="admin-v2-page-subtitle">View all equipment changes and replacements</p>
              </div>
              <button
                className="admin-v2-btn admin-v2-btn-primary"
                onClick={fetchHistory}
                disabled={loading}
              >
                <RefreshIcon size={16} /> {loading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>

            {/* Filter Bar */}
            <div className="history-filter-bar">
              <div className="history-filter-row">
                {/* Equipment Filter */}
                <div className="history-filter-group">
                  <label>Equipment</label>
                  <select
                    value={equipmentFilter}
                    onChange={e => setEquipmentFilter(e.target.value)}
                    className="history-filter-select"
                  >
                    <option value="">All Equipment</option>
                    {equipment.map(equip => (
                      <option key={equip.id} value={equip.id}>{equip.name}</option>
                    ))}
                  </select>
                </div>

                {/* Start Date */}
                <div className="history-filter-group">
                  <label>From</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="history-filter-input"
                  />
                </div>

                {/* End Date */}
                <div className="history-filter-group">
                  <label>To</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="history-filter-input"
                  />
                </div>

                {/* Limit */}
                <div className="history-filter-group">
                  <label>Show</label>
                  <select
                    value={limit}
                    onChange={e => setLimit(parseInt(e.target.value))}
                    className="history-filter-select"
                  >
                    <option value={25}>25 records</option>
                    <option value={50}>50 records</option>
                    <option value={100}>100 records</option>
                    <option value={200}>200 records</option>
                  </select>
                </div>

                {/* Clear Filters */}
                {hasActiveFilters && (
                  <button
                    className="admin-v2-btn admin-v2-btn-sm"
                    onClick={handleClearFilters}
                    title="Clear all filters"
                  >
                    <XIcon size={14} /> Clear
                  </button>
                )}
              </div>
            </div>

            {/* Results Count */}
            <div className="admin-v2-results-count">
              Showing {history.length} record{history.length !== 1 ? 's' : ''}
            </div>

            {/* History Content */}
            {loading ? (
              <div className="admin-v2-loading">Loading history...</div>
            ) : error ? (
              <div className="admin-v2-error">{error}</div>
            ) : history.length === 0 ? (
              <div className="admin-v2-empty-state">
                <ClockIcon size={48} />
                <h3>No History Found</h3>
                <p className="admin-v2-text-muted">
                  {hasActiveFilters 
                    ? 'No records match the selected filters'
                    : 'No equipment changes have been recorded yet'}
                </p>
                {hasActiveFilters && (
                  <button className="admin-v2-btn admin-v2-btn-primary" onClick={handleClearFilters}>
                    Clear Filters
                  </button>
                )}
              </div>
            ) : (
              <div className="admin-v2-history-list">
                {sortedDays.map(dayKey => (
                  <div key={dayKey} className="admin-v2-history-day">
                    <div className="admin-v2-history-day-header">
                      <h3>{dayKey}</h3>
                      <span className="admin-v2-history-day-count">
                        {groupedHistory[dayKey].length} change{groupedHistory[dayKey].length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    
                    <div className="admin-v2-history-items">
                      {groupedHistory[dayKey].map((item, idx) => (
                        <div key={item.id || idx} className="admin-v2-history-item">
                          <div className="admin-v2-history-item-icon">
                            <EquipmentIcon size={20} />
                          </div>
                          <div className="admin-v2-history-item-content">
                            <div className="admin-v2-history-item-main">
                              <span className="admin-v2-history-item-name">
                                {item.equipment_name}
                              </span>
                              <span className="admin-v2-history-item-action">
                                Changed
                              </span>
                            </div>
                            <div className="admin-v2-history-item-meta">
                              <span className="admin-v2-history-item-time">
                                {new Date(item.changed_at).toLocaleTimeString(undefined, {
                                  hour: 'numeric',
                                  minute: '2-digit',
                                  hour12: true
                                })}
                              </span>
                              {item.notes && (
                                <span className="admin-v2-history-item-notes">
                                  {item.notes}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="admin-v2-no-patient">
            <EquipmentIcon size={48} />
            <h2>Select a Patient</h2>
            <p>Choose a patient to view their equipment change history</p>
            <button 
              className="admin-v2-btn admin-v2-btn-primary"
              onClick={() => setShowPatientModal(true)}
            >
              Select Patient
            </button>
          </div>
        )}

        {/* Patient Selector Modal */}
        {showPatientModal && (
          <div className="admin-v2-modal-overlay" onClick={() => selectedPatient && setShowPatientModal(false)}>
            <div className="admin-v2-modal" onClick={e => e.stopPropagation()}>
              <div className="admin-v2-modal-header">
                <h2>Select Patient</h2>
                {selectedPatient && (
                  <button className="admin-v2-modal-close" onClick={() => setShowPatientModal(false)}>
                    <XIcon size={20} />
                  </button>
                )}
              </div>
              <div className="admin-v2-modal-body">
                <div className="admin-v2-patient-selector-list">
                  {patients.filter(p => p.is_active).map(patient => (
                    <button
                      key={patient.id}
                      className={`admin-v2-patient-selector-item ${selectedPatient?.id === patient.id ? 'selected' : ''}`}
                      onClick={() => handleSelectPatient(patient)}
                    >
                      <div className="admin-v2-patient-avatar">
                        {getInitials(patient.first_name, patient.last_name)}
                      </div>
                      <div className="admin-v2-patient-selector-info">
                        <span className="admin-v2-patient-name">
                          {patient.first_name} {patient.last_name}
                        </span>
                        <span className="admin-v2-patient-meta">
                          {patient.room || 'No room assigned'}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2EquipmentHistory;
