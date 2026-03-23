import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import config from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import {
  EquipmentIcon,
  SearchIcon,
  RefreshIcon,
  XIcon,
  ClockIcon
} from '../../components/Icons';
import './AdminV2.css';

const AdminV2EquipmentHistory = () => {
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

  // Check URL params for patient ID or use context patient
  useEffect(() => {
    const patientId = searchParams.get('patient');
    if (patientId && patients.length > 0) {
      const patient = patients.find(p => p.id === parseInt(patientId));
      if (patient && patient.id !== contextPatient?.id) {
        setContextPatient(patient);
      }
    }
  }, [searchParams, patients, loadingPatients]);

  // Update URL when context patient changes
  useEffect(() => {
    if (contextPatient && searchParams.get('patient') !== String(contextPatient.id)) {
      setSearchParams({ patient: contextPatient.id });
    }
  }, [contextPatient]);

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
            {/* Page Header */}
            <h1 className="schedule-section-title">Equipment Change History</h1>

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
          <div className="admin-v2-loading">Select a patient from the sidebar</div>
        )}
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2EquipmentHistory;
