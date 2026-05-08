import React, { useState, useEffect } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import config from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import {
  PlusIcon,
  EditIcon,
  TrashIcon,
  XIcon,
  CheckIcon,
  SearchIcon
} from '../../components/Icons';
import './AdminV2.css';

// Severity color mapping
const getSeverityColor = (severity) => {
  if (!severity) return '#8b949e';
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
  const { user } = useAuth();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { 
    patients, 
    selectedPatient: contextPatient, 
    selectPatient: setContextPatient,
    loadingPatients 
  } = useAdminPatient();
  
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
  const isLogView = !isHistoryView && !isActiveView;
  
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
    } catch (err) {
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
    } catch (err) {
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

  // Render log symptom view
  const renderLogView = () => (
    <div className="admin-v2-vitals-content">
      {/* Log Form */}
      <div className="admin-v2-settings-card">
        <form onSubmit={handleSymptomSubmit}>
          {/* Date/Time Header */}
          <div className="vitals-form-header">
            <div className="vitals-datetime-field">
              <label>Date/Time</label>
              <input
                type="datetime-local"
                value={symptomFormData.timestamp}
                onChange={(e) => setSymptomFormData(prev => ({ ...prev, timestamp: e.target.value }))}
                required
              />
            </div>
          </div>
          
          {/* Symptom Input Cards */}
          <div className="symptoms-input-grid">
            {/* Symptom Type Card */}
            <div className="vital-input-card">
              <div className="vital-input-header">
                <span className="vital-input-title">Symptom Type *</span>
              </div>
              <div className="symptom-select-wrapper">
                <select
                  value={symptomFormData.symptom_type}
                  onChange={(e) => setSymptomFormData(prev => ({ ...prev, symptom_type: e.target.value }))}
                  required
                >
                  <option value="">Select symptom...</option>
                  {symptomTypes.map(type => (
                    <option key={type} value={type}>{formatSymptomType(type)}</option>
                  ))}
                </select>
              </div>
            </div>
            
            {/* Severity Card */}
            <div className="vital-input-card">
              <div className="vital-input-header">
                <span className="vital-input-title">Severity</span>
                <span 
                  className="symptom-severity-display"
                  style={{ color: getSeverityColor(symptomFormData.severity) }}
                >
                  {symptomFormData.severity}/10
                </span>
              </div>
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
            </div>
            
            {/* Body Location Card */}
            <div className="vital-input-card">
              <div className="vital-input-header">
                <span className="vital-input-title">Body Location</span>
              </div>
              <div className="symptom-select-wrapper">
                <select
                  value={symptomFormData.location}
                  onChange={(e) => setSymptomFormData(prev => ({ ...prev, location: e.target.value }))}
                >
                  <option value="">Select location...</option>
                  {bodyLocations.map(loc => (
                    <option key={loc} value={loc}>{formatLocation(loc)}</option>
                  ))}
                </select>
              </div>
            </div>
            
            {/* Duration Card */}
            <div className="vital-input-card">
              <div className="vital-input-header">
                <span className="vital-input-title">Duration</span>
              </div>
              <div className="vital-input-fields single-field">
                <input
                  type="text"
                  value={symptomFormData.duration}
                  onChange={(e) => setSymptomFormData(prev => ({ ...prev, duration: e.target.value }))}
                  className="vital-input"
                  placeholder="e.g., 30 minutes"
                />
              </div>
            </div>
          </div>
          
          {/* Description */}
          <div className="vitals-notes-section">
            <label>Description</label>
            <textarea
              value={symptomFormData.description}
              onChange={(e) => setSymptomFormData(prev => ({ ...prev, description: e.target.value }))}
              rows={2}
              placeholder="Describe the symptom..."
            />
          </div>
          
          {/* Notes */}
          <div className="vitals-notes-section">
            <label>Notes (optional)</label>
            <textarea
              value={symptomFormData.notes}
              onChange={(e) => setSymptomFormData(prev => ({ ...prev, notes: e.target.value }))}
              rows={2}
              placeholder="Any additional notes..."
            />
          </div>
          
          {/* Submit */}
          <div className="vitals-form-actions">
            <button 
              type="submit"
              disabled={saving || !selectedPatient}
              className="admin-v2-btn admin-v2-btn-primary vitals-submit-btn"
            >
              {saving ? 'Saving...' : 'Log Symptom'}
            </button>
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
                <div className="admin-v2-symptom-actions">
                  <button 
                    className="admin-v2-btn admin-v2-btn-sm admin-v2-btn-success"
                    onClick={() => handleResolveSymptom(symptom.id)}
                    title="Mark as resolved"
                  >
                    <CheckIcon size={14} />
                  </button>
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
        <div className="vitals-filter-row">
          <div className="vitals-filter-group search">
            <label>Search</label>
            <div className="vitals-search-wrapper">
              <SearchIcon size={18} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search symptoms..."
              />
            </div>
          </div>
          
          <div className="vitals-filter-group">
            <label>Type</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="">All Types</option>
              {symptomTypes.map(type => (
                <option key={type} value={type}>{formatSymptomType(type)}</option>
              ))}
            </select>
          </div>
          
          <div className="vitals-filter-group">
            <label>Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
          
          <div className="vitals-filter-group">
            <label>From</label>
            <input
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
            />
          </div>
          
          <div className="vitals-filter-group">
            <label>To</label>
            <input
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
            />
          </div>
          
          <div className="vitals-filter-group actions">
            <button 
              className="vitals-clear-btn"
              onClick={clearFilters}
            >
              Clear Filters
            </button>
          </div>
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
          <div className="admin-v2-alert admin-v2-alert-error">
            {error}
            <button onClick={() => setError(null)} className="admin-v2-alert-close">
              <XIcon size={16} />
            </button>
          </div>
        )}
        {success && (
          <div className="admin-v2-alert admin-v2-alert-success">
            {success}
          </div>
        )}

        {!selectedPatient ? (
          <div className="admin-v2-empty-state">
            <p>Please select a patient from the sidebar</p>
          </div>
        ) : (
          isHistoryView ? renderHistoryView() : isActiveView ? renderActiveView() : renderLogView()
        )}

        {/* Edit Symptom Modal */}
        {showSymptomModal && (
          <div className="admin-v2-modal-overlay" onClick={() => setShowSymptomModal(false)}>
            <div className="admin-v2-modal" onClick={e => e.stopPropagation()}>
              <div className="admin-v2-modal-header">
                <h2>Edit Symptom</h2>
                <button 
                  className="admin-v2-modal-close"
                  onClick={() => setShowSymptomModal(false)}
                >
                  <XIcon size={20} />
                </button>
              </div>
              
              <form onSubmit={handleSymptomSubmit}>
                <div className="admin-v2-modal-body">
                  <div className="admin-v2-form-group">
                    <label>Symptom Type *</label>
                    <select
                      value={symptomFormData.symptom_type}
                      onChange={(e) => setSymptomFormData(prev => ({ ...prev, symptom_type: e.target.value }))}
                      className="admin-v2-input"
                      required
                    >
                      <option value="">Select symptom...</option>
                      {symptomTypes.map(type => (
                        <option key={type} value={type}>{formatSymptomType(type)}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="admin-v2-form-row">
                    <div className="admin-v2-form-group">
                      <label>Severity (1-10)</label>
                      <div className="admin-v2-severity-slider">
                        <input
                          type="range"
                          min="1"
                          max="10"
                          value={symptomFormData.severity}
                          onChange={(e) => setSymptomFormData(prev => ({ ...prev, severity: e.target.value }))}
                          className="admin-v2-range"
                        />
                        <span 
                          className="admin-v2-severity-value"
                          style={{ color: getSeverityColor(symptomFormData.severity) }}
                        >
                          {symptomFormData.severity}
                        </span>
                      </div>
                    </div>
                    
                    <div className="admin-v2-form-group">
                      <label>Body Location</label>
                      <select
                        value={symptomFormData.location}
                        onChange={(e) => setSymptomFormData(prev => ({ ...prev, location: e.target.value }))}
                        className="admin-v2-input"
                      >
                        <option value="">Select location...</option>
                        {bodyLocations.map(loc => (
                          <option key={loc} value={loc}>{formatLocation(loc)}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  
                  <div className="admin-v2-form-row">
                    <div className="admin-v2-form-group">
                      <label>Duration</label>
                      <input
                        type="text"
                        value={symptomFormData.duration}
                        onChange={(e) => setSymptomFormData(prev => ({ ...prev, duration: e.target.value }))}
                        className="admin-v2-input"
                        placeholder="e.g., 30 minutes, 2 hours"
                      />
                    </div>
                    
                    <div className="admin-v2-form-group">
                      <label>Date/Time</label>
                      <input
                        type="datetime-local"
                        value={symptomFormData.timestamp}
                        onChange={(e) => setSymptomFormData(prev => ({ ...prev, timestamp: e.target.value }))}
                        className="admin-v2-input"
                        required
                      />
                    </div>
                  </div>
                  
                  <div className="admin-v2-form-group">
                    <label>Description</label>
                    <textarea
                      value={symptomFormData.description}
                      onChange={(e) => setSymptomFormData(prev => ({ ...prev, description: e.target.value }))}
                      className="admin-v2-input"
                      rows={3}
                      placeholder="Describe the symptom..."
                    />
                  </div>
                  
                  <div className="admin-v2-form-group">
                    <label>Notes</label>
                    <textarea
                      value={symptomFormData.notes}
                      onChange={(e) => setSymptomFormData(prev => ({ ...prev, notes: e.target.value }))}
                      className="admin-v2-input"
                      rows={2}
                      placeholder="Any additional notes..."
                    />
                  </div>
                </div>
                
                <div className="admin-v2-modal-footer">
                  <button 
                    type="button"
                    className="admin-v2-btn admin-v2-btn-secondary"
                    onClick={() => setShowSymptomModal(false)}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="admin-v2-btn admin-v2-btn-primary"
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : 'Update Symptom'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteModal && selectedSymptom && (
          <div className="admin-v2-modal-overlay" onClick={() => setShowDeleteModal(false)}>
            <div className="admin-v2-modal admin-v2-modal-sm" onClick={e => e.stopPropagation()}>
              <div className="admin-v2-modal-header">
                <h2>Delete Symptom</h2>
                <button 
                  className="admin-v2-modal-close"
                  onClick={() => setShowDeleteModal(false)}
                >
                  <XIcon size={20} />
                </button>
              </div>
              <div className="admin-v2-modal-body">
                <p>Are you sure you want to delete this symptom record?</p>
                <p className="admin-v2-modal-detail">
                  <strong>{formatSymptomType(selectedSymptom.symptom_type)}</strong>
                  {selectedSymptom.timestamp && (
                    <span> — {new Date(selectedSymptom.timestamp).toLocaleString()}</span>
                  )}
                </p>
              </div>
              <div className="admin-v2-modal-footer">
                <button 
                  className="admin-v2-btn admin-v2-btn-secondary"
                  onClick={() => setShowDeleteModal(false)}
                >
                  Cancel
                </button>
                <button 
                  className="admin-v2-btn admin-v2-btn-danger"
                  onClick={handleDeleteSymptom}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Symptoms;
