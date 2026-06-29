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
import { useSearchParams } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import config from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import {
  PlusIcon,
  EditIcon,
  TrashIcon,
  EquipmentIcon,
  ClockIcon
} from '../../components/Icons';
import EquipmentRestockGate from '../../components/EquipmentRestockGate';
import { formatDateOnly } from '../../utils/timezone';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
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

// FastAPI returns `detail` as a string for most errors, but as a list of
// { loc, msg, type } objects for 422 validation errors. Normalize both to a
// readable string so we never render "[object Object]".
const formatErrorDetail = (detail, fallback) => {
  if (!detail) return fallback;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map(e => e?.msg || JSON.stringify(e)).join('; ') || fallback;
  }
  return fallback;
};

// Shared create/edit form body. Defined at module scope so it isn't recreated
// each render — a nested component would drop input focus on every keystroke.
function EquipmentFormFields({ formData, setFormData, showAdvanced, setShowAdvanced }) {
  return (
    <>
      <Field label="Equipment Name" required htmlFor="equip-name">
        <Input
          id="equip-name"
          value={formData.name}
          onChange={e => setFormData({ ...formData, name: e.target.value })}
          required
          placeholder="e.g., Trach Tube"
        />
      </Field>

      <FormRow>
        <Field label="Quantity" required htmlFor="equip-qty">
          <Input
            id="equip-qty"
            type="number"
            value={formData.quantity}
            onChange={e => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })}
            required
            min="0"
          />
        </Field>
        <Field label="Type">
          <label className="flex w-fit cursor-pointer items-center gap-2 pt-1.5">
            <Checkbox
              checked={formData.scheduled_replacement}
              onCheckedChange={(v) => setFormData({ ...formData, scheduled_replacement: v === true })}
            />
            <span className="text-sm text-foreground">Has Scheduled Replacement</span>
          </label>
        </Field>
      </FormRow>

      {formData.scheduled_replacement && (
        <FormRow>
          <Field label="Last Changed" required htmlFor="equip-last-changed">
            <Input
              id="equip-last-changed"
              type="date"
              value={formData.last_changed}
              onChange={e => setFormData({ ...formData, last_changed: e.target.value })}
              required
            />
          </Field>
          <Field label="Useful Days" required htmlFor="equip-useful-days">
            <Input
              id="equip-useful-days"
              type="number"
              value={formData.useful_days}
              onChange={e => setFormData({ ...formData, useful_days: parseInt(e.target.value) || 30 })}
              required
              min="1"
              placeholder="30"
            />
          </Field>
        </FormRow>
      )}

      <div className="border-t border-border pt-4">
        <label className="flex w-fit cursor-pointer items-center gap-2">
          <Checkbox
            checked={showAdvanced}
            onCheckedChange={(v) => setShowAdvanced(v === true)}
          />
          <span className="text-sm text-foreground">Show Supply Tracking Options</span>
        </label>
      </div>

      {showAdvanced && (
        <>
          <FormRow>
            <Field label="Item Number" htmlFor="equip-item-number">
              <Input
                id="equip-item-number"
                value={formData.item_number}
                onChange={e => setFormData({ ...formData, item_number: e.target.value })}
                placeholder="e.g., 6025"
              />
            </Field>
            <Field label="Manufacturer" htmlFor="equip-mfr">
              <Input
                id="equip-mfr"
                value={formData.default_manufacturer}
                onChange={e => setFormData({ ...formData, default_manufacturer: e.target.value })}
                placeholder="e.g., Hollister"
              />
            </Field>
          </FormRow>

          <Field label="Description" htmlFor="equip-desc">
            <Input
              id="equip-desc"
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              placeholder="Item description for shipments"
            />
          </Field>

          <FormRow>
            <Field label="Category">
              <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="equipment">Equipment</SelectItem>
                  <SelectItem value="supply">Supply</SelectItem>
                  <SelectItem value="medication">Medication</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Tracking Level">
              <Select value={formData.tracking_level} onValueChange={(v) => setFormData({ ...formData, tracking_level: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="quantity">Quantity Only</SelectItem>
                  <SelectItem value="lot">Lot Number</SelectItem>
                  <SelectItem value="serial">Serial Number</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </FormRow>

          <FormRow>
            <Field label="Unit of Measure" htmlFor="equip-uom">
              <Input
                id="equip-uom"
                value={formData.unit_of_measure}
                onChange={e => setFormData({ ...formData, unit_of_measure: e.target.value })}
                placeholder="e.g., Box, Pack"
              />
            </Field>
            <Field label="Unit Size" htmlFor="equip-unit-size">
              <Input
                id="equip-unit-size"
                value={formData.unit_size}
                onChange={e => setFormData({ ...formData, unit_size: e.target.value })}
                placeholder="e.g., 10"
              />
            </Field>
          </FormRow>

          <Field label="Unit Description" htmlFor="equip-unit-desc">
            <Input
              id="equip-unit-desc"
              value={formData.unit_description}
              onChange={e => setFormData({ ...formData, unit_description: e.target.value })}
              placeholder="e.g., Box of 10"
            />
          </Field>

          <FormRow>
            <Field label="Reorder Point" htmlFor="equip-reorder">
              <Input
                id="equip-reorder"
                type="number"
                min="0"
                value={formData.reorder_point}
                onChange={e => setFormData({ ...formData, reorder_point: e.target.value })}
                placeholder="Low stock alert"
              />
            </Field>
            <Field label="Par Level" htmlFor="equip-par">
              <Input
                id="equip-par"
                type="number"
                min="0"
                value={formData.par_level}
                onChange={e => setFormData({ ...formData, par_level: e.target.value })}
                placeholder="Target quantity"
              />
            </Field>
          </FormRow>
        </>
      )}
    </>
  );
}

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
  // Out-of-stock gate: holds the backend 409 payload while the caregiver
  // updates the on-hand quantity, after which the change is retried.
  const [restockInfo, setRestockInfo] = useState(null);
  
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
        setFormError(formatErrorDetail(errorData.detail, 'Failed to create equipment'));
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
        setFormError(formatErrorDetail(errorData.detail, 'Failed to update equipment'));
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
        setRestockInfo(null);
        fetchEquipment();
      } else {
        const errorData = await response.json();
        // 409 = out of stock. Open the restock gate instead of erroring; the
        // change retries automatically once the on-hand quantity is updated.
        if (response.status === 409 && errorData.error === 'insufficient_quantity') {
          setRestockInfo(errorData);
        } else {
          alert(formatErrorDetail(errorData.detail, 'Failed to mark as changed'));
        }
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
    return formatDateOnly(dateString) || '-';
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
              <h3 style={{ margin: 0, color: 'var(--foreground)' }}>
                {activeTab === 'all' ? 'All Items' : activeTab === 'equipment' ? 'Equipment' : activeTab === 'supply' ? 'Supplies' : 'Consumables'} ({filteredEquipment.length})
              </h3>
              {hasPermission('equipment.create') && (
                <div className="tw">
                  <Button onClick={() => { resetForm(); setShowCreateModal(true); }}>
                    <PlusIcon size={16} /> Add Equipment
                  </Button>
                </div>
              )}
            </div>

            {/* Equipment Table */}
            {loading ? (
              <div className="admin-v2-loading">Loading equipment...</div>
            ) : error ? (
              <div className="tw"><Alert variant="destructive">{error}</Alert></div>
            ) : equipment.length === 0 ? (
              <div className="admin-v2-empty-state">
                <EquipmentIcon size={48} />
                <h3>No Equipment Found</h3>
                <p className="admin-v2-text-muted">Add equipment for this patient to get started.</p>
                {hasPermission('equipment.create') && (
                  <div className="tw">
                    <Button onClick={() => { resetForm(); setShowCreateModal(true); }}>
                      <PlusIcon size={16} /> Add Equipment
                    </Button>
                  </div>
                )}
              </div>
            ) : filteredEquipment.length === 0 ? (
              <div className="admin-v2-empty-state">
                <EquipmentIcon size={48} />
                <h3>No {activeTab === 'equipment' ? 'Equipment' : activeTab === 'supply' ? 'Supplies' : activeTab === 'consumable' ? 'Consumables' : 'Items'} Found</h3>
                <p className="admin-v2-text-muted">No items match this category.</p>
              </div>
            ) : (
              <div className="admin-v2-table-container admin-v2-table-cards-wrap">
                <table className="admin-v2-table admin-v2-table-cards">
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
                          <td className="admin-v2-cell-name">
                            <span className="admin-v2-equipment-name">{equip.name}</span>
                            {equip.default_manufacturer && (
                              <div className="admin-v2-text-muted">{equip.default_manufacturer}</div>
                            )}
                          </td>
                          <td data-label="Item #">{equip.item_number || '-'}</td>
                          <td data-label="Qty">
                            <span className={`admin-v2-quantity ${isLowStock ? 'low' : ''}`}>
                              {equip.quantity}
                            </span>
                            {equip.unit_of_measure && (
                              <span className="admin-v2-text-small"> {equip.unit_of_measure}</span>
                            )}
                          </td>
                          <td data-label="Type">
                            {equip.category === 'supply' ? (
                              <span className="admin-v2-badge admin-v2-badge-secondary">Supply</span>
                            ) : equip.scheduled_replacement ? (
                              <span className="admin-v2-badge admin-v2-badge-info">Scheduled</span>
                            ) : (
                              <span className="admin-v2-badge admin-v2-badge-secondary">Consumable</span>
                            )}
                          </td>
                          <td data-label="Last Changed">{equip.scheduled_replacement ? formatDate(equip.last_changed) : '-'}</td>
                          <td data-label="Status">
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
                          <td className="admin-v2-cell-actions">
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

        {/* Create Equipment Dialog */}
        <Dialog open={showCreateModal} onOpenChange={(o) => { if (!o) setShowCreateModal(false); }}>
          <DialogContent className="sm:max-w-[640px]" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Add Equipment</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateEquipment} className="flex flex-col gap-4">
              {formError && <Alert variant="destructive">{formError}</Alert>}
              <EquipmentFormFields
                formData={formData}
                setFormData={setFormData}
                showAdvanced={showAdvanced}
                setShowAdvanced={setShowAdvanced}
              />
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setShowCreateModal(false)}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving ? 'Creating...' : 'Create Equipment'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Edit Equipment Dialog */}
        <Dialog open={showEditModal} onOpenChange={(o) => { if (!o) setShowEditModal(false); }}>
          <DialogContent className="sm:max-w-[640px]" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Edit Equipment</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleEditEquipment} className="flex flex-col gap-4">
              {formError && <Alert variant="destructive">{formError}</Alert>}
              <EquipmentFormFields
                formData={formData}
                setFormData={setFormData}
                showAdvanced={showAdvanced}
                setShowAdvanced={setShowAdvanced}
              />
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setShowEditModal(false)}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={showDeleteModal} onOpenChange={(o) => { if (!o) setShowDeleteModal(false); }}>
          <DialogContent className="sm:max-w-[440px]" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Delete Equipment</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-2 text-sm">
              <p className="text-foreground">Are you sure you want to delete <strong>{selectedEquipment?.name}</strong>?</p>
              <p className="text-muted-foreground">This action cannot be undone.</p>
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDeleteEquipment} disabled={saving}>
                {saving ? 'Deleting...' : 'Delete'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Change Confirmation Dialog */}
        <Dialog open={showChangeModal} onOpenChange={(o) => { if (!o) setShowChangeModal(false); }}>
          <DialogContent className="sm:max-w-[440px]" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Confirm Change</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-2 text-sm">
              <p className="text-foreground">Mark <strong>{selectedEquipment?.name}</strong> as changed?</p>
              <p className="text-muted-foreground">This will reset the due date based on the useful days.</p>
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setShowChangeModal(false)}>Cancel</Button>
              <Button onClick={handleChangeEquipment} disabled={saving}>
                {saving ? 'Updating...' : 'Confirm Change'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Out-of-Stock Gate: restock then retry the change */}
        <EquipmentRestockGate
          info={restockInfo}
          onClose={() => setRestockInfo(null)}
          onUpdated={() => handleChangeEquipment()}
        />

        {/* Receive Stock Dialog */}
        <Dialog open={showReceiveModal} onOpenChange={(o) => { if (!o) setShowReceiveModal(false); }}>
          <DialogContent className="sm:max-w-[440px]" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Receive Stock</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <p className="text-sm text-foreground">How many <strong>{selectedEquipment?.name}</strong> to receive?</p>
              <Field label="Quantity" htmlFor="equip-receive-qty">
                <Input
                  id="equip-receive-qty"
                  type="number"
                  value={quantityAmount}
                  onChange={e => setQuantityAmount(parseInt(e.target.value) || 1)}
                  min="1"
                  autoFocus
                />
              </Field>
              <p className="text-sm text-muted-foreground">Current stock: {selectedEquipment?.quantity}</p>
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setShowReceiveModal(false)}>Cancel</Button>
              <Button onClick={handleReceiveEquipment} disabled={saving}>
                {saving ? 'Updating...' : 'Receive'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Open/Use Stock Dialog */}
        <Dialog open={showOpenModal} onOpenChange={(o) => { if (!o) setShowOpenModal(false); }}>
          <DialogContent className="sm:max-w-[440px]" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Open/Use Equipment</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <p className="text-sm text-foreground">How many <strong>{selectedEquipment?.name}</strong> to open/use?</p>
              <Field label="Quantity" htmlFor="equip-open-qty">
                <Input
                  id="equip-open-qty"
                  type="number"
                  value={quantityAmount}
                  onChange={e => setQuantityAmount(parseInt(e.target.value) || 1)}
                  min="1"
                  max={selectedEquipment?.quantity}
                  autoFocus
                />
              </Field>
              <p className="text-sm text-muted-foreground">Available: {selectedEquipment?.quantity}</p>
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setShowOpenModal(false)}>Cancel</Button>
              <Button onClick={handleOpenEquipment} disabled={saving}>
                {saving ? 'Updating...' : 'Open'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Equipment;
