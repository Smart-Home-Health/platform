import React, { useState, useEffect } from 'react';
import config from '../../config';
import { useAdminPatient } from '../../contexts/AdminPatientContext';

const MedicationHistory = ({ onBack }) => {
  const { selectedPatient } = useAdminPatient();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [medicationNames, setMedicationNames] = useState([]);
  const [filters, setFilters] = useState({
    medication_name: '',
    start_date: '',
    end_date: '',
    status_filter: '',
    limit: 25
  });

  useEffect(() => {
    fetchHistory();
    fetchMedicationNames();
  }, []);

  const fetchMedicationNames = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/medications/names`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setMedicationNames(data.medication_names || []);
      } else {
        console.error('Failed to fetch medication names');
      }
    } catch (error) {
      console.error('Error fetching medication names:', error);
    }
  };

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams();

      Object.entries(filters).forEach(([key, value]) => {
        if (value && value !== '') {
          queryParams.append(key, value);
        }
      });

      if (selectedPatient) {
        queryParams.append('patient_id', selectedPatient.id);
      }

      const response = await fetch(`${config.apiUrl}/api/medications/history?${queryParams}`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setHistory(data.history || []);
      } else {
        console.error('Failed to fetch medication history');
      }
    } catch (error) {
      console.error('Error fetching medication history:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleApplyFilters = () => {
    fetchHistory();
  };

  const handleClearFilters = () => {
    setFilters({
      medication_name: '',
      start_date: '',
      end_date: '',
      status_filter: '',
      limit: 25
    });
    // Fetch will be triggered by useEffect when filters change
    setTimeout(fetchHistory, 100);
  };

  const getStatusColor = (status, doseAmount) => {
    // Handle skipped doses (0 dose amount)
    if (doseAmount === 0 || doseAmount === '0') {
      return '#6c757d'; // Gray for skipped
    }
    
    switch (status) {
      case 'on-time':
        return '#28a745';
      case 'late':
        return '#dc3545';
      case 'early':
        return '#ffc107';
      case 'as-needed':
        return '#17a2b8';
      default:
        return '#6c757d';
    }
  };

  const getStatusText = (status, doseAmount) => {
    // Handle skipped doses (0 dose amount)
    if (doseAmount === 0 || doseAmount === '0') {
      return 'Skipped';
    }
    
    switch (status) {
      case 'on-time':
        return 'On Time';
      case 'late':
        return 'Late';
      case 'early':
        return 'Early';
      case 'as-needed':
        return 'As Needed';
      default:
        return 'Unknown';
    }
  };

  const formatDateTime = (dateTimeString) => {
    const date = new Date(dateTimeString);
    return date.toLocaleString();
  };

  return (
    <div style={{ background: '#fff', borderRadius: 8, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
      <h3 style={{ margin: '0 0 24px 0', color: '#333' }}>Medication Administration History</h3>
      
      {/* Filters Section */}
      <div style={{ 
        background: '#f8f9fa', 
        borderRadius: 8, 
        padding: 20, 
        marginBottom: 24,
        border: '1px solid #dee2e6'
      }}>
        <h4 style={{ margin: '0 0 20px 0', color: '#333', fontSize: 16, fontWeight: 600 }}>Filters</h4>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 20, marginBottom: 20 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, color: '#333', fontSize: 14 }}>
              Medication Name
            </label>
            <select
              value={filters.medication_name}
              onChange={(e) => handleFilterChange('medication_name', e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '2px solid #ddd',
                borderRadius: 6,
                fontSize: 14,
                boxSizing: 'border-box',
                backgroundColor: '#fff',
                color: '#333'
              }}
            >
              <option value="">All Medications</option>
              {medicationNames.map((med) => (
                <option 
                  key={med.id} 
                  value={med.name}
                  style={{
                    color: med.active ? '#333' : '#6c757d',
                    fontStyle: med.active ? 'normal' : 'italic'
                  }}
                >
                  {med.display_name}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, color: '#333', fontSize: 14 }}>
              Start Date
            </label>
            <input
              type="date"
              value={filters.start_date}
              onChange={(e) => handleFilterChange('start_date', e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '2px solid #ddd',
                borderRadius: 6,
                fontSize: 14,
                boxSizing: 'border-box',
                backgroundColor: '#fff',
                color: '#333'
              }}
            />
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, color: '#333', fontSize: 14 }}>
              End Date
            </label>
            <input
              type="date"
              value={filters.end_date}
              onChange={(e) => handleFilterChange('end_date', e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '2px solid #ddd',
                borderRadius: 6,
                fontSize: 14,
                boxSizing: 'border-box',
                backgroundColor: '#fff',
                color: '#333'
              }}
            />
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, color: '#333', fontSize: 14 }}>
              Status
            </label>
            <select
              value={filters.status_filter}
              onChange={(e) => handleFilterChange('status_filter', e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '2px solid #ddd',
                borderRadius: 6,
                fontSize: 14,
                boxSizing: 'border-box',
                backgroundColor: '#fff',
                color: '#333'
              }}
            >
              <option value="">All Statuses</option>
              <option value="on-time">On Time</option>
              <option value="late">Late</option>
              <option value="early">Early</option>
              <option value="as-needed">As Needed</option>
              <option value="skipped">Skipped</option>
            </select>
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, color: '#333', fontSize: 14 }}>
              Records Limit
            </label>
            <select
              value={filters.limit}
              onChange={(e) => handleFilterChange('limit', parseInt(e.target.value))}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '2px solid #ddd',
                borderRadius: 6,
                fontSize: 14,
                boxSizing: 'border-box',
                backgroundColor: '#fff',
                color: '#333'
              }}
            >
              <option value={10}>10 records</option>
              <option value={25}>25 records</option>
              <option value={50}>50 records</option>
              <option value={100}>100 records</option>
            </select>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={handleApplyFilters}
            disabled={loading}
            style={{
              padding: '10px 20px',
              border: 'none',
              borderRadius: 6,
              background: '#007bff',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
              transition: 'background-color 0.2s'
            }}
            onMouseOver={(e) => {
              if (!loading) {
                e.target.style.background = '#0056b3';
              }
            }}
            onMouseOut={(e) => {
              if (!loading) {
                e.target.style.background = '#007bff';
              }
            }}
          >
            {loading ? 'Loading...' : 'Apply Filters'}
          </button>
          
          <button
            onClick={handleClearFilters}
            disabled={loading}
            style={{
              padding: '10px 20px',
              border: '2px solid #6c757d',
              borderRadius: 6,
              background: '#fff',
              color: '#6c757d',
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => {
              if (!loading) {
                e.target.style.background = '#6c757d';
                e.target.style.color = '#fff';
              }
            }}
            onMouseOut={(e) => {
              if (!loading) {
                e.target.style.background = '#fff';
                e.target.style.color = '#6c757d';
              }
            }}
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Results Section */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>
          Loading history...
        </div>
      ) : history.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: 40,
          color: '#666',
          background: '#f8f9fa',
          borderRadius: 8,
          border: '1px solid #dee2e6'
        }}>
          <p style={{ margin: '0 0 10px 0', fontSize: 18, fontWeight: 500 }}>No administration history found</p>
          <p style={{ margin: 0 }}>Try adjusting your filters or check back later.</p>
        </div>
      ) : (
        <div>
          <div style={{ marginBottom: 16, color: '#666', fontSize: 14 }}>
            Showing {history.length} record{history.length !== 1 ? 's' : ''}
          </div>
          
          <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #dee2e6', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8f9fa' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 14, fontWeight: 600, color: '#333', borderBottom: '1px solid #dee2e6' }}>
                    Medication
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 14, fontWeight: 600, color: '#333', borderBottom: '1px solid #dee2e6' }}>
                    Dose
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 14, fontWeight: 600, color: '#333', borderBottom: '1px solid #dee2e6' }}>
                    Administered
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 14, fontWeight: 600, color: '#333', borderBottom: '1px solid #dee2e6' }}>
                    Scheduled
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: 14, fontWeight: 600, color: '#333', borderBottom: '1px solid #dee2e6' }}>
                    Status
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 14, fontWeight: 600, color: '#333', borderBottom: '1px solid #dee2e6' }}>
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody>
                {history.map((record, index) => (
                  <tr key={record.id} style={{ borderBottom: index < history.length - 1 ? '1px solid #f1f3f4' : 'none' }}>
                    <td style={{ padding: '12px 16px', fontSize: 14, color: '#333' }}>
                      <div style={{ fontWeight: 600 }}>{record.medication_name}</div>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 14, color: '#333' }}>
                      {record.dose_amount} {record.dose_unit}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 14, color: '#333' }}>
                      {formatDateTime(record.administered_at)}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 14, color: '#333' }}>
                      {record.scheduled_time ? (
                        <div>
                          <div>{formatDateTime(record.scheduled_time)}</div>
                          {record.time_difference && record.dose_amount > 0 && (
                            <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                              ({record.time_difference})
                            </div>
                          )}
                        </div>
                      ) : 'N/A'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '4px 8px',
                        borderRadius: 12,
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#fff',
                        background: getStatusColor(record.status, record.dose_amount)
                      }}>
                        {getStatusText(record.status, record.dose_amount)}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 14, color: '#333' }}>
                      {record.notes || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Back Button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
        <button
          onClick={onBack}
          style={{
            padding: '10px 24px',
            border: '2px solid #6c757d',
            borderRadius: 6,
            background: '#fff',
            color: '#6c757d',
            fontWeight: 500,
            fontSize: 14,
            cursor: 'pointer'
          }}
        >
          Back
        </button>
      </div>
    </div>
  );
};

export default MedicationHistory;
