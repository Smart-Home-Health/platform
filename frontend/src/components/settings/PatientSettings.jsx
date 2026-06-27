/*
 * Smart Home Health
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
import { patientService } from '../../services/patients';

const PatientSettings = () => {
  const [patients, setPatients] = useState([]);
  const [currentPatient, setCurrentPatient] = useState(null);
  const [selectedPatientId, setSelectedPatientId] = useState(null); // Local state for UI
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingPatient, setEditingPatient] = useState(null);

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    date_of_birth: '',
    medical_record_number: '',
    notes: ''
  });

  useEffect(() => {
    loadPatients();
    loadCurrentPatient();
  }, []);

  useEffect(() => {
    // Set selected patient ID when current patient loads
    if (currentPatient) {
      setSelectedPatientId(currentPatient.id);
    }
  }, [currentPatient]);

  const loadPatients = async () => {
    try {
      setIsLoading(true);
      const patientsData = await patientService.getPatients();
      setPatients(patientsData);
    } catch (err) {
      setError('Failed to load patients: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const loadCurrentPatient = async () => {
    try {
      const current = await patientService.getCurrentPatient();
      setCurrentPatient(current);
    } catch (err) {
      console.error('Failed to load current patient:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setError(null);
      
      const patientData = {
        ...formData,
        date_of_birth: formData.date_of_birth || null
      };

      if (editingPatient) {
        await patientService.updatePatient(editingPatient.id, patientData);
        setSuccess('Patient updated successfully');
      } else {
        await patientService.createPatient(patientData);
        setSuccess('Patient created successfully');
      }

      resetForm();
      loadPatients();
      
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  const resetForm = () => {
    setFormData({
      first_name: '',
      last_name: '',
      date_of_birth: '',
      medical_record_number: '',
      notes: ''
    });
    setShowAddForm(false);
    setEditingPatient(null);
  };

  const handleEdit = (patient) => {
    setFormData({
      first_name: patient.first_name,
      last_name: patient.last_name,
      date_of_birth: patient.date_of_birth ? patient.date_of_birth.split('T')[0] : '',
      medical_record_number: patient.medical_record_number || '',
      notes: patient.notes || ''
    });
    setEditingPatient(patient);
    setShowAddForm(true);
  };

  const handleDeactivate = async (patientId) => {
    if (window.confirm('Are you sure you want to deactivate this patient?')) {
      try {
        await patientService.deactivatePatient(patientId);
        setSuccess('Patient deactivated successfully');
        loadPatients();
        setTimeout(() => setSuccess(''), 3000);
      } catch (err) {
        setError(err.message);
      }
    }
  };

  const handleSetCurrent = async (patientId) => {
    try {
      await patientService.setCurrentPatient(patientId);
      setSuccess('Current patient updated successfully');
      loadCurrentPatient(); // Reload current patient info
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCurrentPatientChange = (patientId) => {
    console.log('Patient selection changed to:', patientId);
    setSelectedPatientId(patientId);
  };

  const saveCurrentPatientSelection = async () => {
    if (!selectedPatientId || selectedPatientId === currentPatient?.id) {
      return; // No change needed
    }
    
    try {
      console.log('Saving current patient selection:', selectedPatientId);
      await patientService.setCurrentPatient(selectedPatientId);
      await loadCurrentPatient(); // Reload current patient info
      setSuccess('Current patient updated successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Error setting current patient:', err);
      setError('Failed to set current patient: ' + err.message);
      // Reset to previous selection on error
      setSelectedPatientId(currentPatient?.id);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Not specified';
    return new Date(dateString).toLocaleDateString();
  };

  if (isLoading) {
    return <div className="text-center">Loading patients...</div>;
  }

  return (
    <div className="container-fluid">
      <div className="row">
        <div className="col-12">
          <h4>Patient Management</h4>
          
          {/* Custom inline notifications - not Bootstrap alerts */}
          {error && (
            <div style={{
              backgroundColor: '#f8d7da',
              border: '1px solid #f5c6cb',
              color: '#721c24',
              padding: '12px 16px',
              borderRadius: '6px',
              marginBottom: '16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span><strong>Error:</strong> {error}</span>
              <button 
                onClick={() => setError(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#721c24',
                  fontSize: '20px',
                  cursor: 'pointer',
                  padding: '0',
                  marginLeft: '10px'
                }}
              >
                ×
              </button>
            </div>
          )}
          
          {success && (
            <div style={{
              backgroundColor: '#d4edda',
              border: '1px solid #c3e6cb',
              color: '#155724',
              padding: '12px 16px',
              borderRadius: '6px',
              marginBottom: '16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span><strong>Success:</strong> {success}</span>
              <button 
                onClick={() => setSuccess('')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#155724',
                  fontSize: '20px',
                  cursor: 'pointer',
                  padding: '0',
                  marginLeft: '10px'
                }}
              >
                ×
              </button>
            </div>
          )}

          {/* Patient Selection Change Notification */}
          {selectedPatientId && selectedPatientId !== currentPatient?.id && (
            <div style={{
              backgroundColor: '#fff3cd',
              border: '1px solid #ffecb5',
              color: '#856404',
              padding: '12px 16px',
              borderRadius: '6px',
              marginBottom: '16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span>
                <strong>Unsaved Changes:</strong> You have selected a different patient for dashboard tracking. 
                Scroll down to save your changes.
              </span>
              <button 
                onClick={() => setSelectedPatientId(currentPatient?.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#856404',
                  fontSize: '20px',
                  cursor: 'pointer',
                  padding: '0',
                  marginLeft: '10px'
                }}
                title="Cancel changes"
              >
                ×
              </button>
            </div>
          )}

          {/* Current Patient Info */}
          {currentPatient && (
            <div className="card mb-3">
              <div className="card-header">
                <h5>Current Patient (Dashboard Tracking)</h5>
              </div>
              <div className="card-body">
                <h6>{currentPatient.first_name} {currentPatient.last_name}</h6>
                <p className="mb-1">
                  <strong>DOB:</strong> {formatDate(currentPatient.date_of_birth)}<br/>
                  <strong>MRN:</strong> {currentPatient.medical_record_number || 'Not specified'}<br/>
                  {currentPatient.notes && (
                    <>
                      <strong>Notes:</strong> {currentPatient.notes}
                    </>
                  )}
                </p>
                <small className="text-muted">
                  This patient's data is currently being tracked on the dashboard. Use the checkboxes below to select a different patient, then click "Save Patient Selection" to apply changes.
                </small>
                {selectedPatientId && selectedPatientId !== currentPatient.id && (
                  <div className="mt-2">
                    <span style={{
                      backgroundColor: '#ffc107',
                      color: '#212529',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '12px'
                    }}>Unsaved selection</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Save Selection Button */}
          {selectedPatientId && selectedPatientId !== currentPatient?.id && (
            <div className="mb-3">
              <button 
                className="btn btn-primary me-2"
                onClick={saveCurrentPatientSelection}
              >
                Save Patient Selection
              </button>
              <button 
                className="btn btn-secondary"
                onClick={() => setSelectedPatientId(currentPatient?.id)}
              >
                Cancel Changes
              </button>
            </div>
          )}

          {/* Add/Edit Patient Form */}
          {showAddForm && (
            <div className="card mb-3">
              <div className="card-header">
                <h5>{editingPatient ? 'Edit Patient' : 'Add New Patient'}</h5>
              </div>
              <div className="card-body">
                <form onSubmit={handleSubmit}>
                  <div className="row">
                    <div className="col-md-6">
                      <div className="mb-3">
                        <label className="form-label">First Name *</label>
                        <input
                          type="text"
                          className="form-control"
                          value={formData.first_name}
                          onChange={(e) => setFormData({...formData, first_name: e.target.value})}
                          required
                        />
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="mb-3">
                        <label className="form-label">Last Name</label>
                        <input
                          type="text"
                          className="form-control"
                          value={formData.last_name}
                          onChange={(e) => setFormData({...formData, last_name: e.target.value})}
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div className="row">
                    <div className="col-md-6">
                      <div className="mb-3">
                        <label className="form-label">Date of Birth</label>
                        <input
                          type="date"
                          className="form-control"
                          value={formData.date_of_birth}
                          onChange={(e) => setFormData({...formData, date_of_birth: e.target.value})}
                        />
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="mb-3">
                        <label className="form-label">Medical Record Number</label>
                        <input
                          type="text"
                          className="form-control"
                          value={formData.medical_record_number}
                          onChange={(e) => setFormData({...formData, medical_record_number: e.target.value})}
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div className="mb-3">
                    <label className="form-label">Notes</label>
                    <textarea
                      className="form-control"
                      rows="3"
                      value={formData.notes}
                      onChange={(e) => setFormData({...formData, notes: e.target.value})}
                    />
                  </div>
                  
                  <div className="d-flex gap-2">
                    <button type="submit" className="btn btn-primary">
                      {editingPatient ? 'Update Patient' : 'Add Patient'}
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={resetForm}>
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Add Patient Button */}
          {!showAddForm && (
            <div className="mb-3">
              <button 
                className="btn btn-success"
                onClick={() => setShowAddForm(true)}
              >
                Add New Patient
              </button>
            </div>
          )}

          {/* Patients List */}
          <div className="card">
            <div className="card-header">
              <h5>All Patients ({patients.length})</h5>
            </div>
            <div className="card-body">
              {patients.length === 0 ? (
                <p>No patients found.</p>
              ) : (
                <div className="table-responsive">
                  <table className="table table-striped">
                    <thead>
                      <tr>
                        <th>Current</th>
                        <th>Name</th>
                        <th>Date of Birth</th>
                        <th>MRN</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {patients.map(patient => (
                        <tr key={patient.id}>
                          <td>
                            <div className="form-check">
                              <input
                                className="form-check-input"
                                type="checkbox"
                                checked={selectedPatientId === patient.id}
                                onChange={(e) => {
                                  console.log('Checkbox changed for patient:', patient.id, 'checked:', e.target.checked);
                                  if (e.target.checked) {
                                    handleCurrentPatientChange(patient.id);
                                  }
                                }}
                                disabled={!patient.is_active}
                                title={patient.is_active ? "Select this patient for dashboard tracking" : "Patient must be active to select"}
                                style={{ cursor: patient.is_active ? 'pointer' : 'not-allowed' }}
                              />
                            </div>
                          </td>
                          <td>
                            {patient.first_name} {patient.last_name}
                            {currentPatient && currentPatient.id === patient.id && (
                              <span style={{
                                backgroundColor: '#0d6efd',
                                color: 'white',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '12px',
                                marginLeft: '8px'
                              }}>Current</span>
                            )}
                            {selectedPatientId === patient.id && selectedPatientId !== currentPatient?.id && (
                              <span style={{
                                backgroundColor: '#ffc107',
                                color: '#212529',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '12px',
                                marginLeft: '8px'
                              }}>Selected</span>
                            )}
                          </td>
                          <td>{formatDate(patient.date_of_birth)}</td>
                          <td>{patient.medical_record_number || 'Not specified'}</td>
                          <td>
                            <span style={{
                              backgroundColor: patient.is_active ? '#198754' : '#6c757d',
                              color: 'white',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              fontSize: '12px'
                            }}>
                              {patient.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td>
                            <div className="btn-group btn-group-sm">
                              <button
                                className="btn btn-outline-primary"
                                onClick={() => handleEdit(patient)}
                              >
                                Edit
                              </button>
                              {patient.is_active && (
                                <button
                                  className="btn btn-outline-danger"
                                  onClick={() => handleDeactivate(patient.id)}
                                >
                                  Deactivate
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PatientSettings;
