import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import config from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
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
  const { 
    patients, 
    selectedPatient: contextPatient, 
    selectPatient: setContextPatient,
    loadingPatients 
  } = useAdminPatient();
  
  // Use context patient as the source of truth
  const selectedPatient = contextPatient;
  
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
    useful_days: 30,
    // Supply tracking fields
    item_number: '',
    description: '',
    category: 'equipment',
    tracking_level: 'quantity',
    default_manufacturer: '',
    unit_of_measure: '',
    unit_size: '',
    unit_description: '',
    reorder_point: '',
    par_level: ''
  });
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  
  // Toggle for advanced supply fields
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // Quantity modal state
  const [quantityAmount, setQuantityAmount] = useState(1);
  
  // Tab state for filtering by category
  const [activeTab, setActiveTab] = useState('all');

  // Permission helper
  const hasPermission = (permission) => {
    if (!user) return false;
    if (user.is_system_admin) return true;
    return user.permissions?.includes(permission) || false;
  };

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

  // Fetch equipment when patient is selected
  useEffect(() => {
    if (selectedPatient) {
      fetchEquipment();
    }
  }, [selectedPatient]);

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

  const resetForm = () => {
    setFormData({
      name: '',
      quantity: 1,
      scheduled_replacement: true,
      last_changed: new Date().toISOString().split('T')[0],
      useful_days: 30,
      item_number: '',
      description: '',
      category: 'equipment',
      tracking_level: 'quantity',
      default_manufacturer: '',
      unit_of_measure: '',
      unit_size: '',
      unit_description: '',
      reorder_point: '',
      par_level: ''
    });
    setFormError(null);
    setShowAdvanced(false);
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
        patient_id: selectedPatient.id,
        item_number: formData.item_number || null,
        description: formData.description || null,
        category: formData.category || 'equipment',
        tracking_level: formData.tracking_level || 'quantity',
        default_manufacturer: formData.default_manufacturer || null,
        unit_of_measure: formData.unit_of_measure || null,
        unit_size: formData.unit_size || null,
        unit_description: formData.unit_description || null,
        reorder_point: formData.reorder_point ? parseInt(formData.reorder_point) : null,
        par_level: formData.par_level ? parseInt(formData.par_level) : null
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
        scheduled_replacement: formData.scheduled_replacement,
        item_number: formData.item_number || null,
        description: formData.description || null,
        category: formData.category || 'equipment',
        tracking_level: formData.tracking_level || 'quantity',
        default_manufacturer: formData.default_manufacturer || null,
        unit_of_measure: formData.unit_of_measure || null,
        unit_size: formData.unit_size || null,
        unit_description: formData.unit_description || null,
        reorder_point: formData.reorder_point ? parseInt(formData.reorder_point) : null,
        par_level: formData.par_level ? parseInt(formData.par_level) : null
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
      useful_days: equip.useful_days || 30,
      item_number: equip.item_number || '',
      description: equip.description || '',
      category: equip.category || 'equipment',
      tracking_level: equip.tracking_level || 'quantity',
      default_manufacturer: equip.default_manufacturer || '',
      unit_of_measure: equip.unit_of_measure || '',
      unit_size: equip.unit_size || '',
      unit_description: equip.unit_description || '',
      reorder_point: equip.reorder_point || '',
      par_level: equip.par_level || ''
    });
    setShowAdvanced(!!equip.item_number || !!equip.default_manufacturer);
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

  // Filter equipment by active tab
  const getFilteredEquipment = () => {
    if (activeTab === 'all') return equipment;
    if (activeTab === 'equipment') return equipment.filter(e => e.category === 'equipment' && e.scheduled_replacement);
    if (activeTab === 'supply') return equipment.filter(e => e.category === 'supply');
    if (activeTab === 'consumable') return equipment.filter(e => e.category === 'equipment' && !e.scheduled_replacement);
    return equipment;
  };
  
  const filteredEquipment = getFilteredEquipment();

  // Category counts for tabs
  const categoryCounts = {
    all: equipment.length,
    equipment: equipment.filter(e => e.category === 'equipment' && e.scheduled_replacement).length,
    supply: equipment.filter(e => e.category === 'supply').length,
    consumable: equipment.filter(e => e.category === 'equipment' && !e.scheduled_replacement).length
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
            {/* Section Title */}
            <h1 className="schedule-section-title">Equipment Management</h1>

            {/* Stats Row */}
            <div className="admin-v2-summary-stats admin-v2-equipment-summary">
              <div className="admin-v2-stat-card">
                <div className="admin-v2-stat-icon equipment">
                  <EquipmentIcon size={24} />
                </div>
                <div className="admin-v2-stat-info">
                  <h4>{stats.total}</h4>
                  <p>Total Items</p>
                </div>
              </div>
              <div className="admin-v2-stat-card">
                <div className="admin-v2-stat-icon admin-v2-stat-icon-info">
                  <ClockIcon size={24} />
                </div>
                <div className="admin-v2-stat-info">
                  <h4>{stats.scheduled}</h4>
                  <p>Scheduled</p>
                </div>
              </div>
              <div className="admin-v2-stat-card">
                <div className="admin-v2-stat-icon alerts">
                  <ClockIcon size={24} />
                </div>
                <div className="admin-v2-stat-info">
                  <h4>{stats.due}</h4>
                  <p>Due Now</p>
                </div>
              </div>
              <div className="admin-v2-stat-card">
                <div className="admin-v2-stat-icon equipment">
                  <EquipmentIcon size={24} />
                </div>
                <div className="admin-v2-stat-info">
                  <h4>{stats.lowStock}</h4>
                  <p>Low Stock</p>
                </div>
              </div>
            </div>

            {/* Category Tabs */}
            <div className="admin-v2-tabs">
              <button
                className={`admin-v2-tab ${activeTab === 'all' ? 'active' : ''}`}
                onClick={() => setActiveTab('all')}
              >
                All <span className="admin-v2-tab-count">{categoryCounts.all}</span>
              </button>
              <button
                className={`admin-v2-tab ${activeTab === 'equipment' ? 'active' : ''}`}
                onClick={() => setActiveTab('equipment')}
              >
                Equipment <span className="admin-v2-tab-count">{categoryCounts.equipment}</span>
              </button>
              <button
                className={`admin-v2-tab ${activeTab === 'supply' ? 'active' : ''}`}
                onClick={() => setActiveTab('supply')}
              >
                Supplies <span className="admin-v2-tab-count">{categoryCounts.supply}</span>
              </button>
              <button
                className={`admin-v2-tab ${activeTab === 'consumable' ? 'active' : ''}`}
                onClick={() => setActiveTab('consumable')}
              >
                Consumables <span className="admin-v2-tab-count">{categoryCounts.consumable}</span>
              </button>
            </div>

            {/* Action Bar */}
            <div className="admin-v2-page-header">
              <h3 style={{ margin: 0, color: '#e6edf3' }}>
                {activeTab === 'all' ? 'All Items' : activeTab === 'equipment' ? 'Equipment' : activeTab === 'supply' ? 'Supplies' : 'Consumables'} ({filteredEquipment.length})
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
            ) : filteredEquipment.length === 0 ? (
              <div className="admin-v2-empty-state">
                <EquipmentIcon size={48} />
                <h3>No {activeTab === 'equipment' ? 'Equipment' : activeTab === 'supply' ? 'Supplies' : activeTab === 'consumable' ? 'Consumables' : 'Items'} Found</h3>
                <p className="admin-v2-text-muted">No items match this category.</p>
              </div>
            ) : (
              <div className="admin-v2-table-container">
                <table className="admin-v2-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Item #</th>
                      <th>Qty</th>
                      <th>Type</th>
                      <th>Last Changed</th>
                      <th>Due/Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEquipment.map(equip => {
                      const daysUntil = getDaysUntilDue(equip);
                      const isOverdue = isDue(equip);
                      const isLowStock = equip.reorder_point ? equip.quantity <= equip.reorder_point : equip.quantity <= 2;
                      
                      return (
                        <tr 
                          key={equip.id} 
                          className={isOverdue ? 'admin-v2-row-warning' : ''}
                        >
                          <td>
                            <span className="admin-v2-equipment-name">{equip.name}</span>
                            {equip.default_manufacturer && (
                              <div className="admin-v2-text-muted">{equip.default_manufacturer}</div>
                            )}
                          </td>
                          <td>{equip.item_number || '-'}</td>
                          <td>
                            <span className={`admin-v2-quantity ${isLowStock ? 'low' : ''}`}>
                              {equip.quantity}
                            </span>
                            {equip.unit_of_measure && (
                              <span className="admin-v2-text-small"> {equip.unit_of_measure}</span>
                            )}
                          </td>
                          <td>
                            {equip.category === 'supply' ? (
                              <span className="admin-v2-badge admin-v2-badge-secondary">Supply</span>
                            ) : equip.scheduled_replacement ? (
                              <span className="admin-v2-badge admin-v2-badge-info">Scheduled</span>
                            ) : (
                              <span className="admin-v2-badge admin-v2-badge-secondary">Consumable</span>
                            )}
                          </td>
                          <td>{equip.scheduled_replacement ? formatDate(equip.last_changed) : '-'}</td>
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
          <div className="admin-v2-loading">Select a patient from the sidebar</div>
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

                  {/* Supply Tracking Toggle */}
                  <div className="admin-v2-form-group" style={{ marginTop: '1rem', borderTop: '1px solid #30363d', paddingTop: '1rem' }}>
                    <label className="admin-v2-checkbox">
                      <input
                        type="checkbox"
                        checked={showAdvanced}
                        onChange={e => setShowAdvanced(e.target.checked)}
                      />
                      <span>Show Supply Tracking Options</span>
                    </label>
                  </div>

                  {showAdvanced && (
                    <>
                      <div className="admin-v2-form-row">
                        <div className="admin-v2-form-group">
                          <label>Item Number</label>
                          <input
                            type="text"
                            value={formData.item_number}
                            onChange={e => setFormData({...formData, item_number: e.target.value})}
                            placeholder="e.g., 6025"
                          />
                        </div>
                        <div className="admin-v2-form-group">
                          <label>Manufacturer</label>
                          <input
                            type="text"
                            value={formData.default_manufacturer}
                            onChange={e => setFormData({...formData, default_manufacturer: e.target.value})}
                            placeholder="e.g., Hollister"
                          />
                        </div>
                      </div>

                      <div className="admin-v2-form-group">
                        <label>Description</label>
                        <input
                          type="text"
                          value={formData.description}
                          onChange={e => setFormData({...formData, description: e.target.value})}
                          placeholder="Item description for shipments"
                        />
                      </div>

                      <div className="admin-v2-form-row">
                        <div className="admin-v2-form-group">
                          <label>Category</label>
                          <select
                            value={formData.category}
                            onChange={e => setFormData({...formData, category: e.target.value})}
                          >
                            <option value="equipment">Equipment</option>
                            <option value="supply">Supply</option>
                            <option value="medication">Medication</option>
                          </select>
                        </div>
                        <div className="admin-v2-form-group">
                          <label>Tracking Level</label>
                          <select
                            value={formData.tracking_level}
                            onChange={e => setFormData({...formData, tracking_level: e.target.value})}
                          >
                            <option value="quantity">Quantity Only</option>
                            <option value="lot">Lot Number</option>
                            <option value="serial">Serial Number</option>
                          </select>
                        </div>
                      </div>

                      <div className="admin-v2-form-row">
                        <div className="admin-v2-form-group">
                          <label>Unit of Measure</label>
                          <input
                            type="text"
                            value={formData.unit_of_measure}
                            onChange={e => setFormData({...formData, unit_of_measure: e.target.value})}
                            placeholder="e.g., Box, Pack"
                          />
                        </div>
                        <div className="admin-v2-form-group">
                          <label>Unit Size</label>
                          <input
                            type="text"
                            value={formData.unit_size}
                            onChange={e => setFormData({...formData, unit_size: e.target.value})}
                            placeholder="e.g., 10"
                          />
                        </div>
                      </div>

                      <div className="admin-v2-form-group">
                        <label>Unit Description</label>
                        <input
                          type="text"
                          value={formData.unit_description}
                          onChange={e => setFormData({...formData, unit_description: e.target.value})}
                          placeholder="e.g., Box of 10"
                        />
                      </div>

                      <div className="admin-v2-form-row">
                        <div className="admin-v2-form-group">
                          <label>Reorder Point</label>
                          <input
                            type="number"
                            min="0"
                            value={formData.reorder_point}
                            onChange={e => setFormData({...formData, reorder_point: e.target.value})}
                            placeholder="Low stock alert"
                          />
                        </div>
                        <div className="admin-v2-form-group">
                          <label>Par Level</label>
                          <input
                            type="number"
                            min="0"
                            value={formData.par_level}
                            onChange={e => setFormData({...formData, par_level: e.target.value})}
                            placeholder="Target quantity"
                          />
                        </div>
                      </div>
                    </>
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

                  {/* Supply Tracking Toggle */}
                  <div className="admin-v2-form-group" style={{ marginTop: '1rem', borderTop: '1px solid #30363d', paddingTop: '1rem' }}>
                    <label className="admin-v2-checkbox">
                      <input
                        type="checkbox"
                        checked={showAdvanced}
                        onChange={e => setShowAdvanced(e.target.checked)}
                      />
                      <span>Show Supply Tracking Options</span>
                    </label>
                  </div>

                  {showAdvanced && (
                    <>
                      <div className="admin-v2-form-row">
                        <div className="admin-v2-form-group">
                          <label>Item Number</label>
                          <input
                            type="text"
                            value={formData.item_number}
                            onChange={e => setFormData({...formData, item_number: e.target.value})}
                            placeholder="e.g., 6025"
                          />
                        </div>
                        <div className="admin-v2-form-group">
                          <label>Manufacturer</label>
                          <input
                            type="text"
                            value={formData.default_manufacturer}
                            onChange={e => setFormData({...formData, default_manufacturer: e.target.value})}
                            placeholder="e.g., Hollister"
                          />
                        </div>
                      </div>

                      <div className="admin-v2-form-group">
                        <label>Description</label>
                        <input
                          type="text"
                          value={formData.description}
                          onChange={e => setFormData({...formData, description: e.target.value})}
                          placeholder="Item description for shipments"
                        />
                      </div>

                      <div className="admin-v2-form-row">
                        <div className="admin-v2-form-group">
                          <label>Category</label>
                          <select
                            value={formData.category}
                            onChange={e => setFormData({...formData, category: e.target.value})}
                          >
                            <option value="equipment">Equipment</option>
                            <option value="supply">Supply</option>
                            <option value="medication">Medication</option>
                          </select>
                        </div>
                        <div className="admin-v2-form-group">
                          <label>Tracking Level</label>
                          <select
                            value={formData.tracking_level}
                            onChange={e => setFormData({...formData, tracking_level: e.target.value})}
                          >
                            <option value="quantity">Quantity Only</option>
                            <option value="lot">Lot Number</option>
                            <option value="serial">Serial Number</option>
                          </select>
                        </div>
                      </div>

                      <div className="admin-v2-form-row">
                        <div className="admin-v2-form-group">
                          <label>Unit of Measure</label>
                          <input
                            type="text"
                            value={formData.unit_of_measure}
                            onChange={e => setFormData({...formData, unit_of_measure: e.target.value})}
                            placeholder="e.g., Box, Pack"
                          />
                        </div>
                        <div className="admin-v2-form-group">
                          <label>Unit Size</label>
                          <input
                            type="text"
                            value={formData.unit_size}
                            onChange={e => setFormData({...formData, unit_size: e.target.value})}
                            placeholder="e.g., 10"
                          />
                        </div>
                      </div>

                      <div className="admin-v2-form-group">
                        <label>Unit Description</label>
                        <input
                          type="text"
                          value={formData.unit_description}
                          onChange={e => setFormData({...formData, unit_description: e.target.value})}
                          placeholder="e.g., Box of 10"
                        />
                      </div>

                      <div className="admin-v2-form-row">
                        <div className="admin-v2-form-group">
                          <label>Reorder Point</label>
                          <input
                            type="number"
                            min="0"
                            value={formData.reorder_point}
                            onChange={e => setFormData({...formData, reorder_point: e.target.value})}
                            placeholder="Low stock alert"
                          />
                        </div>
                        <div className="admin-v2-form-group">
                          <label>Par Level</label>
                          <input
                            type="number"
                            min="0"
                            value={formData.par_level}
                            onChange={e => setFormData({...formData, par_level: e.target.value})}
                            placeholder="Target quantity"
                          />
                        </div>
                      </div>
                    </>
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
