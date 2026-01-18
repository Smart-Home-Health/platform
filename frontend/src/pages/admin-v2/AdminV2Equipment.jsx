import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import config from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import {
  PlusIcon,
  EditIcon,
  TrashIcon,
  XIcon,
  EquipmentIcon,
  ClockIcon,
  CheckIcon,
  RefreshIcon
} from '../../components/Icons';
import './AdminV2.css';

const AdminV2Equipment = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Patient state
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [showPatientModal, setShowPatientModal] = useState(false);
  const [loadingPatients, setLoadingPatients] = useState(true);
  
  // Equipment state
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showChangeModal, setShowChangeModal] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [selectedEquipment, setSelectedEquipment] = useState(null);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    quantity: 1,
    scheduled_replacement: true,
    last_changed: new Date().toISOString().split('T')[0],
    useful_days: 30
  });
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  
  // Quantity modal state
  const [quantityAmount, setQuantityAmount] = useState(1);

  // Permission helper
  const hasPermission = (permission) => {
    if (!user) return false;
    if (user.is_system_admin) return true;
    return user.permissions?.includes(permission) || false;
  };

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

  // Fetch equipment when patient is selected
  useEffect(() => {
    if (selectedPatient) {
      fetchEquipment();
    }
  }, [selectedPatient]);

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
      setLoading(true);
      setError(null);
      const response = await fetch(`${config.apiUrl}/api/equipment?patient_id=${selectedPatient.id}`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setEquipment(data);
      } else {
        setError('Failed to load equipment');
      }
    } catch (err) {
      setError('Error connecting to server');
      console.error('Error fetching equipment:', err);
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

  const getInitials = (firstName, lastName) => {
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
  };

  const resetForm = () => {
    setFormData({
      name: '',
      quantity: 1,
      scheduled_replacement: true,
      last_changed: new Date().toISOString().split('T')[0],
      useful_days: 30
    });
    setFormError(null);
  };

  const handleCreateEquipment = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    
    try {
      const payload = {
        name: formData.name,
        quantity: parseInt(formData.quantity),
        scheduled_replacement: formData.scheduled_replacement,
        patient_id: selectedPatient.id
      };
      
      if (formData.scheduled_replacement) {
        payload.last_changed = formData.last_changed;
        payload.useful_days = parseInt(formData.useful_days);
      }
      
      const response = await fetch(`${config.apiUrl}/api/equipment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      
      if (response.ok) {
        setShowCreateModal(false);
        resetForm();
        fetchEquipment();
      } else {
        const errorData = await response.json();
        setFormError(errorData.detail || 'Failed to create equipment');
      }
    } catch (err) {
      setFormError('Error connecting to server');
    } finally {
      setSaving(false);
    }
  };

  const handleEditEquipment = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    
    try {
      const payload = {
        name: formData.name,
        quantity: parseInt(formData.quantity),
        scheduled_replacement: formData.scheduled_replacement
      };
      
      if (formData.scheduled_replacement) {
        payload.last_changed = formData.last_changed;
        payload.useful_days = parseInt(formData.useful_days);
      }
      
      const response = await fetch(`${config.apiUrl}/api/equipment/${selectedEquipment.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      
      if (response.ok) {
        setShowEditModal(false);
        setSelectedEquipment(null);
        resetForm();
        fetchEquipment();
      } else {
        const errorData = await response.json();
        setFormError(errorData.detail || 'Failed to update equipment');
      }
    } catch (err) {
      setFormError('Error connecting to server');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEquipment = async () => {
    setSaving(true);
    try {
      const response = await fetch(`${config.apiUrl}/api/equipment/${selectedEquipment.id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      
      if (response.ok) {
        setShowDeleteModal(false);
        setSelectedEquipment(null);
        fetchEquipment();
      } else {
        alert('Failed to delete equipment');
      }
    } catch (err) {
      alert('Error connecting to server');
    } finally {
      setSaving(false);
    }
  };

  const handleChangeEquipment = async () => {
    setSaving(true);
    try {
      const response = await fetch(`${config.apiUrl}/api/equipment/${selectedEquipment.id}/change`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          changed_at: new Date().toISOString(),
          patient_id: selectedPatient.id
        })
      });
      
      if (response.ok) {
        setShowChangeModal(false);
        setSelectedEquipment(null);
        fetchEquipment();
      } else {
        const errorData = await response.json();
        alert(errorData.detail || 'Failed to mark as changed');
      }
    } catch (err) {
      alert('Error connecting to server');
    } finally {
      setSaving(false);
    }
  };

  const handleReceiveEquipment = async () => {
    setSaving(true);
    try {
      const response = await fetch(`${config.apiUrl}/api/equipment/${selectedEquipment.id}/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ amount: parseInt(quantityAmount) })
      });
      
      if (response.ok) {
        setShowReceiveModal(false);
        setSelectedEquipment(null);
        setQuantityAmount(1);
        fetchEquipment();
      } else {
        alert('Failed to receive equipment');
      }
    } catch (err) {
      alert('Error connecting to server');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenEquipment = async () => {
    setSaving(true);
    try {
      if (quantityAmount > selectedEquipment.quantity) {
        alert(`Cannot open ${quantityAmount} items. Only ${selectedEquipment.quantity} available.`);
        setSaving(false);
        return;
      }
      
      const response = await fetch(`${config.apiUrl}/api/equipment/${selectedEquipment.id}/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ amount: parseInt(quantityAmount) })
      });
      
      if (response.ok) {
        setShowOpenModal(false);
        setSelectedEquipment(null);
        setQuantityAmount(1);
        fetchEquipment();
      } else {
        alert('Failed to open equipment');
      }
    } catch (err) {
      alert('Error connecting to server');
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = (equip) => {
    setSelectedEquipment(equip);
    setFormData({
      name: equip.name,
      quantity: equip.quantity,
      scheduled_replacement: equip.scheduled_replacement,
      last_changed: equip.last_changed ? equip.last_changed.split('T')[0] : new Date().toISOString().split('T')[0],
      useful_days: equip.useful_days || 30
    });
    setShowEditModal(true);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString();
  };

  const isDue = (item) => {
    if (!item.scheduled_replacement || !item.due_date) return false;
    return new Date(item.due_date) <= new Date();
  };

  const getDaysUntilDue = (item) => {
    if (!item.due_date) return null;
    const due = new Date(item.due_date);
    const today = new Date();
    const diff = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
    return diff;
  };

  // Stats
  const stats = {
    total: equipment.length,
    scheduled: equipment.filter(e => e.scheduled_replacement).length,
    due: equipment.filter(isDue).length,
    lowStock: equipment.filter(e => e.quantity <= 2).length
  };

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

            {/* Section Title */}
            <h1 className="schedule-section-title">Equipment Management</h1>

            {/* Stats Row */}
            <div className="admin-v2-stats-row">
              <div className="admin-v2-stat-card">
                <div className="admin-v2-stat-icon" style={{ background: 'rgba(88, 166, 255, 0.15)' }}>
                  <EquipmentIcon size={20} />
                </div>
                <div className="admin-v2-stat-info">
                  <h4>{stats.total}</h4>
                  <p>Total Items</p>
                </div>
              </div>
              <div className="admin-v2-stat-card">
                <div className="admin-v2-stat-icon" style={{ background: 'rgba(31, 111, 235, 0.15)' }}>
                  <ClockIcon size={20} />
                </div>
                <div className="admin-v2-stat-info">
                  <h4>{stats.scheduled}</h4>
                  <p>Scheduled</p>
                </div>
              </div>
              <div className="admin-v2-stat-card">
                <div className="admin-v2-stat-icon" style={{ background: 'rgba(248, 81, 73, 0.15)' }}>
                  <ClockIcon size={20} />
                </div>
                <div className="admin-v2-stat-info">
                  <h4>{stats.due}</h4>
                  <p>Due Now</p>
                </div>
              </div>
              <div className="admin-v2-stat-card">
                <div className="admin-v2-stat-icon" style={{ background: 'rgba(158, 106, 3, 0.15)' }}>
                  <EquipmentIcon size={20} />
                </div>
                <div className="admin-v2-stat-info">
                  <h4>{stats.lowStock}</h4>
                  <p>Low Stock</p>
                </div>
              </div>
            </div>

            {/* Action Bar */}
            <div className="admin-v2-page-header">
              <h3 style={{ margin: 0, color: '#e6edf3' }}>
                Equipment ({equipment.length})
              </h3>
              {hasPermission('equipment.create') && (
                <button
                  className="admin-v2-btn admin-v2-btn-primary"
                  onClick={() => { resetForm(); setShowCreateModal(true); }}
                >
                  <PlusIcon size={16} /> Add Equipment
                </button>
              )}
            </div>

            {/* Equipment Table */}
            {loading ? (
              <div className="admin-v2-loading">Loading equipment...</div>
            ) : error ? (
              <div className="admin-v2-error">{error}</div>
            ) : equipment.length === 0 ? (
              <div className="admin-v2-empty-state">
                <EquipmentIcon size={48} />
                <h3>No Equipment Found</h3>
                <p className="admin-v2-text-muted">Add equipment for this patient to get started.</p>
                {hasPermission('equipment.create') && (
                  <button
                    className="admin-v2-btn admin-v2-btn-primary"
                    onClick={() => { resetForm(); setShowCreateModal(true); }}
                  >
                    <PlusIcon size={16} /> Add Equipment
                  </button>
                )}
              </div>
            ) : (
              <div className="admin-v2-table-container">
                <table className="admin-v2-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Quantity</th>
                      <th>Type</th>
                      <th>Last Changed</th>
                      <th>Useful Days</th>
                      <th>Due Date</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {equipment.map(equip => {
                      const daysUntil = getDaysUntilDue(equip);
                      const isOverdue = isDue(equip);
                      const isLowStock = equip.quantity <= 2;
                      
                      return (
                        <tr 
                          key={equip.id} 
                          className={isOverdue ? 'admin-v2-row-warning' : ''}
                        >
                          <td>
                            <span className="admin-v2-equipment-name">{equip.name}</span>
                          </td>
                          <td>
                            <span className={`admin-v2-quantity ${isLowStock ? 'low' : ''}`}>
                              {equip.quantity}
                            </span>
                          </td>
                          <td>
                            {equip.scheduled_replacement ? (
                              <span className="admin-v2-badge admin-v2-badge-info">Scheduled</span>
                            ) : (
                              <span className="admin-v2-badge admin-v2-badge-secondary">Consumable</span>
                            )}
                          </td>
                          <td>{equip.scheduled_replacement ? formatDate(equip.last_changed) : '-'}</td>
                          <td>{equip.scheduled_replacement ? (equip.useful_days || '-') : '-'}</td>
                          <td>
                            {equip.scheduled_replacement ? (
                              <span className={isOverdue ? 'admin-v2-text-danger' : ''}>
                                {formatDate(equip.due_date)}
                              </span>
                            ) : '-'}
                          </td>
                          <td>
                            {equip.scheduled_replacement ? (
                              isOverdue ? (
                                <span className="admin-v2-badge admin-v2-badge-danger">Due Now</span>
                              ) : daysUntil !== null && daysUntil <= 7 ? (
                                <span className="admin-v2-badge admin-v2-badge-warning">Due Soon</span>
                              ) : (
                                <span className="admin-v2-badge admin-v2-badge-success">OK</span>
                              )
                            ) : (
                              isLowStock ? (
                                <span className="admin-v2-badge admin-v2-badge-warning">Low Stock</span>
                              ) : (
                                <span className="admin-v2-badge admin-v2-badge-success">In Stock</span>
                              )
                            )}
                          </td>
                          <td>
                            <div className="admin-v2-action-buttons">
                              {equip.scheduled_replacement ? (
                                <button
                                  className="admin-v2-btn admin-v2-btn-sm admin-v2-btn-primary"
                                  onClick={() => { setSelectedEquipment(equip); setShowChangeModal(true); }}
                                  title="Mark as Changed"
                                >
                                  Change
                                </button>
                              ) : (
                                <button
                                  className="admin-v2-btn admin-v2-btn-sm admin-v2-btn-info"
                                  onClick={() => { setSelectedEquipment(equip); setQuantityAmount(1); setShowOpenModal(true); }}
                                  title="Open/Use"
                                >
                                  Open
                                </button>
                              )}
                              <button
                                className="admin-v2-btn admin-v2-btn-sm admin-v2-btn-success"
                                onClick={() => { setSelectedEquipment(equip); setQuantityAmount(1); setShowReceiveModal(true); }}
                                title="Receive Stock"
                              >
                                Receive
                              </button>
                              {hasPermission('equipment.update') && (
                                <button
                                  className="admin-v2-btn admin-v2-btn-sm"
                                  onClick={() => openEditModal(equip)}
                                  title="Edit"
                                >
                                  <EditIcon size={14} />
                                </button>
                              )}
                              {hasPermission('equipment.delete') && (
                                <button
                                  className="admin-v2-btn admin-v2-btn-sm admin-v2-btn-danger"
                                  onClick={() => { setSelectedEquipment(equip); setShowDeleteModal(true); }}
                                  title="Delete"
                                >
                                  <TrashIcon size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <div className="admin-v2-no-patient">
            <EquipmentIcon size={48} />
            <h2>Select a Patient</h2>
            <p>Choose a patient to view and manage their equipment</p>
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

        {/* Create Equipment Modal */}
        {showCreateModal && (
          <div className="admin-v2-modal-overlay" onClick={() => setShowCreateModal(false)}>
            <div className="admin-v2-modal" onClick={e => e.stopPropagation()}>
              <div className="admin-v2-modal-header">
                <h2>Add Equipment</h2>
                <button className="admin-v2-modal-close" onClick={() => setShowCreateModal(false)}>
                  <XIcon size={20} />
                </button>
              </div>
              <form onSubmit={handleCreateEquipment}>
                <div className="admin-v2-modal-body">
                  {formError && (
                    <div className="admin-v2-form-error">{formError}</div>
                  )}
                  
                  <div className="admin-v2-form-group">
                    <label>Equipment Name *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={e => setFormData({...formData, name: e.target.value})}
                      required
                      placeholder="e.g., Trach Tube"
                    />
                  </div>

                  <div className="admin-v2-form-row">
                    <div className="admin-v2-form-group">
                      <label>Quantity *</label>
                      <input
                        type="number"
                        value={formData.quantity}
                        onChange={e => setFormData({...formData, quantity: parseInt(e.target.value) || 1})}
                        required
                        min="0"
                      />
                    </div>
                    <div className="admin-v2-form-group">
                      <label>Type</label>
                      <div className="admin-v2-checkbox-group" style={{ marginTop: '0.5rem' }}>
                        <label className="admin-v2-checkbox">
                          <input
                            type="checkbox"
                            checked={formData.scheduled_replacement}
                            onChange={e => setFormData({...formData, scheduled_replacement: e.target.checked})}
                          />
                          <span>Has Scheduled Replacement</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  {formData.scheduled_replacement && (
                    <div className="admin-v2-form-row">
                      <div className="admin-v2-form-group">
                        <label>Last Changed *</label>
                        <input
                          type="date"
                          value={formData.last_changed}
                          onChange={e => setFormData({...formData, last_changed: e.target.value})}
                          required={formData.scheduled_replacement}
                        />
                      </div>
                      <div className="admin-v2-form-group">
                        <label>Useful Days *</label>
                        <input
                          type="number"
                          value={formData.useful_days}
                          onChange={e => setFormData({...formData, useful_days: parseInt(e.target.value) || 30})}
                          required={formData.scheduled_replacement}
                          min="1"
                          placeholder="30"
                        />
                      </div>
                    </div>
                  )}
                </div>
                <div className="admin-v2-modal-footer">
                  <button type="button" className="admin-v2-btn" onClick={() => setShowCreateModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="admin-v2-btn admin-v2-btn-primary" disabled={saving}>
                    {saving ? 'Creating...' : 'Create Equipment'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Equipment Modal */}
        {showEditModal && (
          <div className="admin-v2-modal-overlay" onClick={() => setShowEditModal(false)}>
            <div className="admin-v2-modal" onClick={e => e.stopPropagation()}>
              <div className="admin-v2-modal-header">
                <h2>Edit Equipment</h2>
                <button className="admin-v2-modal-close" onClick={() => setShowEditModal(false)}>
                  <XIcon size={20} />
                </button>
              </div>
              <form onSubmit={handleEditEquipment}>
                <div className="admin-v2-modal-body">
                  {formError && (
                    <div className="admin-v2-form-error">{formError}</div>
                  )}
                  
                  <div className="admin-v2-form-group">
                    <label>Equipment Name *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={e => setFormData({...formData, name: e.target.value})}
                      required
                    />
                  </div>

                  <div className="admin-v2-form-row">
                    <div className="admin-v2-form-group">
                      <label>Quantity *</label>
                      <input
                        type="number"
                        value={formData.quantity}
                        onChange={e => setFormData({...formData, quantity: parseInt(e.target.value) || 1})}
                        required
                        min="0"
                      />
                    </div>
                    <div className="admin-v2-form-group">
                      <label>Type</label>
                      <div className="admin-v2-checkbox-group" style={{ marginTop: '0.5rem' }}>
                        <label className="admin-v2-checkbox">
                          <input
                            type="checkbox"
                            checked={formData.scheduled_replacement}
                            onChange={e => setFormData({...formData, scheduled_replacement: e.target.checked})}
                          />
                          <span>Has Scheduled Replacement</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  {formData.scheduled_replacement && (
                    <div className="admin-v2-form-row">
                      <div className="admin-v2-form-group">
                        <label>Last Changed *</label>
                        <input
                          type="date"
                          value={formData.last_changed}
                          onChange={e => setFormData({...formData, last_changed: e.target.value})}
                          required={formData.scheduled_replacement}
                        />
                      </div>
                      <div className="admin-v2-form-group">
                        <label>Useful Days *</label>
                        <input
                          type="number"
                          value={formData.useful_days}
                          onChange={e => setFormData({...formData, useful_days: parseInt(e.target.value) || 30})}
                          required={formData.scheduled_replacement}
                          min="1"
                        />
                      </div>
                    </div>
                  )}
                </div>
                <div className="admin-v2-modal-footer">
                  <button type="button" className="admin-v2-btn" onClick={() => setShowEditModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="admin-v2-btn admin-v2-btn-primary" disabled={saving}>
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteModal && (
          <div className="admin-v2-modal-overlay" onClick={() => setShowDeleteModal(false)}>
            <div className="admin-v2-modal admin-v2-modal-sm" onClick={e => e.stopPropagation()}>
              <div className="admin-v2-modal-header">
                <h2>Delete Equipment</h2>
                <button className="admin-v2-modal-close" onClick={() => setShowDeleteModal(false)}>
                  <XIcon size={20} />
                </button>
              </div>
              <div className="admin-v2-modal-body">
                <p>Are you sure you want to delete <strong>{selectedEquipment?.name}</strong>?</p>
                <p className="admin-v2-text-muted">This action cannot be undone.</p>
              </div>
              <div className="admin-v2-modal-footer">
                <button className="admin-v2-btn" onClick={() => setShowDeleteModal(false)}>
                  Cancel
                </button>
                <button className="admin-v2-btn admin-v2-btn-danger" onClick={handleDeleteEquipment} disabled={saving}>
                  {saving ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Change Confirmation Modal */}
        {showChangeModal && (
          <div className="admin-v2-modal-overlay" onClick={() => setShowChangeModal(false)}>
            <div className="admin-v2-modal admin-v2-modal-sm" onClick={e => e.stopPropagation()}>
              <div className="admin-v2-modal-header">
                <h2>Confirm Change</h2>
                <button className="admin-v2-modal-close" onClick={() => setShowChangeModal(false)}>
                  <XIcon size={20} />
                </button>
              </div>
              <div className="admin-v2-modal-body">
                <p>Mark <strong>{selectedEquipment?.name}</strong> as changed?</p>
                <p className="admin-v2-text-muted">This will reset the due date based on the useful days.</p>
              </div>
              <div className="admin-v2-modal-footer">
                <button className="admin-v2-btn" onClick={() => setShowChangeModal(false)}>
                  Cancel
                </button>
                <button className="admin-v2-btn admin-v2-btn-primary" onClick={handleChangeEquipment} disabled={saving}>
                  {saving ? 'Updating...' : 'Confirm Change'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Receive Stock Modal */}
        {showReceiveModal && (
          <div className="admin-v2-modal-overlay" onClick={() => setShowReceiveModal(false)}>
            <div className="admin-v2-modal admin-v2-modal-sm" onClick={e => e.stopPropagation()}>
              <div className="admin-v2-modal-header">
                <h2>Receive Stock</h2>
                <button className="admin-v2-modal-close" onClick={() => setShowReceiveModal(false)}>
                  <XIcon size={20} />
                </button>
              </div>
              <div className="admin-v2-modal-body">
                <p>How many <strong>{selectedEquipment?.name}</strong> to receive?</p>
                <div className="admin-v2-form-group" style={{ marginTop: '1rem' }}>
                  <label>Quantity</label>
                  <input
                    type="number"
                    value={quantityAmount}
                    onChange={e => setQuantityAmount(parseInt(e.target.value) || 1)}
                    min="1"
                    autoFocus
                  />
                </div>
                <p className="admin-v2-text-muted">Current stock: {selectedEquipment?.quantity}</p>
              </div>
              <div className="admin-v2-modal-footer">
                <button className="admin-v2-btn" onClick={() => setShowReceiveModal(false)}>
                  Cancel
                </button>
                <button className="admin-v2-btn admin-v2-btn-success" onClick={handleReceiveEquipment} disabled={saving}>
                  {saving ? 'Updating...' : 'Receive'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Open/Use Stock Modal */}
        {showOpenModal && (
          <div className="admin-v2-modal-overlay" onClick={() => setShowOpenModal(false)}>
            <div className="admin-v2-modal admin-v2-modal-sm" onClick={e => e.stopPropagation()}>
              <div className="admin-v2-modal-header">
                <h2>Open/Use Equipment</h2>
                <button className="admin-v2-modal-close" onClick={() => setShowOpenModal(false)}>
                  <XIcon size={20} />
                </button>
              </div>
              <div className="admin-v2-modal-body">
                <p>How many <strong>{selectedEquipment?.name}</strong> to open/use?</p>
                <div className="admin-v2-form-group" style={{ marginTop: '1rem' }}>
                  <label>Quantity</label>
                  <input
                    type="number"
                    value={quantityAmount}
                    onChange={e => setQuantityAmount(parseInt(e.target.value) || 1)}
                    min="1"
                    max={selectedEquipment?.quantity}
                    autoFocus
                  />
                </div>
                <p className="admin-v2-text-muted">Available: {selectedEquipment?.quantity}</p>
              </div>
              <div className="admin-v2-modal-footer">
                <button className="admin-v2-btn" onClick={() => setShowOpenModal(false)}>
                  Cancel
                </button>
                <button className="admin-v2-btn admin-v2-btn-info" onClick={handleOpenEquipment} disabled={saving}>
                  {saving ? 'Updating...' : 'Open'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Equipment;
