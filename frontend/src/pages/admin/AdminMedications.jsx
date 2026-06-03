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
import config from '../../config';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import MedicationScheduleView, { medicationStatusUtils } from '../../components/medication/MedicationScheduleView';

const AdminMedications = () => {
  const { selectedPatientId, setPatientId } = useAdminPatient();
  const [medications, setMedications] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [patients, setPatients] = useState([]);
  const [currentPatientId, setCurrentPatientId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('active'); // 'active', 'inactive', 'schedules'
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingMedication, setEditingMedication] = useState(null);
  const [showScheduleFor, setShowScheduleFor] = useState(null);
  const [providers, setProviders] = useState([]);
  const [pharmacies, setPharmacies] = useState([]);
  
  const [newMedication, setNewMedication] = useState({
    name: '',
    concentration: '',
    quantity: '',
    quantity_unit: 'mg',
    instructions: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    as_needed: false,
    notes: '',
    is_patient_specific: false,
    prescriber_id: '',
    pharmacy_id: ''
  });

  useEffect(() => {
    fetchData();
    fetchPatients();
    fetchCurrentPatient();
    fetchProviders();
    fetchPharmacies();
  }, [activeTab, selectedPatientId]);

  const fetchProviders = async () => {
    try {
      // Fetch providers for selected patient if available
      const url = selectedPatientId ? 
        `${config.apiUrl}/api/medications/providers?patient_id=${selectedPatientId}` :
        `${config.apiUrl}/api/medications/providers`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setProviders(data.providers || []);
      }
    } catch (error) {
      console.error('Error fetching providers:', error);
      setProviders([]);
    }
  };

  const fetchPharmacies = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/medications/pharmacies`);
      if (response.ok) {
        const data = await response.json();
        setPharmacies(data.pharmacies || []);
      }
    } catch (error) {
      console.error('Error fetching pharmacies:', error);
      setPharmacies([]);
    }
  };

  const fetchCurrentPatient = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/patients/current`);
      if (response.ok) {
        const currentPatient = await response.json();
        setCurrentPatientId(currentPatient.id);
        
        // If no patient is selected in admin context, default to current patient
        if (!selectedPatientId && currentPatient.id) {
          setPatientId(String(currentPatient.id));
        }
      }
    } catch (error) {
      console.error('Error fetching current patient:', error);
    }
  };

  const fetchPatients = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/patients/`);
      const data = await response.json();
      console.log('Fetched patients:', data);
      setPatients(data);
    } catch (error) {
      console.error('Error fetching patients:', error);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'schedules') {
        const response = await fetch(`${config.apiUrl}/api/schedules`);
        const data = await response.json();
        setSchedules(data);
      } else {
        // Use admin endpoints with optional patient filtering
        const baseEndpoint = activeTab === 'active' ? '/api/admin/medications/active' : '/api/admin/medications/inactive';
        const url = selectedPatientId 
          ? `${config.apiUrl}${baseEndpoint}?patient_id=${selectedPatientId}`
          : `${config.apiUrl}${baseEndpoint}`;
        
        const response = await fetch(url);
        const data = await response.json();
        setMedications(data);
      }
    } catch (error) {
      console.error('Error fetching medications:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddMedication = async (e) => {
    e.preventDefault();
    
    // Validation: Check if patient-specific medication is selected but no patient is chosen
    if (newMedication.is_patient_specific && !selectedPatientId) {
      alert('Please select a patient first or uncheck "Patient-Specific" to create a global medication.');
      return;
    }
    
    try {
      const medicationData = {
        ...newMedication,
        ...(newMedication.is_patient_specific && selectedPatientId && {
          admin_patient_id: parseInt(selectedPatientId)
        })
      };
      
      const response = await fetch(`${config.apiUrl}/api/add/medication`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(medicationData),
      });

      if (response.ok) {
        setShowAddForm(false);
        setNewMedication({
          name: '',
          concentration: '',
          quantity: '',
          quantity_unit: 'mg',
          instructions: '',
          start_date: new Date().toISOString().split('T')[0],
          end_date: '',
          as_needed: false,
          notes: '',
          is_patient_specific: false,
          prescriber_id: '',
          pharmacy_id: ''
        });
        fetchData();
      } else {
        console.error('Failed to add medication');
      }
    } catch (error) {
      console.error('Error adding medication:', error);
    }
  };

  const handleUpdateMedication = async (medicationId, updates) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/medications/${medicationId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (response.ok) {
        fetchData();
        setEditingMedication(null);
      } else {
        console.error('Failed to update medication');
      }
    } catch (error) {
      console.error('Error updating medication:', error);
    }
  };

  const handleToggleActive = async (medicationId) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/medications/${medicationId}/toggle-active`, {
        method: 'POST',
      });

      if (response.ok) {
        fetchData();
      } else {
        console.error('Failed to toggle medication status');
      }
    } catch (error) {
      console.error('Error toggling medication status:', error);
    }
  };

  const handleDeleteMedication = async (medicationId) => {
    if (window.confirm('Are you sure you want to delete this medication?')) {
      try {
        const response = await fetch(`${config.apiUrl}/api/medications/${medicationId}`, {
          method: 'DELETE',
        });

        if (response.ok) {
          fetchData();
        } else {
          console.error('Failed to delete medication');
        }
      } catch (error) {
        console.error('Error deleting medication:', error);
      }
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString();
  };

  if (loading) {
    return <div className="admin-page">
      <div className="loading">Loading medications...</div>
    </div>;
  }

  return (
    <div className="admin-page" style={{ 
      padding: '2rem 3rem', 
      maxWidth: '1400px', 
      margin: '0 auto',
      width: 'calc(100% - 4rem)',
      height: 'auto',
      minHeight: '100%',
      boxSizing: 'border-box'
    }}>
      <style>
        {`
          .admin-page input,
          .admin-page select,
          .admin-page textarea {
            color: #2c3e50 !important;
          }
        `}
      </style>
      <div className="admin-page-header" style={{ marginBottom: '2rem' }}>
        <h1 className="admin-page-title" style={{ 
          fontSize: '2.5rem', 
          fontWeight: '700', 
          color: '#2c3e50',
          marginBottom: '0.5rem' 
        }}>
          Medication Management
        </h1>
        <p className="admin-page-description" style={{ 
          fontSize: '1.1rem', 
          color: '#7f8c8d',
          margin: '0' 
        }}>
          Manage medications, schedules, and administration tracking
        </p>
      </div>

      <div className="admin-section" style={{ 
        background: '#ffffff', 
        borderRadius: '12px', 
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        padding: '2rem',
        overflow: 'visible'
      }}>
        <div className="admin-section-header" style={{ marginBottom: '2rem' }}>
          <h2 className="admin-section-title" style={{ 
            fontSize: '1.8rem', 
            fontWeight: '600', 
            color: '#34495e',
            marginBottom: '1.5rem' 
          }}>
            Medications
          </h2>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="tab-buttons" style={{ display: 'flex', gap: '0.5rem' }}>
              <button 
                className={`btn ${activeTab === 'active' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveTab('active')}
                style={{
                  padding: '0.75rem 1.5rem',
                  fontSize: '0.9rem',
                  fontWeight: '500',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  backgroundColor: activeTab === 'active' ? '#3498db' : '#ecf0f1',
                  color: activeTab === 'active' ? '#ffffff' : '#7f8c8d'
                }}
              >
                Active ({medications.length})
              </button>
              <button 
                className={`btn ${activeTab === 'inactive' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveTab('inactive')}
                style={{
                  padding: '0.75rem 1.5rem',
                  fontSize: '0.9rem',
                  fontWeight: '500',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  backgroundColor: activeTab === 'inactive' ? '#3498db' : '#ecf0f1',
                  color: activeTab === 'inactive' ? '#ffffff' : '#7f8c8d'
                }}
              >
                Inactive
              </button>
              <button 
                className={`btn ${activeTab === 'schedules' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveTab('schedules')}
                style={{
                  padding: '0.75rem 1.5rem',
                  fontSize: '0.9rem',
                  fontWeight: '500',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  backgroundColor: activeTab === 'schedules' ? '#3498db' : '#ecf0f1',
                  color: activeTab === 'schedules' ? '#ffffff' : '#7f8c8d'
                }}
              >
                Schedules
              </button>
            </div>
            <button 
              className="btn btn-success"
              onClick={() => setShowAddForm(true)}
              style={{
                padding: '0.75rem 1.5rem',
                fontSize: '0.9rem',
                fontWeight: '500',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                backgroundColor: '#27ae60',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              <span style={{ fontSize: '1.1rem' }}>+</span>
              Add Medication
            </button>
          </div>
        </div>

        <div className="admin-section-content" style={{ 
          height: 'auto',
          minHeight: 'auto',
          overflow: 'visible'
        }}>
          {showAddForm && (
            <div style={{ 
              background: '#ffffff', 
              borderRadius: '12px', 
              overflow: 'hidden',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
              border: '1px solid #e9ecef',
              marginBottom: '2rem'
            }}>
              <div style={{
                padding: '2.5rem',
                background: '#ffffff'
              }}>
                <h3 className="admin-card-title" style={{ 
                  fontSize: '1.4rem', 
                  fontWeight: '600', 
                  color: '#2c3e50',
                  marginBottom: '1.5rem',
                  borderBottom: '2px solid #3498db',
                  paddingBottom: '0.5rem'
                }}>
                  Add New Medication
                </h3>
              <form onSubmit={handleAddMedication}>
                {/* Basic Information Section */}
                <div style={{ marginBottom: '2rem' }}>
                  <h4 style={{ 
                    fontSize: '1.1rem', 
                    fontWeight: '600', 
                    color: '#2c3e50',
                    marginBottom: '1rem',
                    paddingBottom: '0.5rem',
                    borderBottom: '1px solid #e9ecef'
                  }}>
                    Basic Information
                  </h4>
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: '1fr 1fr', 
                    gap: '1.5rem',
                    marginBottom: '1.5rem'
                  }}>
                    <div>
                      <label style={{ 
                        display: 'block', 
                        marginBottom: '0.5rem', 
                        fontWeight: '600',
                        color: '#2c3e50',
                        fontSize: '0.9rem'
                      }}>
                        Medication Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={newMedication.name}
                        onChange={(e) => setNewMedication({ ...newMedication, name: e.target.value })}
                        placeholder="Enter medication name"
                        style={{ 
                          width: '100%', 
                          padding: '0.75rem', 
                          border: '2px solid #e9ecef', 
                          borderRadius: '8px',
                          fontSize: '0.9rem',
                          transition: 'border-color 0.2s ease',
                          outline: 'none',
                          backgroundColor: '#ffffff',
                          boxSizing: 'border-box'
                        }}
                        onFocus={(e) => e.target.style.borderColor = '#3498db'}
                        onBlur={(e) => e.target.style.borderColor = '#e9ecef'}
                      />
                    </div>
                    <div>
                      <label style={{ 
                        display: 'block', 
                        marginBottom: '0.5rem', 
                        fontWeight: '600',
                        color: '#2c3e50',
                        fontSize: '0.9rem'
                      }}>
                        Concentration *
                      </label>
                      <input
                        type="text"
                        required
                        value={newMedication.concentration}
                        onChange={(e) => setNewMedication({ ...newMedication, concentration: e.target.value })}
                        placeholder="e.g., 10mg/ml, 500mg"
                        style={{ 
                          width: '100%', 
                          padding: '0.75rem', 
                          border: '2px solid #e9ecef', 
                          borderRadius: '8px',
                          fontSize: '0.9rem',
                          transition: 'border-color 0.2s ease',
                          outline: 'none',
                          backgroundColor: '#ffffff',
                          boxSizing: 'border-box'
                        }}
                        onFocus={(e) => e.target.style.borderColor = '#3498db'}
                        onBlur={(e) => e.target.style.borderColor = '#e9ecef'}
                      />
                    </div>
                  </div>

                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: '1fr 1fr', 
                    gap: '1.5rem'
                  }}>
                    <div>
                      <label style={{ 
                        display: 'block', 
                        marginBottom: '0.5rem', 
                        fontWeight: '600',
                        color: '#2c3e50',
                        fontSize: '0.9rem'
                      }}>
                        Quantity *
                      </label>
                      <input
                        type="number"
                        required
                        step="0.01"
                        value={newMedication.quantity}
                        onChange={(e) => setNewMedication({ ...newMedication, quantity: e.target.value })}
                        placeholder="Enter quantity"
                        style={{ 
                          width: '100%', 
                          padding: '0.75rem', 
                          border: '2px solid #e9ecef', 
                          borderRadius: '8px',
                          fontSize: '0.9rem',
                          transition: 'border-color 0.2s ease',
                          outline: 'none',
                          backgroundColor: '#ffffff',
                          boxSizing: 'border-box'
                        }}
                        onFocus={(e) => e.target.style.borderColor = '#3498db'}
                        onBlur={(e) => e.target.style.borderColor = '#e9ecef'}
                      />
                    </div>
                    <div>
                      <label style={{ 
                        display: 'block', 
                        marginBottom: '0.5rem', 
                        fontWeight: '600',
                        color: '#2c3e50',
                        fontSize: '0.9rem'
                      }}>
                        Unit *
                      </label>
                      <select
                        value={newMedication.quantity_unit}
                        onChange={(e) => setNewMedication({ ...newMedication, quantity_unit: e.target.value })}
                        style={{ 
                          width: '100%', 
                          padding: '0.75rem', 
                          border: '2px solid #e9ecef', 
                          borderRadius: '8px',
                          fontSize: '0.9rem',
                          transition: 'border-color 0.2s ease',
                          outline: 'none',
                          backgroundColor: '#ffffff',
                          boxSizing: 'border-box'
                        }}
                        onFocus={(e) => e.target.style.borderColor = '#3498db'}
                        onBlur={(e) => e.target.style.borderColor = '#e9ecef'}
                      >
                        <option value="mg">mg</option>
                        <option value="ml">ml</option>
                        <option value="tablets">tablets</option>
                        <option value="capsules">capsules</option>
                        <option value="drops">drops</option>
                        <option value="puffs">puffs</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Instructions Section */}
                <div style={{ marginBottom: '2rem' }}>
                  <h4 style={{ 
                    fontSize: '1.1rem', 
                    fontWeight: '600', 
                    color: '#2c3e50',
                    marginBottom: '1rem',
                    paddingBottom: '0.5rem',
                    borderBottom: '1px solid #e9ecef'
                  }}>
                    Instructions
                  </h4>
                  <div>
                    <label style={{ 
                      display: 'block', 
                      marginBottom: '0.5rem', 
                      fontWeight: '600',
                      color: '#2c3e50',
                      fontSize: '0.9rem'
                    }}>
                      Administration Instructions *
                    </label>
                    <textarea
                      required
                      value={newMedication.instructions}
                      onChange={(e) => setNewMedication({ ...newMedication, instructions: e.target.value })}
                      placeholder="Enter detailed administration instructions..."
                      style={{ 
                        width: '100%', 
                        padding: '0.75rem', 
                        border: '2px solid #e9ecef', 
                        borderRadius: '8px', 
                        minHeight: '100px',
                        fontSize: '0.9rem',
                        fontFamily: 'inherit',
                        resize: 'vertical',
                        transition: 'border-color 0.2s ease',
                        outline: 'none',
                        backgroundColor: '#ffffff',
                        boxSizing: 'border-box'
                      }}
                      onFocus={(e) => e.target.style.borderColor = '#3498db'}
                      onBlur={(e) => e.target.style.borderColor = '#e9ecef'}
                    />
                  </div>
                </div>

                {/* Schedule & Settings Section */}
                <div style={{ marginBottom: '2rem' }}>
                  <h4 style={{ 
                    fontSize: '1.1rem', 
                    fontWeight: '600', 
                    color: '#2c3e50',
                    marginBottom: '1rem',
                    paddingBottom: '0.5rem',
                    borderBottom: '1px solid #e9ecef'
                  }}>
                    Schedule & Settings
                  </h4>
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: '1fr 1fr', 
                    gap: '1.5rem',
                    marginBottom: '1.5rem'
                  }}>
                    <div>
                      <label style={{ 
                        display: 'block', 
                        marginBottom: '0.5rem', 
                        fontWeight: '600',
                        color: '#2c3e50',
                        fontSize: '0.9rem'
                      }}>
                        Start Date *
                      </label>
                      <input
                        type="date"
                        required
                        value={newMedication.start_date}
                        onChange={(e) => setNewMedication({ ...newMedication, start_date: e.target.value })}
                        style={{ 
                          width: '100%', 
                          padding: '0.75rem', 
                          border: '2px solid #e9ecef', 
                          borderRadius: '8px',
                          fontSize: '0.9rem',
                          transition: 'border-color 0.2s ease',
                          outline: 'none',
                          backgroundColor: '#ffffff',
                          boxSizing: 'border-box'
                        }}
                        onFocus={(e) => e.target.style.borderColor = '#3498db'}
                        onBlur={(e) => e.target.style.borderColor = '#e9ecef'}
                      />
                    </div>
                    <div>
                      <label style={{ 
                        display: 'block', 
                        marginBottom: '0.5rem', 
                        fontWeight: '600',
                        color: '#2c3e50',
                        fontSize: '0.9rem'
                      }}>
                        End Date
                      </label>
                      <input
                        type="date"
                        value={newMedication.end_date}
                        onChange={(e) => setNewMedication({ ...newMedication, end_date: e.target.value })}
                        style={{ 
                          width: '100%', 
                          padding: '0.75rem', 
                          border: '2px solid #e9ecef', 
                          borderRadius: '8px',
                          fontSize: '0.9rem',
                          transition: 'border-color 0.2s ease',
                          outline: 'none',
                          backgroundColor: '#ffffff',
                          boxSizing: 'border-box'
                        }}
                        onFocus={(e) => e.target.style.borderColor = '#3498db'}
                        onBlur={(e) => e.target.style.borderColor = '#e9ecef'}
                      />
                    </div>
                  </div>

                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: '1fr 1fr', 
                    gap: '1.5rem'
                  }}>
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '0.75rem',
                      padding: '0.75rem',
                      border: '1px solid #e9ecef',
                      borderRadius: '8px',
                      backgroundColor: '#f8f9fa'
                    }}>
                      <input
                        type="checkbox"
                        id="as_needed"
                        checked={newMedication.as_needed}
                        onChange={(e) => setNewMedication({ ...newMedication, as_needed: e.target.checked })}
                        style={{ 
                          width: '18px',
                          height: '18px'
                        }}
                      />
                      <label htmlFor="as_needed" style={{ 
                        fontWeight: '600',
                        color: '#2c3e50',
                        fontSize: '0.9rem',
                        cursor: 'pointer'
                      }}>
                        As Needed (PRN)
                      </label>
                    </div>
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'flex-start', 
                      gap: '0.75rem',
                      padding: '0.75rem',
                      border: '1px solid #e9ecef',
                      borderRadius: '8px',
                      backgroundColor: '#f8f9fa'
                    }}>
                      <input
                        type="checkbox"
                        id="is_patient_specific"
                        checked={newMedication.is_patient_specific}
                        onChange={(e) => setNewMedication({ ...newMedication, is_patient_specific: e.target.checked })}
                        style={{ 
                          width: '18px',
                          height: '18px',
                          marginTop: '2px'
                        }}
                      />
                      <label htmlFor="is_patient_specific" style={{ 
                        fontWeight: '600',
                        color: '#2c3e50',
                        fontSize: '0.9rem',
                        cursor: 'pointer',
                        lineHeight: '1.4'
                      }}>
                        Patient-Specific 
                        {selectedPatientId && newMedication.is_patient_specific && (
                          <span style={{ fontSize: '0.8em', color: '#27ae60', display: 'block', fontWeight: 'normal' }}>
                            (for current patient)
                          </span>
                        )}
                        {!selectedPatientId && newMedication.is_patient_specific && (
                          <span style={{ fontSize: '0.8em', color: '#e74c3c', display: 'block', fontWeight: 'normal' }}>
                            (select patient first)
                          </span>
                        )}
                      </label>
                    </div>
                  </div>
                </div>

                {/* Prescriber and Pharmacy Section */}
                <div style={{ marginBottom: '2rem' }}>
                  <h4 style={{ 
                    fontSize: '1.1rem', 
                    fontWeight: '600', 
                    color: '#2c3e50',
                    marginBottom: '1rem',
                    paddingBottom: '0.5rem',
                    borderBottom: '1px solid #e9ecef'
                  }}>
                    Prescriber & Pharmacy
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ 
                        display: 'block', 
                        marginBottom: '0.5rem', 
                        fontWeight: '600',
                        color: '#2c3e50',
                        fontSize: '0.9rem'
                      }}>
                        Prescriber (Optional)
                      </label>
                      <select
                        value={newMedication.prescriber_id}
                        onChange={(e) => setNewMedication({ ...newMedication, prescriber_id: e.target.value })}
                        style={{ 
                          width: '100%', 
                          padding: '0.75rem', 
                          border: '2px solid #e9ecef', 
                          borderRadius: '8px',
                          fontSize: '0.9rem',
                          fontFamily: 'inherit',
                          transition: 'border-color 0.2s ease',
                          outline: 'none',
                          backgroundColor: '#ffffff',
                          boxSizing: 'border-box'
                        }}
                      >
                        <option value="">Select a prescriber</option>
                        {providers.map(provider => (
                          <option key={provider.id} value={provider.id}>
                            {provider.name} {provider.specialty ? `(${provider.specialty})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ 
                        display: 'block', 
                        marginBottom: '0.5rem', 
                        fontWeight: '600',
                        color: '#2c3e50',
                        fontSize: '0.9rem'
                      }}>
                        Pharmacy (Optional)
                      </label>
                      <select
                        value={newMedication.pharmacy_id}
                        onChange={(e) => setNewMedication({ ...newMedication, pharmacy_id: e.target.value })}
                        style={{ 
                          width: '100%', 
                          padding: '0.75rem', 
                          border: '2px solid #e9ecef', 
                          borderRadius: '8px',
                          fontSize: '0.9rem',
                          fontFamily: 'inherit',
                          transition: 'border-color 0.2s ease',
                          outline: 'none',
                          backgroundColor: '#ffffff',
                          boxSizing: 'border-box'
                        }}
                      >
                        <option value="">Select a pharmacy</option>
                        {pharmacies.map(pharmacy => (
                          <option key={pharmacy.id} value={pharmacy.id}>
                            {pharmacy.name}
                            {pharmacy.address && ` - ${pharmacy.address}`}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Notes Section */}
                <div style={{ marginBottom: '2rem' }}>
                  <h4 style={{ 
                    fontSize: '1.1rem', 
                    fontWeight: '600', 
                    color: '#2c3e50',
                    marginBottom: '1rem',
                    paddingBottom: '0.5rem',
                    borderBottom: '1px solid #e9ecef'
                  }}>
                    Additional Notes
                  </h4>
                  <div>
                    <label style={{ 
                      display: 'block', 
                      marginBottom: '0.5rem', 
                      fontWeight: '600',
                      color: '#2c3e50',
                      fontSize: '0.9rem'
                    }}>
                      Notes (Optional)
                    </label>
                    <textarea
                      value={newMedication.notes}
                      onChange={(e) => setNewMedication({ ...newMedication, notes: e.target.value })}
                      placeholder="Any additional notes or comments..."
                      style={{ 
                        width: '100%', 
                        padding: '0.75rem', 
                        border: '2px solid #e9ecef', 
                        borderRadius: '8px', 
                        minHeight: '80px',
                        fontSize: '0.9rem',
                        fontFamily: 'inherit',
                        resize: 'vertical',
                        transition: 'border-color 0.2s ease',
                        outline: 'none',
                        backgroundColor: '#ffffff',
                        boxSizing: 'border-box'
                      }}
                      onFocus={(e) => e.target.style.borderColor = '#3498db'}
                      onBlur={(e) => e.target.style.borderColor = '#e9ecef'}
                    />
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="admin-actions" style={{ 
                  display: 'flex', 
                  gap: '1rem', 
                  paddingTop: '1.5rem',
                  borderTop: '2px solid #e9ecef',
                  justifyContent: 'flex-end'
                }}>
                  <button type="submit" className="btn btn-success" style={{
                    padding: '0.75rem 2rem',
                    fontSize: '0.9rem',
                    fontWeight: '600',
                    borderRadius: '8px',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    backgroundColor: '#27ae60',
                    color: '#ffffff'
                  }}>
                    Add Medication
                  </button>
                  <button 
                    type="button" 
                    className="btn btn-secondary"
                    onClick={() => setShowAddForm(false)}
                    style={{
                      padding: '0.75rem 2rem',
                      fontSize: '0.9rem',
                      fontWeight: '600',
                      borderRadius: '8px',
                      border: '2px solid #6c757d',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      backgroundColor: 'transparent',
                      color: '#6c757d'
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
              </div>
            </div>
          )}

          {activeTab !== 'schedules' ? (
            <div style={{ 
              background: '#ffffff', 
              borderRadius: '12px', 
              overflow: 'hidden',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
              border: '1px solid #e9ecef'
            }}>
              <table className="admin-table" style={{ 
                width: '100%', 
                borderCollapse: 'collapse',
                fontSize: '0.9rem'
              }}>
                <thead>
                  <tr style={{ background: '#f8f9fa' }}>
                    <th style={{ 
                      padding: '1rem', 
                      textAlign: 'left', 
                      fontWeight: '600',
                      color: '#2c3e50',
                      borderBottom: '1px solid #e9ecef',
                      fontSize: '0.85rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      Name
                    </th>
                    <th style={{ 
                      padding: '1rem', 
                      textAlign: 'left', 
                      fontWeight: '600',
                      color: '#2c3e50',
                      borderBottom: '1px solid #e9ecef',
                      fontSize: '0.85rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      Concentration
                    </th>
                    <th style={{ 
                      padding: '1rem', 
                      textAlign: 'left', 
                      fontWeight: '600',
                      color: '#2c3e50',
                      borderBottom: '1px solid #e9ecef',
                      fontSize: '0.85rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      Quantity
                    </th>
                    <th style={{ 
                      padding: '1rem', 
                      textAlign: 'left', 
                      fontWeight: '600',
                      color: '#2c3e50',
                      borderBottom: '1px solid #e9ecef',
                      fontSize: '0.85rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      Instructions
                    </th>
                    <th style={{ 
                      padding: '1rem', 
                      textAlign: 'left', 
                      fontWeight: '600',
                      color: '#2c3e50',
                      borderBottom: '1px solid #e9ecef',
                      fontSize: '0.85rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      Start Date
                    </th>
                    <th style={{ 
                      padding: '1rem', 
                      textAlign: 'left', 
                      fontWeight: '600',
                      color: '#2c3e50',
                      borderBottom: '1px solid #e9ecef',
                      fontSize: '0.85rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      Patient
                    </th>
                    <th style={{ 
                      padding: '1rem', 
                      textAlign: 'left', 
                      fontWeight: '600',
                      color: '#2c3e50',
                      borderBottom: '1px solid #e9ecef',
                      fontSize: '0.85rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      Status
                    </th>
                    <th style={{ 
                      padding: '1rem', 
                      textAlign: 'left', 
                      fontWeight: '600',
                      color: '#2c3e50',
                      borderBottom: '1px solid #e9ecef',
                      fontSize: '0.85rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {medications.map((medication, index) => (
                    <tr key={medication.id} style={{ 
                      backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8f9fa',
                      transition: 'background-color 0.2s ease'
                    }}>
                      <td style={{ 
                        fontWeight: '600', 
                        padding: '1rem',
                        borderBottom: '1px solid #e9ecef',
                        color: '#2c3e50'
                      }}>
                        {medication.name}
                      </td>
                      <td style={{ 
                        padding: '1rem',
                        borderBottom: '1px solid #e9ecef',
                        color: '#7f8c8d'
                      }}>
                        {medication.concentration}
                      </td>
                      <td style={{ 
                        padding: '1rem',
                        borderBottom: '1px solid #e9ecef',
                        color: '#7f8c8d'
                      }}>
                        {medication.quantity} {medication.quantity_unit}
                      </td>
                      <td style={{ 
                        maxWidth: '250px', 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis',
                        padding: '1rem',
                        borderBottom: '1px solid #e9ecef',
                        color: '#7f8c8d',
                        whiteSpace: 'nowrap'
                      }}>
                        {medication.instructions}
                      </td>
                      <td style={{ 
                        padding: '1rem',
                        borderBottom: '1px solid #e9ecef',
                        color: '#7f8c8d'
                      }}>
                        {formatDate(medication.start_date)}
                      </td>
                      <td style={{ 
                        padding: '1rem',
                        borderBottom: '1px solid #e9ecef'
                      }}>
                        <span style={{ 
                          padding: '4px 8px', 
                          borderRadius: '12px', 
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          background: medication.is_global ? '#f0f0f0' : '#e8f5e8', 
                          color: medication.is_global ? '#666' : '#27ae60'
                        }}>
                          {medication.is_global ? 'Global' : 'Patient'}
                        </span>
                      </td>
                      <td style={{ 
                        padding: '1rem',
                        borderBottom: '1px solid #e9ecef'
                      }}>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <span className={`status-badge ${medication.active ? 'status-active' : 'status-inactive'}`} style={{
                            padding: '4px 8px',
                            borderRadius: '12px',
                            fontSize: '0.75rem',
                            fontWeight: '600',
                            background: medication.active ? '#d4edda' : '#f8d7da',
                            color: medication.active ? '#155724' : '#721c24'
                          }}>
                            {medication.active ? 'Active' : 'Inactive'}
                          </span>
                          {medication.as_needed && (
                            <span className="status-badge" style={{ 
                              padding: '4px 8px',
                              borderRadius: '12px',
                              fontSize: '0.75rem',
                              fontWeight: '600',
                              background: '#e2e3e5', 
                              color: '#495057' 
                            }}>
                              PRN
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ 
                        padding: '1rem',
                        borderBottom: '1px solid #e9ecef'
                      }}>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button 
                            style={{ 
                              padding: '8px',
                              borderRadius: '6px',
                              border: 'none',
                              backgroundColor: '#3498db',
                              color: '#ffffff',
                              cursor: 'pointer',
                              transition: 'background-color 0.2s ease',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '32px',
                              height: '32px',
                              fontSize: '14px'
                            }}
                            onClick={() => setEditingMedication(medication)}
                            onMouseEnter={(e) => e.target.style.backgroundColor = '#2980b9'}
                            onMouseLeave={(e) => e.target.style.backgroundColor = '#3498db'}
                            title="Edit"
                          >
                            ✏️
                          </button>
                          <button 
                            style={{ 
                              padding: '8px',
                              borderRadius: '6px',
                              border: 'none',
                              backgroundColor: '#8e44ad',
                              color: '#ffffff',
                              cursor: 'pointer',
                              transition: 'background-color 0.2s ease',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '32px',
                              height: '32px',
                              fontSize: '14px',
                              position: 'relative'
                            }}
                            onClick={() => setShowScheduleFor(medication)}
                            onMouseEnter={(e) => e.target.style.backgroundColor = '#7d3c98'}
                            onMouseLeave={(e) => e.target.style.backgroundColor = '#8e44ad'}
                            title="Manage Schedules"
                          >
                            📅
                            {medicationStatusUtils.hasRelevantSchedules(medication, selectedPatientId) && (
                              <span style={{
                                position: 'absolute',
                                top: '-2px',
                                right: '-2px',
                                backgroundColor: '#e74c3c',
                                color: 'white',
                                borderRadius: '50%',
                                width: '16px',
                                height: '16px',
                                fontSize: '10px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 'bold',
                                border: '1px solid #fff'
                              }}>
                                {medicationStatusUtils.getRelevantScheduleCount(medication, selectedPatientId)}
                              </span>
                            )}
                          </button>
                          <button 
                            style={{ 
                              padding: '8px',
                              borderRadius: '6px',
                              border: 'none',
                              backgroundColor: medication.active ? '#f39c12' : '#27ae60',
                              color: '#ffffff',
                              cursor: 'pointer',
                              transition: 'background-color 0.2s ease',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '32px',
                              height: '32px',
                              fontSize: '14px'
                            }}
                            onClick={() => handleToggleActive(medication.id)}
                            onMouseEnter={(e) => e.target.style.backgroundColor = medication.active ? '#e67e22' : '#229954'}
                            onMouseLeave={(e) => e.target.style.backgroundColor = medication.active ? '#f39c12' : '#27ae60'}
                            title={medication.active ? 'Deactivate' : 'Activate'}
                          >
                            {medication.active ? '⏸️' : '▶️'}
                          </button>
                          <button 
                            style={{ 
                              padding: '8px',
                              borderRadius: '6px',
                              border: 'none',
                              backgroundColor: '#e74c3c',
                              color: '#ffffff',
                              cursor: 'pointer',
                              transition: 'background-color 0.2s ease',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '32px',
                              height: '32px',
                              fontSize: '14px'
                            }}
                            onClick={() => handleDeleteMedication(medication.id)}
                            onMouseEnter={(e) => e.target.style.backgroundColor = '#c0392b'}
                            onMouseLeave={(e) => e.target.style.backgroundColor = '#e74c3c'}
                            title="Delete"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div>
              <p style={{ color: '#666', textAlign: 'center', padding: '2rem' }}>
                Medication schedules management coming soon...
              </p>
            </div>
          )}

          {medications.length === 0 && activeTab !== 'schedules' && (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
              No {activeTab} medications found.
            </div>
          )}
        </div>
      </div>

      {/* Medication Schedule Management */}
      {showScheduleFor && (
        <MedicationScheduleView
          med={showScheduleFor}
          onBack={() => setShowScheduleFor(null)}
          fetchMedications={fetchData}
          loading={loading}
          setLoading={setLoading}
          patients={patients}
          currentPatientId={selectedPatientId || currentPatientId}
        />
      )}
    </div>
  );
};

export default AdminMedications;
