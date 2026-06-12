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
import { useSearchParams, useNavigate } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import config from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import {
  AlertIcon,
  CheckIcon,
  PlusIcon
} from '../../components/Icons';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { Field } from '@/components/ui/field';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import './AdminV2.css';

const ALERT_TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'short', label: 'Short' },
  { value: 'wrong_item', label: 'Wrong Item' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'extra', label: 'Extra' },
  { value: 'backorder', label: 'Backorder' },
];

const AdminV2ShipmentAlerts = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { 
    patients, 
    selectedPatient: contextPatient, 
    selectPatient: setContextPatient,
    loadingPatients 
  } = useAdminPatient();
  
  const selectedPatient = contextPatient;

  // Alerts data
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Filters
  const [typeFilter, setTypeFilter] = useState('');
  const [resolvedFilter, setResolvedFilter] = useState('false'); // Default to unresolved
  
  // Selection for follow-up order
  const [selectedAlerts, setSelectedAlerts] = useState([]);
  
  // Follow-up modal
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [creatingFollowUp, setCreatingFollowUp] = useState(false);
  
  // Suppliers
  const [suppliers, setSuppliers] = useState([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');

  const hasPermission = (permission) => {
    if (!user) return false;
    if (user.is_system_admin) return true;
    return user.permissions?.includes(permission) || false;
  };

  // Set patient from URL
  useEffect(() => {
    const patientId = searchParams.get('patient');
    if (patientId && patients.length > 0) {
      const patient = patients.find(p => p.id === parseInt(patientId));
      if (patient && patient.id !== contextPatient?.id) {
        setContextPatient(patient);
      }
    }
  }, [searchParams, patients]);

  // Update URL when patient changes
  useEffect(() => {
    if (contextPatient && searchParams.get('patient') !== String(contextPatient.id)) {
      setSearchParams({ patient: contextPatient.id });
    }
  }, [contextPatient]);

  // Fetch data
  useEffect(() => {
    if (selectedPatient) {
      fetchAlerts();
      fetchSuppliers();
    }
  }, [selectedPatient, typeFilter, resolvedFilter]);

  const fetchAlerts = async () => {
    if (!selectedPatient) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams();
      params.append('patient_id', selectedPatient.id.toString());
      if (typeFilter) params.append('alert_type', typeFilter);
      if (resolvedFilter) params.append('resolved', resolvedFilter);
      
      const response = await fetch(`${config.apiUrl}/api/shipments/alerts?${params.toString()}`, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        setAlerts(data.alerts || []);
        setSelectedAlerts([]);
      } else {
        setError('Failed to load alerts');
      }
    } catch (err) {
      setError('Error connecting to server');
      console.error(err);
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

  const handleToggleSelect = (alertId) => {
    setSelectedAlerts(prev => 
      prev.includes(alertId) 
        ? prev.filter(id => id !== alertId)
        : [...prev, alertId]
    );
  };

  const handleSelectAll = () => {
    const unresolvedIds = alerts.filter(a => !a.resolved).map(a => a.id);
    if (selectedAlerts.length === unresolvedIds.length) {
      setSelectedAlerts([]);
    } else {
      setSelectedAlerts(unresolvedIds);
    }
  };

  const handleCreateFollowUp = async () => {
    if (selectedAlerts.length === 0) {
      alert('Please select at least one alert');
      return;
    }
    
    setCreatingFollowUp(true);
    
    try {
      const payload = {
        alert_ids: selectedAlerts,
        supplier_id: selectedSupplierId ? parseInt(selectedSupplierId) : null
      };
      
      const response = await fetch(`${config.apiUrl}/api/shipments/alerts/create-followup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      
      if (response.ok) {
        const result = await response.json();
        setShowFollowUpModal(false);
        
        // Navigate to the new shipment
        navigate(`/care/equipment/shipments/${result.shipment_id}?patient=${selectedPatient.id}`);
      } else {
        const errData = await response.json();
        alert(errData.error || 'Failed to create follow-up order');
      }
    } catch (err) {
      console.error('Error creating follow-up:', err);
      alert('Error connecting to server');
    } finally {
      setCreatingFollowUp(false);
    }
  };

  const handleResolveAlert = async (alertId) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/shipments/alerts/${alertId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ resolution_notes: '' })
      });
      
      if (response.ok) {
        fetchAlerts();
      } else {
        const errData = await response.json();
        alert(errData.error || 'Failed to resolve alert');
      }
    } catch (err) {
      console.error('Error resolving alert:', err);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString();
  };

  const getAlertTypeBadgeClass = (type) => {
    switch (type) {
      case 'short': return 'admin-v2-badge-warning';
      case 'wrong_item': return 'admin-v2-badge-danger';
      case 'damaged': return 'admin-v2-badge-danger';
      case 'extra': return 'admin-v2-badge-info';
      case 'backorder': return 'admin-v2-badge-warning';
      default: return 'admin-v2-badge-secondary';
    }
  };

  // Same mapping as getAlertTypeBadgeClass, for the shadcn <Badge> in the dialog.
  const getAlertTypeBadgeVariant = (type) => {
    switch (type) {
      case 'short': return 'warning';
      case 'wrong_item': return 'danger';
      case 'damaged': return 'danger';
      case 'extra': return 'info';
      case 'backorder': return 'warning';
      default: return 'secondary';
    }
  };

  // Stats
  const unresolvedCount = alerts.filter(a => !a.resolved).length;

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
            <div className="admin-v2-summary-stats admin-v2-alerts-summary">
              <div className="admin-v2-stat-card">
                <div className="admin-v2-stat-icon" style={{ background: 'rgba(248, 81, 73, 0.15)' }}>
                  <AlertIcon size={20} />
                </div>
                <div className="admin-v2-stat-info">
                  <h4>{unresolvedCount}</h4>
                  <p>Unresolved Alerts</p>
                </div>
              </div>
              <div className="admin-v2-stat-card">
                <div className="admin-v2-stat-icon" style={{ background: 'rgba(46, 160, 67, 0.15)' }}>
                  <CheckIcon size={20} />
                </div>
                <div className="admin-v2-stat-info">
                  <h4>{alerts.filter(a => a.resolved).length}</h4>
                  <p>Resolved</p>
                </div>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="history-filter-bar">
              <div className="history-filter-row">
                <div className="history-filter-group">
                  <label>Alert Type</label>
                  <select
                    value={typeFilter}
                    onChange={e => setTypeFilter(e.target.value)}
                    className="history-filter-select"
                  >
                    {ALERT_TYPE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                
                <div className="history-filter-group">
                  <label>Status</label>
                  <select
                    value={resolvedFilter}
                    onChange={e => setResolvedFilter(e.target.value)}
                    className="history-filter-select"
                  >
                    <option value="">All</option>
                    <option value="false">Unresolved</option>
                    <option value="true">Resolved</option>
                  </select>
                </div>
                
                {hasPermission('equipment.create') && selectedAlerts.length > 0 && (
                  <div className="tw" style={{ marginLeft: 'auto' }}>
                    <Button onClick={() => setShowFollowUpModal(true)}>
                      <PlusIcon size={16} /> Create Follow-Up Order ({selectedAlerts.length})
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Alerts Table */}
            {loading ? (
              <div className="admin-v2-loading">Loading alerts...</div>
            ) : error ? (
              <div className="tw"><Alert variant="destructive">{error}</Alert></div>
            ) : alerts.length === 0 ? (
              <div className="admin-v2-empty-state">
                <CheckIcon size={48} />
                <h3>No Alerts</h3>
                <p className="admin-v2-text-muted">All shipments are looking good!</p>
              </div>
            ) : (
              <div className="admin-v2-table-container admin-v2-table-cards-wrap">
                <table className="admin-v2-table admin-v2-table-cards">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>
                        <input
                          type="checkbox"
                          checked={selectedAlerts.length === alerts.filter(a => !a.resolved).length && selectedAlerts.length > 0}
                          onChange={handleSelectAll}
                        />
                      </th>
                      <th>Type</th>
                      <th>Item</th>
                      <th>Shipment</th>
                      <th style={{ textAlign: 'center' }}>Expected</th>
                      <th style={{ textAlign: 'center' }}>Actual</th>
                      <th>Created</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {alerts.map(alert => (
                      <tr key={alert.id} className={alert.resolved ? 'admin-v2-row-muted' : ''}>
                        <td data-label="Select" className="admin-v2-cell-select">
                          {!alert.resolved && (
                            <input
                              type="checkbox"
                              checked={selectedAlerts.includes(alert.id)}
                              onChange={() => handleToggleSelect(alert.id)}
                            />
                          )}
                        </td>
                        <td data-label="Type">
                          <span className={`admin-v2-badge ${getAlertTypeBadgeClass(alert.alert_type)}`}>
                            {alert.alert_type?.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="admin-v2-cell-name">
                          <strong>{alert.item_number || '-'}</strong>
                          {alert.equipment_name && (
                            <div className="admin-v2-text-muted">{alert.equipment_name}</div>
                          )}
                        </td>
                        <td data-label="Shipment">
                          <a
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              navigate(`/care/equipment/shipments/${alert.shipment_id}?patient=${selectedPatient.id}`);
                            }}
                          >
                            #{alert.shipment_id}
                          </a>
                          {alert.po_number && <div className="admin-v2-text-muted">PO: {alert.po_number}</div>}
                        </td>
                        <td data-label="Expected" style={{ textAlign: 'center' }}>{alert.expected_qty}</td>
                        <td data-label="Actual" style={{ textAlign: 'center' }}>{alert.actual_qty}</td>
                        <td data-label="Created">{formatDate(alert.created_at)}</td>
                        <td data-label="Status">
                          {alert.resolved ? (
                            <span className="admin-v2-badge admin-v2-badge-success">Resolved</span>
                          ) : (
                            <span className="admin-v2-badge admin-v2-badge-warning">Open</span>
                          )}
                        </td>
                        <td className="admin-v2-cell-actions">
                          {!alert.resolved && hasPermission('equipment.update') && (
                            <button
                              className="admin-v2-btn admin-v2-btn-sm admin-v2-btn-ghost"
                              onClick={() => handleResolveAlert(alert.id)}
                              title="Mark as resolved"
                            >
                              <CheckIcon size={14} />
                            </button>
                          )}
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

        {/* Follow-Up Order Dialog */}
        <Dialog open={showFollowUpModal} onOpenChange={(o) => { if (!o) setShowFollowUpModal(false); }}>
          <DialogContent className="sm:max-w-[560px]" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Create Follow-Up Order</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <p className="text-sm text-foreground">Create a new order for {selectedAlerts.length} alert(s)?</p>

              <Field label="Supplier (optional)">
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

              <div className="flex flex-col gap-2">
                <h4 className="text-sm font-semibold text-foreground">Selected Items:</h4>
                <ul className="flex flex-col gap-1.5">
                  {alerts
                    .filter(a => selectedAlerts.includes(a.id))
                    .map(a => (
                      <li key={a.id} className="flex items-center gap-2 text-sm text-foreground">
                        <Badge variant={getAlertTypeBadgeVariant(a.alert_type)}>
                          {a.alert_type}
                        </Badge>
                        <span>
                          {a.item_number || a.equipment_name || 'Item'} — Qty: {Math.abs(a.expected_qty - a.actual_qty)}
                        </span>
                      </li>
                    ))
                  }
                </ul>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setShowFollowUpModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateFollowUp} disabled={creatingFollowUp}>
                {creatingFollowUp ? 'Creating...' : 'Create Order'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2ShipmentAlerts;
