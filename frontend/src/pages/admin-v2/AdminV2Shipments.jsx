import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import config from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import {
  PlusIcon,
  XIcon,
  EquipmentIcon,
  ClockIcon,
  CheckIcon,
  ChevronRightIcon,
  AlertIcon,
  CopyIcon
} from '../../components/Icons';
import './AdminV2.css';

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'ordered', label: 'Ordered' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'receiving', label: 'Receiving' },
  { value: 'complete', label: 'Complete' },
  { value: 'partial', label: 'Partial' },
  { value: 'verified', label: 'Verified' },
];

const AdminV2Shipments = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { 
    patients, 
    selectedPatient: contextPatient, 
    selectPatient: setContextPatient,
    loadingPatients 
  } = useAdminPatient();
  
  const selectedPatient = contextPatient;
  
  // Shipments state
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Filter state
  const [statusFilter, setStatusFilter] = useState('');
  const [backorderFilter, setBackorderFilter] = useState('');
  
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState({
    po_number: '',
    order_number: '',
    ship_date: '',
    expected_delivery: '',
    tracking_number: '',
    ship_method: '',
    warehouse_loc: '',
    notes: ''
  });
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  
  // Businesses (suppliers) for dropdown
  const [suppliers, setSuppliers] = useState([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');

  // Permission helper
  const hasPermission = (permission) => {
    if (!user) return false;
    if (user.is_system_admin) return true;
    return user.permissions?.includes(permission) || false;
  };

  // Check URL params for patient ID
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

  // Fetch data when patient is selected
  useEffect(() => {
    if (selectedPatient) {
      fetchShipments();
      fetchSuppliers();
    }
  }, [selectedPatient, statusFilter, backorderFilter]);

  const fetchShipments = async () => {
    if (!selectedPatient) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams();
      params.append('patient_id', selectedPatient.id.toString());
      if (statusFilter) params.append('status', statusFilter);
      if (backorderFilter === 'true') params.append('is_backorder', 'true');
      if (backorderFilter === 'false') params.append('is_backorder', 'false');
      
      const response = await fetch(`${config.apiUrl}/api/shipments?${params.toString()}`, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        setShipments(data.shipments || []);
      } else {
        setError('Failed to load shipments');
      }
    } catch (err) {
      setError('Error connecting to server');
      console.error('Error fetching shipments:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/businesses?type=dme`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setSuppliers(data.businesses || data || []);
      }
    } catch (err) {
      console.error('Error fetching suppliers:', err);
    }
  };

  const resetForm = () => {
    setFormData({
      po_number: '',
      order_number: '',
      ship_date: '',
      expected_delivery: '',
      tracking_number: '',
      ship_method: '',
      warehouse_loc: '',
      notes: ''
    });
    setSelectedSupplierId('');
    setFormError(null);
  };

  const handleCreateShipment = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    
    try {
      const payload = {
        patient_id: selectedPatient.id,
        supplier_id: selectedSupplierId ? parseInt(selectedSupplierId) : null,
        ...formData
      };
      
      const response = await fetch(`${config.apiUrl}/api/shipments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      
      if (response.ok) {
        const data = await response.json();
        setShowCreateModal(false);
        resetForm();
        // Navigate to the new shipment detail page
        navigate(`/care/equipment/shipments/${data.id}?patient=${selectedPatient.id}`);
      } else {
        const errorData = await response.json();
        setFormError(errorData.error || 'Failed to create shipment');
      }
    } catch (err) {
      setFormError('Error connecting to server');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyShipment = async (shipmentId) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/shipments/${shipmentId}/copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        // Navigate to the new copied shipment
        navigate(`/care/equipment/shipments/${data.id}?patient=${selectedPatient.id}`);
      } else {
        const errorData = await response.json();
        alert(errorData.error || 'Failed to copy shipment');
      }
    } catch (err) {
      console.error('Error copying shipment:', err);
      alert('Error connecting to server');
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString();
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'draft': return 'admin-v2-badge-warning';
      case 'ordered': return 'admin-v2-badge-secondary';
      case 'shipped': return 'admin-v2-badge-info';
      case 'receiving': return 'admin-v2-badge-warning';
      case 'complete': return 'admin-v2-badge-success';
      case 'partial': return 'admin-v2-badge-danger';
      case 'verified': return 'admin-v2-badge-success';
      default: return 'admin-v2-badge-secondary';
    }
  };

  // Stats
  const stats = {
    total: shipments.length,
    draft: shipments.filter(s => s.status === 'draft').length,
    receiving: shipments.filter(s => s.status === 'receiving').length,
    backorders: shipments.filter(s => s.is_backorder).length,
    partial: shipments.filter(s => s.status === 'partial').length
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
            <h1 className="schedule-section-title">DME Shipments</h1>

            {/* Stats Row */}
            <div className="admin-v2-stats-row">
              <div className="admin-v2-stat-card">
                <div className="admin-v2-stat-icon" style={{ background: 'rgba(88, 166, 255, 0.15)' }}>
                  <EquipmentIcon size={20} />
                </div>
                <div className="admin-v2-stat-info">
                  <h4>{stats.total}</h4>
                  <p>Total Shipments</p>
                </div>
              </div>
              <div className="admin-v2-stat-card">
                <div className="admin-v2-stat-icon" style={{ background: 'rgba(187, 128, 9, 0.15)' }}>
                  <ClockIcon size={20} />
                </div>
                <div className="admin-v2-stat-info">
                  <h4>{stats.draft}</h4>
                  <p>Drafts</p>
                </div>
              </div>
              <div className="admin-v2-stat-card">
                <div className="admin-v2-stat-icon" style={{ background: 'rgba(158, 106, 3, 0.15)' }}>
                  <ClockIcon size={20} />
                </div>
                <div className="admin-v2-stat-info">
                  <h4>{stats.receiving}</h4>
                  <p>Receiving</p>
                </div>
              </div>
              <div className="admin-v2-stat-card">
                <div className="admin-v2-stat-icon" style={{ background: 'rgba(248, 81, 73, 0.15)' }}>
                  <AlertIcon size={20} />
                </div>
                <div className="admin-v2-stat-info">
                  <h4>{stats.partial}</h4>
                  <p>With Issues</p>
                </div>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="history-filter-bar">
              <div className="history-filter-row">
                <div className="history-filter-group">
                  <label>Status</label>
                  <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    className="history-filter-select"
                  >
                    {STATUS_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                
                <div className="history-filter-group">
                  <label>Type</label>
                  <select
                    value={backorderFilter}
                    onChange={e => setBackorderFilter(e.target.value)}
                    className="history-filter-select"
                  >
                    <option value="">All Types</option>
                    <option value="false">Regular</option>
                    <option value="true">Backorder</option>
                  </select>
                </div>
                
                {hasPermission('equipment.create') && (
                  <button
                    className="admin-v2-btn admin-v2-btn-primary"
                    onClick={() => { resetForm(); setShowCreateModal(true); }}
                    style={{ marginLeft: 'auto' }}
                  >
                    <PlusIcon size={16} /> New Shipment
                  </button>
                )}
              </div>
            </div>

            {/* Shipments Table */}
            {loading ? (
              <div className="admin-v2-loading">Loading shipments...</div>
            ) : error ? (
              <div className="admin-v2-error">{error}</div>
            ) : shipments.length === 0 ? (
              <div className="admin-v2-empty-state">
                <EquipmentIcon size={48} />
                <h3>No Shipments Found</h3>
                <p className="admin-v2-text-muted">Create a shipment to start tracking DME deliveries.</p>
                {hasPermission('equipment.create') && (
                  <button
                    className="admin-v2-btn admin-v2-btn-primary"
                    onClick={() => { resetForm(); setShowCreateModal(true); }}
                  >
                    <PlusIcon size={16} /> New Shipment
                  </button>
                )}
              </div>
            ) : (
              <div className="admin-v2-table-container">
                <table className="admin-v2-table">
                  <thead>
                    <tr>
                      <th>Order #</th>
                      <th>Supplier</th>
                      <th>Order Date</th>
                      <th>Status</th>
                      <th>Items</th>
                      <th>Type</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {shipments.map(shipment => (
                      <tr 
                        key={shipment.id}
                        className="admin-v2-clickable-row"
                        onClick={() => navigate(`/care/equipment/shipments/${shipment.id}?patient=${selectedPatient.id}`)}
                      >
                        <td>
                          <strong>{shipment.order_number || shipment.po_number || `#${shipment.id}`}</strong>
                        </td>
                        <td>{shipment.supplier_name || '-'}</td>
                        <td>{formatDate(shipment.order_date || shipment.ship_date)}</td>
                        <td>
                          <span className={`admin-v2-badge ${getStatusBadgeClass(shipment.status)}`}>
                            {shipment.status}
                          </span>
                        </td>
                        <td>{shipment.item_count || 0}</td>
                        <td>
                          {shipment.is_backorder ? (
                            <span className="admin-v2-badge admin-v2-badge-warning">Backorder</span>
                          ) : (
                            <span className="admin-v2-badge admin-v2-badge-secondary">Regular</span>
                          )}
                        </td>
                        <td style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <button
                            className="admin-v2-btn admin-v2-btn-sm admin-v2-btn-secondary"
                            onClick={(e) => { e.stopPropagation(); handleCopyShipment(shipment.id); }}
                            title="Copy Shipment"
                          >
                            <CopyIcon size={14} />
                          </button>
                          <ChevronRightIcon size={16} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <div className="admin-v2-loading">Select a patient from the sidebar</div>
        )}

        {/* Create Shipment Modal */}
        {showCreateModal && (
          <div className="admin-v2-modal-overlay" onClick={() => setShowCreateModal(false)}>
            <div className="admin-v2-modal" onClick={e => e.stopPropagation()}>
              <div className="admin-v2-modal-header">
                <h2>New Shipment</h2>
                <button className="admin-v2-modal-close" onClick={() => setShowCreateModal(false)}>
                  <XIcon size={20} />
                </button>
              </div>
              <form onSubmit={handleCreateShipment}>
                <div className="admin-v2-modal-body">
                  {formError && (
                    <div className="admin-v2-form-error">{formError}</div>
                  )}
                  
                  <div className="admin-v2-form-group">
                    <label>Supplier (DME Provider)</label>
                    <select
                      value={selectedSupplierId}
                      onChange={e => setSelectedSupplierId(e.target.value)}
                    >
                      <option value="">-- Select Supplier --</option>
                      {suppliers.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="admin-v2-form-row">
                    <div className="admin-v2-form-group">
                      <label>PO Number</label>
                      <input
                        type="text"
                        value={formData.po_number}
                        onChange={e => setFormData({...formData, po_number: e.target.value})}
                        placeholder="e.g., 55811"
                      />
                    </div>
                    <div className="admin-v2-form-group">
                      <label>Order Number</label>
                      <input
                        type="text"
                        value={formData.order_number}
                        onChange={e => setFormData({...formData, order_number: e.target.value})}
                        placeholder="e.g., 1099274055"
                      />
                    </div>
                  </div>

                  <div className="admin-v2-form-row">
                    <div className="admin-v2-form-group">
                      <label>Ship Date</label>
                      <input
                        type="date"
                        value={formData.ship_date}
                        onChange={e => setFormData({...formData, ship_date: e.target.value})}
                      />
                    </div>
                    <div className="admin-v2-form-group">
                      <label>Expected Delivery</label>
                      <input
                        type="date"
                        value={formData.expected_delivery}
                        onChange={e => setFormData({...formData, expected_delivery: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="admin-v2-form-row">
                    <div className="admin-v2-form-group">
                      <label>Tracking Number</label>
                      <input
                        type="text"
                        value={formData.tracking_number}
                        onChange={e => setFormData({...formData, tracking_number: e.target.value})}
                        placeholder="Tracking #"
                      />
                    </div>
                    <div className="admin-v2-form-group">
                      <label>Ship Method</label>
                      <input
                        type="text"
                        value={formData.ship_method}
                        onChange={e => setFormData({...formData, ship_method: e.target.value})}
                        placeholder="e.g., FedEx-Ground"
                      />
                    </div>
                  </div>

                  <div className="admin-v2-form-group">
                    <label>Notes</label>
                    <textarea
                      value={formData.notes}
                      onChange={e => setFormData({...formData, notes: e.target.value})}
                      rows={2}
                      placeholder="Optional notes"
                    />
                  </div>
                </div>
                <div className="admin-v2-modal-footer">
                  <button type="button" className="admin-v2-btn" onClick={() => setShowCreateModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="admin-v2-btn admin-v2-btn-primary" disabled={saving}>
                    {saving ? 'Creating...' : 'Create & Add Items'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Shipments;
