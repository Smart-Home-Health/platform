import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import config from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import { XIcon, SearchIcon } from '../../components/Icons';
import RecordVitalsForm from '../../components/vitals/RecordVitalsForm';
import './AdminV2.css';

const AdminV2Vitals = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { selectedPatient: contextPatient } = useAdminPatient();

  const selectedPatient = contextPatient;
  const isHistoryView = location.pathname.includes('/history');

  const [vitalsHistory, setVitalsHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [filterType, setFilterType] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Custom-vital definitions are still needed here for the history filter
  // dropdown and the type-label/unit lookup. The form itself fetches its own
  // copy, but loading them here keeps the history filter populated even when
  // the record form has never been opened.
  const [customDefinitions, setCustomDefinitions] = useState([]);

  const builtInVitalTypes = [
    { value: 'blood_pressure', label: 'Blood Pressure', unit: 'mmHg' },
    { value: 'heart_rate', label: 'Heart Rate', unit: 'bpm' },
    { value: 'spo2', label: 'SpO2', unit: '%' },
    { value: 'temperature', label: 'Temperature', unit: '°F' },
    { value: 'respiratory_rate', label: 'Respiratory Rate', unit: '/min' },
    { value: 'weight', label: 'Weight', unit: 'lbs' },
  ];

  const allVitalTypes = useMemo(() => [
    ...builtInVitalTypes,
    ...customDefinitions.map(d => ({
      value: d.name,
      label: d.display_label,
      unit: d.unit || '',
      isCustom: true,
      definitionId: d.id,
    }))
  ], [customDefinitions]);

  // Fetch custom vital definitions when patient changes
  useEffect(() => {
    if (selectedPatient) {
      loadCustomDefinitions();
    } else {
      setCustomDefinitions([]);
    }
  }, [selectedPatient]);

  useEffect(() => {
    if (selectedPatient && isHistoryView) {
      loadVitalsHistory();
    }
  }, [selectedPatient, isHistoryView]);

  useEffect(() => {
    if (isHistoryView && selectedPatient) {
      loadVitalsHistory();
    }
  }, [filterType, filterDateFrom, filterDateTo, searchTerm]);

  const loadCustomDefinitions = async () => {
    if (!selectedPatient) return;
    try {
      const response = await fetch(
        `${config.apiUrl}/api/vitals/custom-definitions?patient_id=${selectedPatient.id}`,
        { credentials: 'include' }
      );
      if (response.ok) {
        const defs = await response.json();
        setCustomDefinitions(defs);
      }
    } catch (err) {
      console.error('Error loading custom vital definitions:', err);
    }
  };

  const loadVitalsHistory = async () => {
    if (!selectedPatient) return;
    setLoadingHistory(true);
    try {
      let url = `${config.apiUrl}/api/vitals/patient/${selectedPatient.id}?limit=100`;
      if (filterType) url += `&vital_type=${filterType}`;
      if (filterDateFrom) url += `&start_date=${filterDateFrom}`;
      if (filterDateTo) url += `&end_date=${filterDateTo}`;

      const response = await fetch(url, { credentials: 'include' });
      if (response.ok) {
        let data = await response.json();
        if (searchTerm) {
          const term = searchTerm.toLowerCase();
          data = data.filter(v =>
            getVitalTypeLabel(v.vital_type).toLowerCase().includes(term) ||
            (v.notes && v.notes.toLowerCase().includes(term))
          );
        }
        setVitalsHistory(data);
      }
    } catch (err) {
      console.error('Error loading vitals history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const getVitalTypeLabel = (type) => {
    const vitalType = allVitalTypes.find(v => v.value === type);
    return vitalType ? vitalType.label : type?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Unknown';
  };

  const getVitalTypeUnit = (type) => {
    const vitalType = allVitalTypes.find(v => v.value === type);
    return vitalType?.unit || '';
  };

  const formatVitalValue = (vital) => {
    if (vital.vital_type === 'blood_pressure') {
      if (vital.systolic && vital.diastolic) return `${vital.systolic}/${vital.diastolic}`;
      if (typeof vital.value === 'object' && vital.value) {
        return `${vital.value.systolic || '-'}/${vital.value.diastolic || '-'}`;
      }
    }
    return vital.value || '-';
  };

  const clearFilters = () => {
    setFilterType('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setSearchTerm('');
  };

  const renderRecordView = () => (
    <RecordVitalsForm
      patientId={selectedPatient?.id}
      onSaved={() => { loadCustomDefinitions(); }}
      allowCreateDefinitions={true}
    />
  );

  const renderHistoryView = () => (
    <div className="admin-v2-vitals-content">
      <div className="vitals-history-filters">
        <div className="vitals-filter-row">
          <div className="vitals-filter-group search">
            <label>Search</label>
            <div className="vitals-search-wrapper">
              <SearchIcon size={18} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search vitals..."
              />
            </div>
          </div>
          <div className="vitals-filter-group">
            <label>Type</label>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="">All Types</option>
              {allVitalTypes.map(vt => (<option key={vt.value} value={vt.value}>{vt.label}</option>))}
            </select>
          </div>
          <div className="vitals-filter-group">
            <label>From</label>
            <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} />
          </div>
          <div className="vitals-filter-group">
            <label>To</label>
            <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} />
          </div>
          <div className="vitals-filter-group actions">
            <button className="vitals-clear-btn" onClick={clearFilters}>Clear Filters</button>
          </div>
        </div>
      </div>
      <div className="admin-v2-table-container">
        {loadingHistory ? (
          <div className="admin-v2-loading">Loading history...</div>
        ) : vitalsHistory.length === 0 ? (
          <div className="admin-v2-empty-state"><p>No vitals found</p></div>
        ) : (
          <table className="admin-v2-table">
            <thead>
              <tr>
                <th>Date/Time</th>
                <th>Type</th>
                <th>Value</th>
                <th>Unit</th>
                <th>Notes</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {vitalsHistory.map((vital, idx) => (
                <tr key={vital.id || idx}>
                  <td>{vital.timestamp ? new Date(vital.timestamp).toLocaleString() : '-'}</td>
                  <td>{getVitalTypeLabel(vital.vital_type)}</td>
                  <td className="admin-v2-vital-value">{formatVitalValue(vital)}</td>
                  <td>{getVitalTypeUnit(vital.vital_type)}</td>
                  <td className="admin-v2-table-description">{vital.notes || '-'}</td>
                  <td><span className={`admin-v2-source-badge ${vital.source || 'manual'}`}>{vital.source || 'Manual'}</span></td>
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
        {!selectedPatient ? (
          <div className="admin-v2-empty-state"><p>Please select a patient from the sidebar</p></div>
        ) : (
          isHistoryView ? renderHistoryView() : renderRecordView()
        )}
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Vitals;
