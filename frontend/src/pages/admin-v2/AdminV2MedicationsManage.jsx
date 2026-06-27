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
import { PatientSelectorModal } from './components';
import config from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import {
  PlusIcon,
  EditIcon,
  TrashIcon,
  MedicationsIcon,
  ClockIcon
} from '../../components/Icons';
import { localTimeToUTC, localTimeAndDaysToUTC, utcTimeToLocal, parseCronExpression } from '../../utils/timezone';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
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

const QUANTITY_UNITS = ['tablets', 'capsules', 'ml', 'mg', 'units', 'puffs', 'drops', 'patches'];
const UNIT_LABELS = { tablets: 'Tablets', capsules: 'Capsules', ml: 'mL', mg: 'mg', units: 'Units', puffs: 'Puffs', drops: 'Drops', patches: 'Patches' };

// Shared Create/Edit medication form body (edit adds the Status select). Module
// scope so it isn't recreated each render — a nested component drops input focus.
function MedicationFormFields({ formData, setFormData, providers, pharmacies, showStatus }) {
  return (
    <>
      <FormRow>
        <Field label="Medication Name" required htmlFor="med-name">
          <Input
            id="med-name"
            value={formData.name}
            onChange={e => setFormData({ ...formData, name: e.target.value })}
            required
            placeholder="e.g., Lisinopril"
          />
        </Field>
        <Field label="Concentration" required htmlFor="med-concentration">
          <Input
            id="med-concentration"
            value={formData.concentration}
            onChange={e => setFormData({ ...formData, concentration: e.target.value })}
            required
            placeholder="e.g., 10mg"
          />
        </Field>
      </FormRow>

      <FormRow>
        <Field label="Quantity" required htmlFor="med-quantity">
          <Input
            id="med-quantity"
            type="number"
            value={formData.quantity}
            onChange={e => setFormData({ ...formData, quantity: parseFloat(e.target.value) || 0 })}
            required
            min="0"
            step="0.25"
          />
        </Field>
        <Field label="Unit" required>
          <Select
            value={formData.quantity_unit}
            onValueChange={(v) => setFormData({ ...formData, quantity_unit: v })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {QUANTITY_UNITS.map(u => (
                <SelectItem key={u} value={u}>{UNIT_LABELS[u]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </FormRow>

      <FormRow>
        <Field label="Low Stock Alert At" htmlFor="med-low-stock-threshold">
          <Input
            id="med-low-stock-threshold"
            type="number"
            value={formData.low_stock_threshold ?? ''}
            onChange={e => setFormData({
              ...formData,
              low_stock_threshold: e.target.value === '' ? null : parseFloat(e.target.value),
            })}
            min="0"
            step="0.25"
            placeholder="Leave blank to disable"
          />
        </Field>
        <Field label="Alert Measured In">
          <Select
            value={formData.low_stock_threshold_type || 'quantity'}
            onValueChange={(v) => setFormData({ ...formData, low_stock_threshold_type: v })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="quantity">Quantity on hand</SelectItem>
              <SelectItem value="days">Days of supply left</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </FormRow>

      <FormRow>
        <Field label="Start Date" required htmlFor="med-start-date">
          <Input
            id="med-start-date"
            type="date"
            value={formData.start_date}
            onChange={e => setFormData({ ...formData, start_date: e.target.value })}
            required
          />
        </Field>
        <Field label="Prescriber">
          <Select
            value={formData.prescriber_id ? String(formData.prescriber_id) : '__none__'}
            onValueChange={(v) => setFormData({ ...formData, prescriber_id: v === '__none__' ? '' : v })}
          >
            <SelectTrigger><SelectValue placeholder="-- No Prescriber --" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">-- No Prescriber --</SelectItem>
              {providers.map(provider => (
                <SelectItem key={provider.id} value={String(provider.id)}>
                  {provider.title ? `${provider.title} ` : ''}{provider.first_name} {provider.last_name}
                  {provider.specialty ? ` (${provider.specialty})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </FormRow>

      <Field label="Pharmacy">
        <Select
          value={formData.pharmacy_id ? String(formData.pharmacy_id) : '__none__'}
          onValueChange={(v) => setFormData({ ...formData, pharmacy_id: v === '__none__' ? '' : v })}
        >
          <SelectTrigger><SelectValue placeholder="-- No Pharmacy --" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">-- No Pharmacy --</SelectItem>
            {pharmacies.map(pharmacy => (
              <SelectItem key={pharmacy.id} value={String(pharmacy.id)}>
                {pharmacy.name}{pharmacy.phone ? ` - ${pharmacy.phone}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Instructions" required htmlFor="med-instructions">
        <Textarea
          id="med-instructions"
          value={formData.instructions}
          onChange={e => setFormData({ ...formData, instructions: e.target.value })}
          placeholder="e.g., Take with food"
          rows={2}
          required
        />
      </Field>

      <Field label="Notes" htmlFor="med-notes">
        <Textarea
          id="med-notes"
          value={formData.notes}
          onChange={e => setFormData({ ...formData, notes: e.target.value })}
          placeholder="Additional notes..."
          rows={2}
        />
      </Field>

      <FormRow>
        <div className="flex items-center gap-2">
          <Checkbox
            id="med-prn"
            checked={formData.as_needed}
            onCheckedChange={(c) => setFormData({ ...formData, as_needed: !!c })}
          />
          <Label htmlFor="med-prn">PRN (As Needed)</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="med-global"
            checked={formData.is_global}
            onCheckedChange={(c) => setFormData({ ...formData, is_global: !!c })}
          />
          <Label htmlFor="med-global">Global (Available to all patients)</Label>
        </div>
      </FormRow>

      {showStatus && (
        <Field label="Status">
          <Select
            value={formData.active ? 'active' : 'inactive'}
            onValueChange={(v) => setFormData({ ...formData, active: v === 'active' })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      )}
    </>
  );
}

const AdminV2MedicationsManage = () => {
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
  const [showPatientModal, setShowPatientModal] = useState(false);
  
  // Medications state
  const [medications, setMedications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Status filter (default to active-only; user can include inactives)
  const [showInactive, setShowInactive] = useState(false);
  
  // Providers state (for prescriber dropdown)
  const [providers, setProviders] = useState([]);
  
  // Pharmacies state (for pharmacy dropdown)
  const [pharmacies, setPharmacies] = useState([]);
  
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showBulkLowStockModal, setShowBulkLowStockModal] = useState(false);
  const [bulkLowStockDays, setBulkLowStockDays] = useState(7);
  const [bulkLowStockSaving, setBulkLowStockSaving] = useState(false);
  const [bulkLowStockResult, setBulkLowStockResult] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [selectedMedication, setSelectedMedication] = useState(null);
  
  // Schedule form state
  const [scheduleMode, setScheduleMode] = useState('weekly');
  const [selectedDays, setSelectedDays] = useState([]);
  const [selectedDayOfMonth, setSelectedDayOfMonth] = useState(1);
  const [scheduleTime, setScheduleTime] = useState('08:00');
  const [doseAmount, setDoseAmount] = useState('1.000');
  const [schedulePatientId, setSchedulePatientId] = useState('');
  const [scheduleSaving, setScheduleSaving] = useState(false);
  
  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    concentration: '',
    quantity: 1,
    quantity_unit: 'tablets',
    low_stock_threshold: null,
    low_stock_threshold_type: 'quantity',
    instructions: '',
    start_date: new Date().toISOString().split('T')[0],
    as_needed: false,
    notes: '',
    active: true,
    is_global: false,
    prescriber_id: '',
    pharmacy_id: ''
  });
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

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
    } else if (!patientId && !contextPatient && patients.length > 0 && !loadingPatients) {
      setShowPatientModal(true);
    }
  }, [searchParams, patients, loadingPatients]);

  // Update URL when context patient changes
  useEffect(() => {
    if (contextPatient && searchParams.get('patient') !== String(contextPatient.id)) {
      setSearchParams({ patient: contextPatient.id });
    }
  }, [contextPatient]);

  // Fetch medications and providers when patient is selected
  useEffect(() => {
    if (selectedPatient) {
      fetchMedications();
      fetchProviders();
      fetchPharmacies();
    }
  }, [selectedPatient]);

  const fetchMedications = async () => {
    if (!selectedPatient) return [];
    
    try {
      setLoading(true);
      setError(null);
      
      // Fetch both active and inactive medications
      const [activeRes, inactiveRes] = await Promise.all([
        fetch(`${config.apiUrl}/api/admin/medications/active?patient_id=${selectedPatient.id}`, {
          credentials: 'include'
        }),
        fetch(`${config.apiUrl}/api/admin/medications/inactive?patient_id=${selectedPatient.id}`, {
          credentials: 'include'
        })
      ]);

      if (activeRes.ok && inactiveRes.ok) {
        const activeMeds = await activeRes.json();
        const inactiveMeds = await inactiveRes.json();
        
        // Combine and sort: active first (alphabetically), then inactive (alphabetically)
        const allMeds = [
          ...activeMeds.sort((a, b) => a.name.localeCompare(b.name)),
          ...inactiveMeds.sort((a, b) => a.name.localeCompare(b.name))
        ];
        
        setMedications(allMeds);
        return allMeds;
      } else {
        setError('Failed to load medications');
        return [];
      }
    } catch (err) {
      setError('Error connecting to server');
      console.error('Error fetching medications:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchProviders = async () => {
    if (!selectedPatient) return;
    
    try {
      const response = await fetch(
        `${config.apiUrl}/api/providers/patient/${selectedPatient.id}?active_only=true`,
        { credentials: 'include' }
      );
      if (response.ok) {
        const data = await response.json();
        setProviders(data);
      }
    } catch (err) {
      console.error('Error fetching providers:', err);
    }
  };

  const fetchPharmacies = async () => {
    try {
      const response = await fetch(
        `${config.apiUrl}/api/medications/pharmacies`,
        { credentials: 'include' }
      );
      if (response.ok) {
        const data = await response.json();
        setPharmacies(data.pharmacies || []);
      }
    } catch (err) {
      console.error('Error fetching pharmacies:', err);
    }
  };

  const handleSelectPatient = (patient) => {
    setContextPatient(patient);
    setSearchParams({ patient: patient.id });
    setShowPatientModal(false);
  };

  const handleChangePatient = () => {
    setShowPatientModal(true);
  };

  const handleCreateMedication = async (e) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);

    try {
      const payload = {
        ...formData,
        prescriber_id: formData.prescriber_id ? parseInt(formData.prescriber_id) : null,
        pharmacy_id: formData.pharmacy_id ? parseInt(formData.pharmacy_id) : null,
        is_patient_specific: !formData.is_global,
        admin_patient_id: formData.is_global ? null : selectedPatient.id
      };

      const response = await fetch(`${config.apiUrl}/api/add/medication`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        setShowCreateModal(false);
        resetForm();
        fetchMedications();
      } else {
        const data = await response.json();
        if (Array.isArray(data.detail)) {
          setFormError(data.detail.map(err => err.msg).join(', '));
        } else {
          setFormError(data.detail || 'Failed to create medication');
        }
      }
    } catch (err) {
      setFormError('Error connecting to server');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateMedication = async (e) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);

    try {
      const payload = {
        ...formData,
        prescriber_id: formData.prescriber_id ? parseInt(formData.prescriber_id) : null,
        pharmacy_id: formData.pharmacy_id ? parseInt(formData.pharmacy_id) : null
      };
      
      const response = await fetch(`${config.apiUrl}/api/medications/${selectedMedication.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        setShowEditModal(false);
        resetForm();
        fetchMedications();
      } else {
        const data = await response.json();
        setFormError(data.detail || 'Failed to update medication');
      }
    } catch (err) {
      setFormError('Error connecting to server');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMedication = async () => {
    setSaving(true);
    try {
      const response = await fetch(`${config.apiUrl}/api/medications/${selectedMedication.id}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (response.ok) {
        setShowDeleteModal(false);
        setSelectedMedication(null);
        fetchMedications();
      } else {
        const data = await response.json();
        setFormError(data.detail || 'Failed to delete medication');
      }
    } catch (err) {
      setFormError('Error connecting to server');
    } finally {
      setSaving(false);
    }
  };

  const handleBulkLowStock = async (e) => {
    e.preventDefault();
    setFormError(null);
    setBulkLowStockSaving(true);
    try {
      const response = await fetch(`${config.apiUrl}/api/medications/low-stock-threshold/apply-days`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ days: bulkLowStockDays })
      });
      if (response.ok) {
        const data = await response.json();
        setBulkLowStockResult(data);
        fetchMedications();
      } else {
        const data = await response.json();
        setFormError(data.detail || 'Failed to apply low-stock alerts');
      }
    } catch {
      setFormError('Error connecting to server');
    } finally {
      setBulkLowStockSaving(false);
    }
  };

  const openEditModal = (medication) => {
    setSelectedMedication(medication);
    setFormData({
      name: medication.name,
      concentration: medication.concentration || '',
      quantity: medication.quantity,
      quantity_unit: medication.quantity_unit,
      low_stock_threshold: medication.low_stock_threshold ?? null,
      low_stock_threshold_type: medication.low_stock_threshold_type || 'quantity',
      instructions: medication.instructions || '',
      start_date: medication.start_date ? medication.start_date.split('T')[0] : new Date().toISOString().split('T')[0],
      as_needed: medication.as_needed,
      notes: medication.notes || '',
      active: medication.active,
      is_global: medication.is_global || false,
      prescriber_id: medication.prescriber_id ? String(medication.prescriber_id) : '',
      pharmacy_id: medication.pharmacy_id ? String(medication.pharmacy_id) : ''
    });
    setFormError(null);
    setShowEditModal(true);
  };

  const openDeleteModal = (medication) => {
    setSelectedMedication(medication);
    setFormError(null);
    setShowDeleteModal(true);
  };

  const openScheduleModal = (medication) => {
    setSelectedMedication(medication);
    setScheduleMode('weekly');
    setSelectedDays([]);
    setSelectedDayOfMonth(1);
    setScheduleTime('08:00');
    setDoseAmount('1.000');
    // For global meds, default to current patient if available
    setSchedulePatientId(medication.is_global && selectedPatient ? String(selectedPatient.id) : '');
    setFormError(null);
    setShowScheduleModal(true);
  };

  // Get schedules relevant to current patient
  const getRelevantSchedules = (schedules) => {
    if (!schedules || schedules.length === 0) return [];
    if (!selectedMedication?.is_global && selectedPatient) {
      return schedules.filter(s => s.patient_id === selectedPatient.id);
    }
    return schedules;
  };

  const handleAddSchedule = async () => {
    if (scheduleMode === 'weekly' && selectedDays.length === 0) {
      setFormError('Please select at least one day');
      return;
    }
    
    if (selectedMedication?.is_global && !schedulePatientId) {
      setFormError('Please select a patient for this global medication');
      return;
    }
    
    setScheduleSaving(true);
    setFormError(null);
    
    try {
      let cron = '';
      let description = '';

      if (scheduleMode === 'weekly') {
        // Convert local time AND local days-of-week to UTC together — the cron's
        // day list must shift when the time conversion crosses midnight.
        const utc = localTimeAndDaysToUTC(scheduleTime, selectedDays);
        cron = `${utc.minute} ${utc.hour} * * ${utc.days.join(',')}`;
        const dayNames = selectedDays
          .slice()
          .sort((a, b) => parseInt(a) - parseInt(b))
          .map(d => daysOfWeek[parseInt(d)])
          .join(', ');
        description = `${dayNames} at ${scheduleTime}`;
      } else {
        const utc = localTimeToUTC(scheduleTime);
        cron = `${utc.minute} ${utc.hour} ${selectedDayOfMonth} * *`;
        description = `Day ${selectedDayOfMonth} of each month at ${scheduleTime}`;
      }
      
      const scheduleData = {
        type: 'med',
        cron_expression: cron,
        description: description,
        dose_amount: parseFloat(doseAmount) || 1.0,
        active: true,
        notes: ''
      };
      
      if (selectedMedication?.is_global && schedulePatientId) {
        scheduleData.patient_id = parseInt(schedulePatientId);
      }
      
      const response = await fetch(`${config.apiUrl}/api/add/schedule/${selectedMedication.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(scheduleData)
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to add schedule');
      }
      
      // Refresh medications and reset form
      const updatedMeds = await fetchMedications();
      setSelectedDays([]);
      setSelectedDayOfMonth(1);
      setScheduleTime('08:00');
      setDoseAmount('1.000');
      setScheduleMode('weekly');
      
      // Update the selected medication with refreshed data
      const refreshedMed = updatedMeds.find(m => m.id === selectedMedication.id);
      if (refreshedMed) {
        setSelectedMedication(refreshedMed);
      }
    } catch (err) {
      setFormError(err.message || 'Error adding schedule');
    } finally {
      setScheduleSaving(false);
    }
  };

  const handleDeleteSchedule = async (scheduleId) => {
    if (!confirm('Are you sure you want to delete this schedule?')) return;
    
    setScheduleSaving(true);
    try {
      const response = await fetch(`${config.apiUrl}/api/schedules/${scheduleId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete schedule');
      }
      
      const updatedMeds = await fetchMedications();
      const refreshedMed = updatedMeds.find(m => m.id === selectedMedication?.id);
      if (refreshedMed) {
        setSelectedMedication(refreshedMed);
      }
    } catch (err) {
      setFormError('Error deleting schedule');
    } finally {
      setScheduleSaving(false);
    }
  };

  const handleToggleSchedule = async (scheduleId) => {
    setScheduleSaving(true);
    try {
      const response = await fetch(`${config.apiUrl}/api/schedules/${scheduleId}/toggle-active`, {
        method: 'POST',
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to toggle schedule');
      }
      
      const updatedMeds = await fetchMedications();
      const refreshedMed = updatedMeds.find(m => m.id === selectedMedication?.id);
      if (refreshedMed) {
        setSelectedMedication(refreshedMed);
      }
    } catch (err) {
      setFormError('Error updating schedule');
    } finally {
      setScheduleSaving(false);
    }
  };

  const openCreateModal = () => {
    resetForm();
    setShowCreateModal(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      concentration: '',
      quantity: 1,
      quantity_unit: 'tablets',
      low_stock_threshold: null,
      low_stock_threshold_type: 'quantity',
      instructions: '',
      start_date: new Date().toISOString().split('T')[0],
      as_needed: false,
      notes: '',
      active: true,
      is_global: false,
      prescriber_id: '',
      pharmacy_id: ''
    });
    setFormError(null);
    setSelectedMedication(null);
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
            {error && (
              <div className="tw mb-4"><Alert variant="destructive">{error}</Alert></div>
            )}

            {/* Summary Stats */}
            <div className="admin-v2-summary-stats admin-v2-medications-summary" style={{ marginBottom: '1.5rem' }}>
              <div className="admin-v2-stat-card">
                <div className="admin-v2-stat-info">
                  <h4>{medications.filter(m => m.active).length}</h4>
                  <p>Active</p>
                </div>
              </div>
              <div className="admin-v2-stat-card">
                <div className="admin-v2-stat-info">
                  <h4>{medications.filter(m => m.as_needed).length}</h4>
                  <p>PRN (As Needed)</p>
                </div>
              </div>
              <div className="admin-v2-stat-card">
                <div className="admin-v2-stat-info">
                  <h4>{medications.filter(m => !m.active).length}</h4>
                  <p>Inactive</p>
                </div>
              </div>
            </div>

            {/* Add Medication Button + Filter */}
            <div className="tw mb-4 flex flex-wrap items-center gap-3">
              {hasPermission('medications.create') && (
                <Button onClick={openCreateModal}>
                  <PlusIcon size={16} /> Add Medication
                </Button>
              )}
              {hasPermission('medications.update') && (
                <Button variant="secondary" onClick={() => { setBulkLowStockResult(null); setShowBulkLowStockModal(true); }}>
                  Bulk Low-Stock Alert
                </Button>
              )}
              <label className="ml-auto flex items-center gap-2 text-sm text-foreground">
                <Checkbox
                  checked={showInactive}
                  onCheckedChange={(c) => setShowInactive(!!c)}
                />
                Show inactive
              </label>
            </div>

            {/* Medications list — table on desktop, stacked cards on mobile */}
            {loading ? (
              <div className="admin-v2-loading">Loading medications...</div>
            ) : (() => {
              const visibleMeds = showInactive
                ? medications
                : medications.filter(m => m.active);
              if (visibleMeds.length === 0) {
                return (
                  <div className="admin-v2-empty-state">
                    <MedicationsIcon size={32} />
                    <p>
                      {showInactive
                        ? 'No medications found for this patient'
                        : 'No active medications. Enable "Show inactive" to see inactive ones.'}
                    </p>
                  </div>
                );
              }
              return (
                <>
                  {/* Desktop: table */}
                  <div className="admin-v2-table-container admin-v2-meds-desktop">
                    <table className="admin-v2-table">
                      <thead>
                        <tr>
                          <th>Medication</th>
                          <th>Concentration</th>
                          <th>Qty</th>
                          <th>Instructions</th>
                          <th>Type</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleMeds.map(med => (
                          <tr key={med.id} className={!med.active ? 'admin-v2-row-inactive' : ''}>
                            <td>
                              <div className="admin-v2-med-name">
                                <strong>{med.name}</strong>
                                {med.is_global && (
                                  <span className="admin-v2-badge admin-v2-badge-info">Global</span>
                                )}
                              </div>
                            </td>
                            <td>{med.concentration || '-'}</td>
                            <td>{med.quantity} {med.quantity_unit}</td>
                            <td className="admin-v2-instructions-cell">
                              {med.instructions || '-'}
                            </td>
                            <td>
                              {med.as_needed ? (
                                <span className="admin-v2-badge admin-v2-badge-warning">PRN</span>
                              ) : (
                                <span className="admin-v2-badge admin-v2-badge-secondary">Scheduled</span>
                              )}
                            </td>
                            <td>
                              <span className={`admin-v2-status-badge ${med.active ? 'active' : 'inactive'}`}>
                                {med.active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td>
                              <div className="admin-v2-table-actions">
                                {hasPermission('medications.update') && (
                                  <button
                                    className="admin-v2-action-btn admin-v2-action-btn-schedule"
                                    onClick={() => openScheduleModal(med)}
                                    title="Manage schedules"
                                  >
                                    <ClockIcon size={14} />
                                    <span>Schedule</span>
                                    {med.schedules && med.schedules.length > 0 && (
                                      <span className="admin-v2-schedule-count">{med.schedules.length}</span>
                                    )}
                                  </button>
                                )}
                                {hasPermission('medications.update') && (
                                  <button
                                    className="admin-v2-action-btn admin-v2-action-btn-edit"
                                    onClick={() => openEditModal(med)}
                                    title="Edit medication"
                                  >
                                    <EditIcon size={14} />
                                    <span>Edit</span>
                                  </button>
                                )}
                                {hasPermission('medications.delete') && !med.is_global && (
                                  <button
                                    className="admin-v2-action-btn admin-v2-action-btn-delete"
                                    onClick={() => openDeleteModal(med)}
                                    title="Delete medication"
                                  >
                                    <TrashIcon size={14} />
                                    <span>Delete</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile: stacked cards */}
                  <div className="admin-v2-meds-cards">
                    {visibleMeds.map(med => (
                      <div
                        key={med.id}
                        className={`admin-v2-med-card ${!med.active ? 'admin-v2-med-card-inactive' : ''}`}
                      >
                        <div className="admin-v2-med-card-row admin-v2-med-card-header">
                          <div className="admin-v2-med-card-title">
                            <strong>{med.name}</strong>
                            {med.concentration && (
                              <span className="admin-v2-med-card-concentration">{med.concentration}</span>
                            )}
                          </div>
                          <div className="admin-v2-med-card-badges">
                            {med.as_needed ? (
                              <span className="admin-v2-badge admin-v2-badge-warning">PRN</span>
                            ) : (
                              <span className="admin-v2-badge admin-v2-badge-secondary">SCH</span>
                            )}
                            {med.is_global && (
                              <span className="admin-v2-badge admin-v2-badge-info">Global</span>
                            )}
                            <span className={`admin-v2-status-badge ${med.active ? 'active' : 'inactive'}`}>
                              {med.active ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                        </div>

                        {med.instructions && (
                          <div className="admin-v2-med-card-instructions">{med.instructions}</div>
                        )}

                        <div className="admin-v2-med-card-row admin-v2-med-card-meta">
                          <div className="admin-v2-med-card-meta-item">
                            <span className="admin-v2-med-card-label">Qty</span>
                            <span>{med.quantity} {med.quantity_unit}</span>
                          </div>
                          {med.schedules && med.schedules.length > 0 && (
                            <div className="admin-v2-med-card-meta-item">
                              <span className="admin-v2-med-card-label">Schedules</span>
                              <span>{med.schedules.length}</span>
                            </div>
                          )}
                        </div>

                        <div className="admin-v2-med-card-actions">
                          {hasPermission('medications.update') && (
                            <button
                              className="admin-v2-action-btn admin-v2-action-btn-schedule"
                              onClick={() => openScheduleModal(med)}
                            >
                              <ClockIcon size={14} />
                              <span>Schedule</span>
                              {med.schedules && med.schedules.length > 0 && (
                                <span className="admin-v2-schedule-count">{med.schedules.length}</span>
                              )}
                            </button>
                          )}
                          {hasPermission('medications.update') && (
                            <button
                              className="admin-v2-action-btn admin-v2-action-btn-edit"
                              onClick={() => openEditModal(med)}
                            >
                              <EditIcon size={14} />
                              <span>Edit</span>
                            </button>
                          )}
                          {hasPermission('medications.delete') && !med.is_global && (
                            <button
                              className="admin-v2-action-btn admin-v2-action-btn-delete"
                              onClick={() => openDeleteModal(med)}
                            >
                              <TrashIcon size={14} />
                              <span>Delete</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
          </>
        ) : (
          <div className="admin-v2-no-patient">
            <MedicationsIcon size={48} />
            <h2>Select a Patient</h2>
            <p>Choose a patient to view and manage their medications</p>
            <div className="tw">
              <Button onClick={() => setShowPatientModal(true)}>Select Patient</Button>
            </div>
          </div>
        )}

        {/* Patient Selector Modal */}
        {showPatientModal && (
          <PatientSelectorModal
            patients={patients}
            selectedPatient={selectedPatient}
            onSelectPatient={handleSelectPatient}
            onClose={() => setShowPatientModal(false)}
            loading={loadingPatients}
          />
        )}

        {/* Create Medication Modal */}
        <Dialog open={showCreateModal} onOpenChange={(o) => { if (!o) setShowCreateModal(false); }}>
          <DialogContent className="sm:max-w-[600px]" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Add Medication</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateMedication} className="flex flex-col gap-4">
              {formError && <Alert variant="destructive">{formError}</Alert>}
              <MedicationFormFields
                formData={formData}
                setFormData={setFormData}
                providers={providers}
                pharmacies={pharmacies}
              />
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setShowCreateModal(false)}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving ? 'Creating...' : 'Add Medication'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Bulk Low-Stock Alert Modal */}
        <Dialog open={showBulkLowStockModal} onOpenChange={(o) => { if (!o) setShowBulkLowStockModal(false); }}>
          <DialogContent className="sm:max-w-[480px]" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Bulk Low-Stock Alert</DialogTitle>
            </DialogHeader>
            {bulkLowStockResult ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-foreground">
                  Applied a {bulkLowStockDays}-day low-stock alert to {bulkLowStockResult.updated_count} medication{bulkLowStockResult.updated_count === 1 ? '' : 's'}:
                </p>
                <p className="text-sm text-muted-foreground">
                  {bulkLowStockResult.medications.join(', ') || 'None had an active schedule.'}
                </p>
                <DialogFooter>
                  <Button onClick={() => setShowBulkLowStockModal(false)}>Done</Button>
                </DialogFooter>
              </div>
            ) : (
              <form onSubmit={handleBulkLowStock} className="flex flex-col gap-4">
                {formError && <Alert variant="destructive">{formError}</Alert>}
                <p className="text-sm text-muted-foreground">
                  Sets a days-of-supply low-stock alert on every active medication that has
                  an active schedule, replacing any existing threshold. As-needed meds without
                  a schedule are skipped (their usage can't be projected).
                </p>
                <Field label="Alert when supply drops below (days)" required htmlFor="bulk-low-stock-days">
                  <Input
                    id="bulk-low-stock-days"
                    type="number"
                    value={bulkLowStockDays}
                    onChange={e => setBulkLowStockDays(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    required
                    min="1"
                    max="365"
                    step="1"
                  />
                </Field>
                <DialogFooter>
                  <Button type="button" variant="secondary" onClick={() => setShowBulkLowStockModal(false)}>Cancel</Button>
                  <Button type="submit" disabled={bulkLowStockSaving || !bulkLowStockDays}>
                    {bulkLowStockSaving ? 'Applying...' : 'Apply to All Scheduled Meds'}
                  </Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>

        {/* Edit Medication Modal */}
        <Dialog open={showEditModal && !!selectedMedication} onOpenChange={(o) => { if (!o) setShowEditModal(false); }}>
          <DialogContent className="sm:max-w-[600px]" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Edit Medication{selectedMedication ? `: ${selectedMedication.name}` : ''}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleUpdateMedication} className="flex flex-col gap-4">
              {formError && <Alert variant="destructive">{formError}</Alert>}
              <MedicationFormFields
                formData={formData}
                setFormData={setFormData}
                providers={providers}
                pharmacies={pharmacies}
                showStatus
              />
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setShowEditModal(false)}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Modal */}
        <Dialog open={showDeleteModal && !!selectedMedication} onOpenChange={(o) => { if (!o) setShowDeleteModal(false); }}>
          <DialogContent className="sm:max-w-[440px]" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Delete Medication</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              {formError && <Alert variant="destructive">{formError}</Alert>}
              <p className="text-sm text-foreground">
                Are you sure you want to delete <strong>{selectedMedication?.name}</strong>?
              </p>
              <p className="text-sm text-muted-foreground">This will also delete all associated schedules and history.</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setShowDeleteModal(false)}>Cancel</Button>
              <Button type="button" variant="destructive" onClick={handleDeleteMedication} disabled={saving}>
                {saving ? 'Deleting...' : 'Delete Medication'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Schedule Modal */}
        <Dialog open={showScheduleModal && !!selectedMedication} onOpenChange={(o) => { if (!o) setShowScheduleModal(false); }}>
          <DialogContent className="sm:max-w-[720px]" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Manage Schedules{selectedMedication ? `: ${selectedMedication.name}` : ''}</DialogTitle>
            </DialogHeader>

            {selectedMedication && (
              <div className="flex flex-col gap-4">
                {formError && <Alert variant="destructive">{formError}</Alert>}

                {/* Add New Schedule */}
                <h4 className="text-sm font-semibold text-foreground">Add New Schedule</h4>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={scheduleMode === 'weekly' ? 'default' : 'secondary'}
                    onClick={() => setScheduleMode('weekly')}
                  >
                    Weekly
                  </Button>
                  <Button
                    type="button"
                    variant={scheduleMode === 'monthly' ? 'default' : 'secondary'}
                    onClick={() => setScheduleMode('monthly')}
                  >
                    Monthly
                  </Button>
                </div>

                {scheduleMode === 'weekly' ? (
                  <Field label="Select Days">
                    <div className="admin-v2-day-selector">
                      {daysOfWeek.map((day, i) => (
                        <button
                          key={day}
                          type="button"
                          className={`admin-v2-day-btn ${selectedDays.includes(i.toString()) ? 'selected' : ''}`}
                          onClick={() => {
                            setSelectedDays(prev =>
                              prev.includes(i.toString())
                                ? prev.filter(x => x !== i.toString())
                                : [...prev, i.toString()]
                            );
                          }}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                  </Field>
                ) : (
                  <Field label="Day of Month">
                    <Select
                      value={String(selectedDayOfMonth)}
                      onValueChange={(v) => setSelectedDayOfMonth(Number(v))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[...Array(28)].map((_, i) => (
                          <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}

                {/* Patient Selection for Global Meds */}
                {selectedMedication.is_global && (
                  <Field label="Patient" required>
                    <Select
                      value={schedulePatientId || '__none__'}
                      onValueChange={(v) => setSchedulePatientId(v === '__none__' ? '' : v)}
                    >
                      <SelectTrigger><SelectValue placeholder="Select a patient..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Select a patient...</SelectItem>
                        {patients.map(patient => (
                          <SelectItem key={patient.id} value={String(patient.id)}>
                            {patient.first_name} {patient.last_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}

                <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                  <Field label="Time" htmlFor="med-sched-time" className="sm:flex-1">
                    <Input
                      id="med-sched-time"
                      type="time"
                      value={scheduleTime}
                      onChange={e => setScheduleTime(e.target.value)}
                    />
                  </Field>
                  <Field label={`Dose Amount (${selectedMedication.quantity_unit || 'units'})`} htmlFor="med-sched-dose" className="sm:flex-1">
                    <Input
                      id="med-sched-dose"
                      type="number"
                      step="0.001"
                      min="0"
                      value={doseAmount}
                      onChange={e => setDoseAmount(e.target.value)}
                      placeholder="1.000"
                    />
                  </Field>
                  <Button
                    type="button"
                    onClick={handleAddSchedule}
                    disabled={scheduleSaving || (scheduleMode === 'weekly' && selectedDays.length === 0)}
                  >
                    {scheduleSaving ? 'Adding...' : 'Add Schedule'}
                  </Button>
                </div>

                {/* Current Schedules */}
                <h4 className="text-sm font-semibold text-foreground">Current Schedules</h4>

                {selectedMedication.schedules && selectedMedication.schedules.length > 0 ? (
                  <div className="admin-v2-table-container">
                    <table className="admin-v2-table">
                      <thead>
                        <tr>
                          <th>Dose</th>
                          <th>Time</th>
                          <th>Schedule</th>
                          {selectedMedication.is_global && <th>Patient</th>}
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedMedication.schedules.map(schedule => {
                          const parsed = parseCronExpression(schedule.cron_expression);
                          const patientName = selectedMedication.is_global && schedule.patient_id
                            ? patients.find(p => p.id === schedule.patient_id)
                            : null;

                          return (
                            <tr key={schedule.id}>
                              <td><strong>{schedule.dose_amount}</strong> {selectedMedication.quantity_unit || 'units'}</td>
                              <td>{parsed?.time || '-'}</td>
                              <td>
                                {parsed?.type === 'weekly' && parsed.days}
                                {parsed?.type === 'monthly' && `Day ${parsed.dayOfMonth} monthly`}
                              </td>
                              {selectedMedication.is_global && (
                                <td>{patientName ? `${patientName.first_name} ${patientName.last_name}` : '-'}</td>
                              )}
                              <td>
                                <span className={`admin-v2-status-badge ${schedule.active ? 'active' : 'inactive'}`}>
                                  {schedule.active ? 'Active' : 'Paused'}
                                </span>
                              </td>
                              <td>
                                <div className="admin-v2-table-actions">
                                  <button
                                    type="button"
                                    className={`admin-v2-action-btn ${schedule.active ? 'admin-v2-action-btn-warning' : 'admin-v2-action-btn-success'}`}
                                    onClick={() => handleToggleSchedule(schedule.id)}
                                    disabled={scheduleSaving}
                                  >
                                    {schedule.active ? 'Pause' : 'Resume'}
                                  </button>
                                  <button
                                    type="button"
                                    className="admin-v2-action-btn admin-v2-action-btn-delete"
                                    onClick={() => handleDeleteSchedule(schedule.id)}
                                    disabled={scheduleSaving}
                                  >
                                    <TrashIcon size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="admin-v2-empty-state">
                    <ClockIcon size={32} />
                    <p>No schedules created yet</p>
                    <p className="admin-v2-text-muted">Add a schedule using the form above</p>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setShowScheduleModal(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2MedicationsManage;
