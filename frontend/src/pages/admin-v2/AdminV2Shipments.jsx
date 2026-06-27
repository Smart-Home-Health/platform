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
import { useSearchParams, useNavigate } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import config from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import {
  PlusIcon,
  EquipmentIcon,
  ClockIcon,
  ChevronRightIcon,
  AlertIcon,
  CopyIcon
} from '../../components/Icons';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import { Field, FormRow } from '@/components/ui/field';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
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
            {/* Stats Row */}
            <div className="admin-v2-summary-stats admin-v2-shipments-summary">
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
                  <div className="tw" style={{ marginLeft: 'auto' }}>
                    <Button onClick={() => { resetForm(); setShowCreateModal(true); }}>
                      <PlusIcon size={16} /> New Shipment
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Shipments Table */}
            {loading ? (
              <div className="admin-v2-loading">Loading shipments...</div>
            ) : error ? (
              <div className="tw"><Alert variant="destructive">{error}</Alert></div>
            ) : shipments.length === 0 ? (
              <div className="admin-v2-empty-state">
                <EquipmentIcon size={48} />
                <h3>No Shipments Found</h3>
                <p className="admin-v2-text-muted">Create a shipment to start tracking DME deliveries.</p>
                {hasPermission('equipment.create') && (
                  <div className="tw">
                    <Button onClick={() => { resetForm(); setShowCreateModal(true); }}>
                      <PlusIcon size={16} /> New Shipment
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="admin-v2-table-container admin-v2-table-cards-wrap">
                <table className="admin-v2-table admin-v2-table-cards">
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
                        <td className="admin-v2-cell-name">
                          <strong>{shipment.order_number || shipment.po_number || `#${shipment.id}`}</strong>
                        </td>
                        <td data-label="Supplier">{shipment.supplier_name || '-'}</td>
                        <td data-label="Order Date">{formatDate(shipment.order_date || shipment.ship_date)}</td>
                        <td data-label="Status">
                          <span className={`admin-v2-badge ${getStatusBadgeClass(shipment.status)}`}>
                            {shipment.status}
                          </span>
                        </td>
                        <td data-label="Items">{shipment.item_count || 0}</td>
                        <td data-label="Type">
                          {shipment.is_backorder ? (
                            <span className="admin-v2-badge admin-v2-badge-warning">Backorder</span>
                          ) : (
                            <span className="admin-v2-badge admin-v2-badge-secondary">Regular</span>
                          )}
                        </td>
                        <td className="admin-v2-cell-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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

        {/* Create Shipment Dialog */}
        <Dialog open={showCreateModal} onOpenChange={(o) => { if (!o) setShowCreateModal(false); }}>
          <DialogContent className="sm:max-w-[640px]" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>New Shipment</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateShipment} className="flex flex-col gap-4">
              {formError && <Alert variant="destructive">{formError}</Alert>}

              <Field label="Supplier (DME Provider)">
                <Select
                  value={selectedSupplierId || '__none__'}
                  onValueChange={(v) => setSelectedSupplierId(v === '__none__' ? '' : v)}
                >
                  <SelectTrigger><SelectValue placeholder="-- Select Supplier --" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">-- Select Supplier --</SelectItem>
                    {suppliers.map(s => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <FormRow>
                <Field label="PO Number" htmlFor="ship-po">
                  <Input
                    id="ship-po"
                    value={formData.po_number}
                    onChange={e => setFormData({...formData, po_number: e.target.value})}
                    placeholder="e.g., 55811"
                  />
                </Field>
                <Field label="Order Number" htmlFor="ship-order">
                  <Input
                    id="ship-order"
                    value={formData.order_number}
                    onChange={e => setFormData({...formData, order_number: e.target.value})}
                    placeholder="e.g., 1099274055"
                  />
                </Field>
              </FormRow>

              <FormRow>
                <Field label="Ship Date" htmlFor="ship-date">
                  <Input
                    id="ship-date"
                    type="date"
                    value={formData.ship_date}
                    onChange={e => setFormData({...formData, ship_date: e.target.value})}
                  />
                </Field>
                <Field label="Expected Delivery" htmlFor="ship-expected">
                  <Input
                    id="ship-expected"
                    type="date"
                    value={formData.expected_delivery}
                    onChange={e => setFormData({...formData, expected_delivery: e.target.value})}
                  />
                </Field>
              </FormRow>

              <FormRow>
                <Field label="Tracking Number" htmlFor="ship-tracking">
                  <Input
                    id="ship-tracking"
                    value={formData.tracking_number}
                    onChange={e => setFormData({...formData, tracking_number: e.target.value})}
                    placeholder="Tracking #"
                  />
                </Field>
                <Field label="Ship Method" htmlFor="ship-method">
                  <Input
                    id="ship-method"
                    value={formData.ship_method}
                    onChange={e => setFormData({...formData, ship_method: e.target.value})}
                    placeholder="e.g., FedEx-Ground"
                  />
                </Field>
              </FormRow>

              <Field label="Notes" htmlFor="ship-notes">
                <Textarea
                  id="ship-notes"
                  value={formData.notes}
                  onChange={e => setFormData({...formData, notes: e.target.value})}
                  rows={2}
                  placeholder="Optional notes"
                />
              </Field>

              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Creating...' : 'Create & Add Items'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Shipments;
