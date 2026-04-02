import React, { useState, useEffect } from 'react';
import ModalBase from './ModalBase';
import config from '../config';
import MedicationHistory from './medication/MedicationHistory';
import MedicationScheduleView, { medicationStatusUtils } from './medication/MedicationScheduleView';
import { useAdminPatient } from '../contexts/AdminPatientContext';

const MedicationModal = ({ onClose }) => {
  const { selectedPatient } = useAdminPatient();
  const [tab, setTab] = useState('scheduled');
  const [activeMedications, setActiveMedications] = useState([]);
  const [inactiveMedications, setInactiveMedications] = useState([]);
  const [scheduledMedications, setScheduledMedications] = useState({ scheduled_medications: [] });
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingMed, setEditingMed] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showScheduleFor, setShowScheduleFor] = useState(null); // med id or null
  const [showHistory, setShowHistory] = useState(false); // show history view
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  // Remove endDate from formData
  const [formData, setFormData] = useState({
    name: '',
    concentration: '',
    quantity: '',
    quantityUnit: 'tablets',
    instructions: '',
    startDate: '',
    asNeeded: false,
    notes: '',
    isPatientSpecific: false,
    prescriberId: '',
    pharmacyId: ''
  });

  // Provider and pharmacy state
  const [providers, setProviders] = useState([]);
  const [pharmacies, setPharmacies] = useState([]);

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState({ open: false, item: null });
  
  // Skip confirmation modal state
  const [skipModal, setSkipModal] = useState({ open: false, item: null });

  // Mark All modal state
  const [markAllModal, setMarkAllModal] = useState({ 
    open: false, 
    timeGroup: null, 
    medications: [], 
    selectedMeds: new Set(),
    loading: false,
    completedMeds: new Set()
  });

  // Status filter state for scheduled medications
  const [statusFilters, setStatusFilters] = useState({
    on_time: false,
    warning: false,
    late_early: false,
    upcoming: true,
    missed: true,
    skipped: false,
    ready_to_take: true
  });

  // Status filters visibility toggle
  const [showFilters, setShowFilters] = useState(false);

  // Mobile detection
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Load medications when patient or tab changes
  useEffect(() => {
    if (!selectedPatient) return;
    fetchMedications();
    fetchPharmacies();
    fetchProviders();
    if (tab === 'scheduled') {
      fetchScheduledMedications();
    }
  }, [tab, selectedPatient?.id]);

  const fetchProviders = async () => {
    if (!selectedPatient) return;
    try {
      const response = await fetch(
        `${config.apiUrl}/api/providers/patient/${selectedPatient.id}?active_only=true`,
        { credentials: 'include' }
      );
      if (response.ok) {
        const data = await response.json();
        setProviders(data || []);
      }
    } catch (error) {
      console.error('Error fetching providers:', error);
      setProviders([]);
    }
  };

  const fetchPharmacies = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/medications/pharmacies`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setPharmacies(data.pharmacies || []);
      }
    } catch (error) {
      console.error('Error fetching pharmacies:', error);
      setPharmacies([]);
    }
  };

  const fetchMedications = async () => {
    if (!selectedPatient) return;
    setLoading(true);
    try {
      const [activeRes, inactiveRes] = await Promise.all([
        fetch(`${config.apiUrl}/api/admin/medications/active?patient_id=${selectedPatient.id}`, {
          credentials: 'include'
        }),
        fetch(`${config.apiUrl}/api/admin/medications/inactive?patient_id=${selectedPatient.id}`, {
          credentials: 'include'
        })
      ]);

      if (activeRes.ok && inactiveRes.ok) {
        const active = await activeRes.json();
        const inactive = await inactiveRes.json();

        // Admin endpoints already include schedules
        setActiveMedications(active);
        setInactiveMedications(inactive);
      }
    } catch (error) {
      console.error('Error fetching medications:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchScheduledMedications = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${config.apiUrl}/api/schedules/daily${selectedPatient ? `?patient_id=${selectedPatient.id}` : ''}`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setScheduledMedications(data);
      }
    } catch (error) {
      console.error('Error fetching scheduled medications:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMedicationSchedules = async (medicationId) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/medications/${medicationId}/schedules`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        return data.schedules || [];
      }
      return [];
    } catch (error) {
      console.error('Error fetching schedules for medication:', medicationId, error);
      return [];
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      concentration: '',
      quantity: '',
      quantityUnit: 'tablets',
      instructions: '',
      startDate: '',
      asNeeded: false,
      notes: '',
      isPatientSpecific: false,
      prescriberId: '',
      pharmacyId: ''
    });
    setEditingMed(null);
    // Don't automatically hide the form - let the caller decide
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      if (editingMed) {
        // Update existing medication
        const response = await fetch(`${config.apiUrl}/api/medications/${editingMed.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            name: formData.name,
            concentration: formData.concentration,
            quantity: formData.quantity,
            quantity_unit: formData.quantityUnit,
            instructions: formData.instructions,
            start_date: formData.startDate,
            as_needed: formData.asNeeded,
            notes: formData.notes,
            is_patient_specific: formData.isPatientSpecific,
            prescriber_id: formData.prescriberId || null,
            pharmacy_id: formData.pharmacyId || null
          })
        });

        if (!response.ok) {
          throw new Error('Failed to update medication');
        }
      } else {
        // Add new medication
        const response = await fetch(`${config.apiUrl}/api/add/medication`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            name: formData.name,
            concentration: formData.concentration,
            quantity: formData.quantity,
            quantity_unit: formData.quantityUnit,
            instructions: formData.instructions,
            start_date: formData.startDate,
            as_needed: formData.asNeeded,
            notes: formData.notes,
            is_patient_specific: formData.isPatientSpecific,
            prescriber_id: formData.prescriberId || null,
            pharmacy_id: formData.pharmacyId || null,
            admin_patient_id: formData.isPatientSpecific && selectedPatient ? selectedPatient.id : null
          })
        });
        
        if (!response.ok) {
          throw new Error('Failed to add medication');
        }
      }
      
      // Refresh medications list
      await fetchMedications();
      resetForm();
      setShowAddForm(false);
      setShowScheduleFor(null);
      setEditingMed(null);
    } catch (error) {
      console.error('Error saving medication:', error);
      alert('Error saving medication. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (med) => {
    console.log('Editing medication:', med); // Debug log
    setFormData({
      name: med.name,
      concentration: med.concentration || '',
      quantity: med.quantity || '',
      quantityUnit: med.quantity_unit || 'tablets',
      instructions: med.instructions || '',
      startDate: med.start_date || '',
      asNeeded: med.as_needed || false,
      notes: med.notes || '',
      isPatientSpecific: med.patient_id !== null,
      prescriberId: med.prescriber_id ? String(med.prescriber_id) : '',
      pharmacyId: med.pharmacy_id ? String(med.pharmacy_id) : ''
    });
    setEditingMed(med);
    setShowAddForm(true);
    setShowScheduleFor(null);
    setShowHistory(false);
    setTab('active'); // Switch to active tab when editing
  };

  const handleDelete = async (id) => {
    if (confirm('Are you sure you want to delete this medication?')) {
      setLoading(true);
      try {
        const response = await fetch(`${config.apiUrl}/api/medications/${id}`, {
          method: 'DELETE',
          credentials: 'include'
        });
        
        if (!response.ok) {
          throw new Error('Failed to delete medication');
        }
        
        await fetchMedications();
      } catch (error) {
        console.error('Error deleting medication:', error);
        alert('Error deleting medication. Please try again.');
      } finally {
        setLoading(false);
      }
    }
  };

  const toggleActive = async (id) => {
    setLoading(true);
    try {
      const response = await fetch(`${config.apiUrl}/api/medications/${id}/toggle-active`, {
        method: 'POST',
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to toggle medication status');
      }
      
      await fetchMedications();
    } catch (error) {
      console.error('Error toggling medication status:', error);
      alert('Error updating medication status. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatSchedule = (med) => {
    if (med.asNeeded) return 'As needed';
    
    if (med.scheduleDays && med.scheduleDays.length > 0) {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const selectedDays = med.scheduleDays.map(day => days[day]).join(', ');
      return `${selectedDays} at ${med.scheduleTime}`;
    }
    
    return 'No schedule set';
  };

  const formatTime = (timeString) => {
    try {
      const date = new Date(timeString);
      return date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
    } catch (error) {
      return timeString;
    }
  };

  const formatDate = (dateString) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        weekday: 'short',
        month: 'short', 
        day: 'numeric' 
      });
    } catch (error) {
      return dateString;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed_on_time':
        return { bg: '#e8f5e8', border: '#28a745', text: '#155724' };
      case 'completed_warning':
        return { bg: '#fff3cd', border: '#ffc107', text: '#856404' };
      case 'completed_late':
        return { bg: '#f8d7da', border: '#dc3545', text: '#721c24' };
      case 'skipped':
        return { bg: '#e2e3e5', border: '#6c757d', text: '#495057' };
      case 'due_on_time':
        return { bg: '#d4edda', border: '#28a745', text: '#155724' };
      case 'due_warning':
        return { bg: '#fff3cd', border: '#ffc107', text: '#856404' };
      case 'due_late':
        return { bg: '#f8d7da', border: '#dc3545', text: '#721c24' };
      case 'missed':
        return { bg: '#f8d7da', border: '#dc3545', text: '#721c24' };
      case 'pending':
        return { bg: '#d1ecf1', border: '#17a2b8', text: '#0c5460' };
      default:
        return { bg: '#f8f9fa', border: '#6c757d', text: '#495057' };
    }
  };

  const getStatusText = (item) => {
    const status = item.status;
    const isToday = new Date(item.scheduled_time).toDateString() === new Date().toDateString();
    
    switch (status) {
      case 'completed_on_time':
        return isToday ? 'Completed' : 'Completed on time';
      case 'completed_warning':
        return isToday ? 'Completed (timing off)' : 'Completed with timing variance';
      case 'completed_late':
        return isToday ? 'Completed (very late/early)' : 'Completed with significant timing variance';
      case 'skipped':
        return 'Skipped';
      case 'due_on_time':
        return 'Ready to take';
      case 'due_warning':
        return 'Late (1-2 hours)';
      case 'due_late':
        return 'Very late (>2 hours)';
      case 'missed':
        return 'Missed';
      case 'pending':
        return 'Upcoming';
      default:
        return 'Unknown';
    }
  };

  // Helper function to parse cron expression
  const allMedications = [...activeMedications, ...inactiveMedications];

  const renderMedicationCard = (med) => (
    <div key={med.id} className="medication-card" style={{
      backgroundColor: '#fff',
      borderRadius: '6px',
      padding: '12px',
      marginBottom: '8px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      border: `1px solid ${med.active ? '#28a745' : '#6c757d'}`,
      borderLeft: `4px solid ${med.active ? '#28a745' : '#6c757d'}`
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <h4 style={{ margin: 0, color: '#333', fontSize: '16px', fontWeight: '600', truncate: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
              {med.name}
            </h4>
            {med.concentration && (
              <span style={{ fontSize: '12px', color: '#666', fontWeight: '500' }}>
                {med.concentration}
              </span>
            )}
          </div>
          
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', fontSize: '13px', color: '#666' }}>
            <span>
              <strong>{med.quantity}</strong> {med.quantity_unit || med.quantityUnit || 'units'}
            </span>
            {med.startDate && (
              <span>
                Start: {new Date(med.startDate).toLocaleDateString()}
              </span>
            )}
            {med.schedules && med.schedules.length > 0 && (
              <span style={{ 
                background: '#e3f2fd', 
                color: '#1976d2', 
                padding: '2px 6px', 
                borderRadius: '10px', 
                fontSize: '11px',
                fontWeight: '600'
              }}>
                {med.schedules.length} schedule{med.schedules.length !== 1 ? 's' : ''}
              </span>
            )}
            {med.is_global !== undefined && (
              <span style={{ 
                background: med.is_global ? '#f0f0f0' : '#e8f5e8', 
                color: med.is_global ? '#666' : '#28a745', 
                padding: '2px 6px', 
                borderRadius: '10px', 
                fontSize: '11px',
                fontWeight: '600'
              }}>
                {med.is_global ? 'Global' : 'Patient'}
              </span>
            )}
          </div>
          
          {med.notes && (
            <div style={{ fontSize: '12px', color: '#777', marginTop: '4px', fontStyle: 'italic' }}>
              {med.notes.length > 50 ? med.notes.substring(0, 50) + '...' : med.notes}
            </div>
          )}
        </div>
        
        <div style={{ display: 'flex', gap: '4px', marginLeft: '12px', flexShrink: 0 }}>
          <button
            onClick={() => setShowScheduleFor(med.id)}
            style={{
              padding: '4px 8px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: med.schedules && med.schedules.length > 0 ? '#ffc107' : '#17a2b8',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: '600'
            }}
            title="Manage schedules"
          >
            📅
          </button>
          <button
            onClick={() => handleEdit(med)}
            style={{
              padding: '4px 8px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: '#007bff',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: '600'
            }}
            title="Edit medication"
          >
            ✏️
          </button>
          <button
            onClick={() => toggleActive(med.id)}
            style={{
              padding: '4px 8px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: med.active ? '#6c757d' : '#28a745',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: '600'
            }}
            title={med.active ? 'Pause medication' : 'Resume medication'}
          >
            {med.active ? '⏸️' : '▶️'}
          </button>
          <button
            onClick={() => handleDelete(med.id)}
            style={{
              padding: '4px 8px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: '#dc3545',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: '600'
            }}
            title="Delete medication"
          >
            🗑️
          </button>
        </div>
      </div>
    </div>
  );

  const renderForm = () => (
    <div style={{
      backgroundColor: '#fff',
      borderRadius: '8px',
      padding: '24px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
    }}>
      <h3 style={{ margin: '0 0 24px 0', color: '#333' }}>
        {editingMed ? 'Edit Medication' : 'Add New Medication'}
      </h3>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#333' }}>
              Medication Name *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              style={{
                width: '100%',
                padding: '12px',
                border: '2px solid #ddd',
                borderRadius: '6px',
                fontSize: '14px',
                boxSizing: 'border-box',
                backgroundColor: '#f8f9fa',
                color: '#333'
              }}
              placeholder="Enter medication name"
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#333' }}>
              Concentration
            </label>
            <input
              type="text"
              value={formData.concentration}
              onChange={(e) => setFormData(prev => ({ ...prev, concentration: e.target.value }))}
              style={{
                width: '100%',
                padding: '12px',
                border: '2px solid #ddd',
                borderRadius: '6px',
                fontSize: '14px',
                boxSizing: 'border-box',
                backgroundColor: '#f8f9fa',
                color: '#333'
              }}
              placeholder="e.g., 500mg/tablet, 25mg/5ml"
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#333' }}>
              Quantity *
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="number"
                step="0.001"
                min="0"
                required
                value={formData.quantity}
                onChange={(e) => setFormData(prev => ({ ...prev, quantity: e.target.value }))}
                style={{
                  flex: '2',
                  padding: '12px',
                  border: '2px solid #ddd',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  backgroundColor: '#f8f9fa',
                  color: '#333'
                }}
                placeholder="0.000"
              />
              <select
                value={formData.quantityUnit}
                onChange={(e) => setFormData(prev => ({ ...prev, quantityUnit: e.target.value }))}
                style={{
                  flex: '1',
                  padding: '12px',
                  border: '2px solid #ddd',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  backgroundColor: '#f8f9fa',
                  color: '#333'
                }}
              >
                <option value="tablets">tablets</option>
                <option value="capsules">capsules</option>
                <option value="pills">pills</option>
                <option value="ml">ml</option>
                <option value="cc">cc</option>
                <option value="bottles">bottles</option>
                <option value="boxes">boxes</option>
                <option value="packets">packets</option>
                <option value="vials">vials</option>
                <option value="tubes">tubes</option>
                <option value="patches">patches</option>
                <option value="inhalers">inhalers</option>
                <option value="syringes">syringes</option>
                <option value="ampules">ampules</option>
                <option value="doses">doses</option>
                <option value="units">units</option>
                <option value="grams">grams</option>
                <option value="ounces">ounces</option>
              </select>
            </div>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#333' }}>
              Start Date
            </label>
            <input
              type="date"
              value={formData.startDate}
              onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
              style={{
                width: '100%',
                padding: '12px',
                border: '2px solid #ddd',
                borderRadius: '6px',
                fontSize: '14px',
                boxSizing: 'border-box',
                backgroundColor: '#f8f9fa',
                color: '#333'
              }}
            />
          </div>
        </div>

        {/* Checkboxes */}
        <div style={{ display: 'flex', gap: '24px', marginTop: '8px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={formData.asNeeded}
              onChange={(e) => setFormData(prev => ({ ...prev, asNeeded: e.target.checked }))}
              style={{
                width: '16px',
                height: '16px',
                cursor: 'pointer'
              }}
            />
            <span style={{ fontWeight: '500', color: '#333', fontSize: '14px' }}>
              Take as needed (PRN)
            </span>
          </label>
          
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={formData.isPatientSpecific}
              onChange={(e) => setFormData(prev => ({ ...prev, isPatientSpecific: e.target.checked }))}
              style={{
                width: '16px',
                height: '16px',
                cursor: 'pointer'
              }}
            />
            <span style={{ fontWeight: '500', color: '#333', fontSize: '14px' }}>
              Patient-specific medication
            </span>
            <span style={{ fontSize: '12px', color: '#666', fontStyle: 'italic' }}>
              (uncheck for shared/global medication)
            </span>
          </label>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#333' }}>
            Prescriber (Optional)
          </label>
          {/* Debug info */}
          {console.log('Current prescriberId:', formData.prescriberId, 'Available providers:', providers)}
          <select
            value={formData.prescriberId}
            onChange={(e) => setFormData(prev => ({ ...prev, prescriberId: e.target.value }))}
            style={{
              width: '100%',
              padding: '12px',
              border: '2px solid #ddd',
              borderRadius: '6px',
              fontSize: '14px',
              boxSizing: 'border-box',
              backgroundColor: '#f8f9fa',
              color: '#333'
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
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#333' }}>
            Pharmacy (Optional)
          </label>
          {/* Debug info */}
          {console.log('Current pharmacyId:', formData.pharmacyId, 'Available pharmacies:', pharmacies)}
          <select
            value={formData.pharmacyId}
            onChange={(e) => setFormData(prev => ({ ...prev, pharmacyId: e.target.value }))}
            style={{
              width: '100%',
              padding: '12px',
              border: '2px solid #ddd',
              borderRadius: '6px',
              fontSize: '14px',
              boxSizing: 'border-box',
              backgroundColor: '#f8f9fa',
              color: '#333'
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

        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#333' }}>
            Notes
          </label>
          <textarea
            value={formData.notes}
            onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
            style={{
              width: '100%',
              padding: '12px',
              border: '2px solid #ddd',
              borderRadius: '6px',
              fontSize: '14px',
              boxSizing: 'border-box',
              backgroundColor: '#f8f9fa',
              color: '#333',
              minHeight: '60px',
              resize: 'vertical'
            }}
            placeholder="Additional notes or instructions"
          />
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px' }}>
          <button
            type="button"
            onClick={() => {
              resetForm();
              setShowAddForm(false);
              setShowScheduleFor(null);
              setEditingMed(null);
            }}
            style={{
              padding: '12px 24px',
              border: '2px solid #6c757d',
              borderRadius: '6px',
              backgroundColor: '#fff',
              color: '#6c757d',
              cursor: 'pointer',
              fontWeight: '500',
              fontSize: '14px'
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            style={{
              padding: '12px 24px',
              border: 'none',
              borderRadius: '6px',
              backgroundColor: '#007bff',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: '500',
              fontSize: '14px'
            }}
            disabled={loading}
          >
            {loading ? 'Saving...' : (editingMed ? 'Update Medication' : 'Add Medication')}
          </button>
        </div>
      </form>
    </div>
  );

  // Handler for Mark Taken/Take Now
  const handleMarkTaken = (item) => {
    setConfirmModal({ open: true, item });
  };

  const handleConfirmMarkTaken = async () => {
    const { item } = confirmModal;
    setLoading(true);
    try {
      const res = await fetch(`${config.apiUrl}/api/medications/${item.medication_id}/administer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          dose_amount: item.dose_amount,
          schedule_id: item.schedule_id,
          scheduled_time: item.scheduled_time,
          notes: '',
          ...(selectedPatient && { patient_id: selectedPatient.id })
        })
      });
      if (res.ok) {
        setConfirmModal({ open: false, item: null });
        fetchMedications();
        fetchScheduledMedications();
      } else {
        alert('Failed to record medication administration.');
      }
    } catch (e) {
      alert('Error recording medication administration.');
    } finally {
      setLoading(false);
    }
  };

  const handleSkipDose = (item) => {
    setSkipModal({ open: true, item });
  };

  const handleConfirmSkipDose = async () => {
    const { item } = skipModal;
    setLoading(true);
    try {
      const res = await fetch(`${config.apiUrl}/api/medications/${item.medication_id}/administer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          dose_amount: 0,
          schedule_id: item.schedule_id,
          scheduled_time: item.scheduled_time,
          notes: 'Dose skipped by user',
          ...(selectedPatient && { patient_id: selectedPatient.id })
        })
      });
      if (res.ok) {
        setSkipModal({ open: false, item: null });
        fetchMedications();
        fetchScheduledMedications();
      } else {
        alert('Failed to record skipped dose.');
      }
    } catch (e) {
      alert('Error recording skipped dose.');
    } finally {
      setLoading(false);
    }
  };

  // Mark All handlers
  const handleMarkAllClick = (timeStr, medications) => {
    // Filter to only show incomplete medications
    const incompleteMeds = medications.filter(med => !med.is_completed);
    
    setMarkAllModal({
      open: true,
      timeGroup: timeStr,
      medications: incompleteMeds,
      selectedMeds: new Set(incompleteMeds.map(med => med.schedule_id)),
      loading: false,
      completedMeds: new Set()
    });
  };

  const handleMarkAllToggle = (scheduleId) => {
    setMarkAllModal(prev => {
      const newSelected = new Set(prev.selectedMeds);
      if (newSelected.has(scheduleId)) {
        newSelected.delete(scheduleId);
      } else {
        newSelected.add(scheduleId);
      }
      return { ...prev, selectedMeds: newSelected };
    });
  };

  const handleMarkAllConfirm = async () => {
    const { selectedMeds, medications } = markAllModal;
    const selectedMedications = medications.filter(med => selectedMeds.has(med.schedule_id));
    
    setMarkAllModal(prev => ({ ...prev, loading: true }));
    
    for (const med of selectedMedications) {
      try {
        const res = await fetch(`${config.apiUrl}/api/medications/${med.medication_id}/administer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            dose_amount: med.dose_amount,
            schedule_id: med.schedule_id,
            scheduled_time: med.scheduled_time,
            notes: 'Administered via bulk mark all',
            ...(selectedPatient && { patient_id: selectedPatient.id })
          })
        });
        
        if (res.ok) {
          // Mark this medication as completed
          setMarkAllModal(prev => ({
            ...prev,
            completedMeds: new Set([...prev.completedMeds, med.schedule_id])
          }));
        }
      } catch (e) {
        console.error('Error marking medication:', e);
      }
    }
    
    // Refresh data and close modal
    await fetchMedications();
    await fetchScheduledMedications();
    setMarkAllModal({ 
      open: false, 
      timeGroup: null, 
      medications: [], 
      selectedMeds: new Set(),
      loading: false,
      completedMeds: new Set()
    });
  };

  const handleMarkAllCancel = () => {
    setMarkAllModal({ 
      open: false, 
      timeGroup: null, 
      medications: [], 
      selectedMeds: new Set(),
      loading: false,
      completedMeds: new Set()
    });
  };

  return (
    <ModalBase isOpen={true} onClose={onClose} title={
      isMobile ? (
        <select
          value={showAddForm ? 'add' : showHistory ? 'history' : tab}
          onChange={(e) => {
            const value = e.target.value;
            if (value === 'add') {
              setShowAddForm(true);
              setShowScheduleFor(null);
              setEditingMed(null);
              setShowHistory(false);
            } else if (value === 'history') {
              setTab('history');
              setShowHistory(true);
              setShowAddForm(false);
              setShowScheduleFor(null);
              setEditingMed(null);
              resetForm();
            } else {
              setTab(value);
              setShowHistory(false);
              setShowAddForm(false);
              setShowScheduleFor(null);
              setEditingMed(null);
              resetForm();
            }
          }}
          style={{
            width: '100%',
            padding: '12px 16px',
            fontSize: '15px',
            fontWeight: '600',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            backgroundColor: '#1a2332',
            color: '#fff',
            cursor: 'pointer',
            outline: 'none',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
            WebkitAppearance: 'none',
            MozAppearance: 'none',
            appearance: 'none',
            backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'white\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3e%3cpolyline points=\'6 9 12 15 18 9\'%3e%3c/polyline%3e%3c/svg%3e")',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 12px center',
            backgroundSize: '20px',
            paddingRight: '40px'
          }}
        >
          <option value="scheduled" style={{ backgroundColor: '#1a2332', color: '#fff' }}>📅 Scheduled</option>
          <option value="active" style={{ backgroundColor: '#1a2332', color: '#fff' }}>✓ Active ({activeMedications.length})</option>
          <option value="inactive" style={{ backgroundColor: '#1a2332', color: '#fff' }}>⏸ Inactive ({inactiveMedications.length})</option>
          <option value="history" style={{ backgroundColor: '#1a2332', color: '#fff' }}>📜 History</option>
          <option value="add" style={{ backgroundColor: '#1a2332', color: '#fff' }}>➕ Add Medication</option>
        </select>
      ) : (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => { 
                setTab('scheduled'); 
                setShowHistory(false); 
                setShowAddForm(false);
                setShowScheduleFor(null);
                setEditingMed(null);
                resetForm();
              }}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: tab === 'scheduled' ? '#007bff' : '#f8f9fa',
                color: tab === 'scheduled' ? '#fff' : '#333',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '14px'
              }}
            >
              Scheduled
            </button>
            <button
              onClick={() => { 
                setTab('active'); 
                setShowHistory(false); 
                setShowAddForm(false);
                setShowScheduleFor(null);
                setEditingMed(null);
                resetForm();
              }}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: tab === 'active' ? '#007bff' : '#f8f9fa',
                color: tab === 'active' ? '#fff' : '#333',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '14px'
              }}
            >
              Active ({activeMedications.length})
            </button>
            <button
              onClick={() => { 
                setTab('inactive'); 
                setShowHistory(false); 
                setShowAddForm(false);
                setShowScheduleFor(null);
                setEditingMed(null);
                resetForm();
              }}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: tab === 'inactive' ? '#007bff' : '#f8f9fa',
                color: tab === 'inactive' ? '#fff' : '#333',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '14px'
              }}
            >
              Inactive ({inactiveMedications.length})
            </button>
            <button
              onClick={() => {
                setTab('history');
                setShowHistory(true);
                setShowAddForm(false);
                setShowScheduleFor(null);
                setEditingMed(null);
                resetForm();
              }}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: tab === 'history' ? '#007bff' : '#f8f9fa',
                color: tab === 'history' ? '#fff' : '#333',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '14px'
              }}
            >
              History
            </button>
            <button
              onClick={() => { 
                if (showAddForm) {
                  // Cancel: hide form and reset all state
                  setShowAddForm(false);
                  setShowScheduleFor(null);
                  setEditingMed(null);
                  setShowHistory(false);
                  resetForm();
                } else {
                  // Show form: reset all state and show add form
                  setShowAddForm(true);
                  setShowScheduleFor(null);
                  setEditingMed(null);
                  setShowHistory(false);
                  setTab('active'); // Switch to active tab when adding new medication
                  resetForm();
                }
              }}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: showAddForm ? '#dc3545' : '#28a745',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '14px'
              }}
              disabled={loading}
            >
              {showAddForm ? 'Cancel' : 'Add'}
            </button>
          </div>
        </div>
      </div>
      )
    }>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
              Loading...
            </div>
          )}
          {!loading && showScheduleFor ? (
            <MedicationScheduleView 
              med={allMedications.find(m => m.id === showScheduleFor) || {schedules: []}}
              onBack={() => setShowScheduleFor(null)}
              fetchMedications={fetchMedications}
              loading={loading}
              setLoading={setLoading}
              scheduledMedications={scheduledMedications.scheduled_medications}
              showStatusFilters={true}
              patients={patients}
              currentPatientId={selectedPatient?.id}
            />
          ) : !loading && showHistory ? (
            <MedicationHistory onBack={() => { setShowHistory(false); setTab('scheduled'); }} />
          ) : !loading && showAddForm ? (
            renderForm()
          ) : !loading ? (
            <div>
              {tab === 'scheduled' ? (
                <div>
                  {/* Status Filters for Scheduled Medications */}
                  {scheduledMedications.scheduled_medications && scheduledMedications.scheduled_medications.length > 0 && (
                    <div style={{ marginBottom: 24, backgroundColor: '#f8f9fa', borderRadius: 8, border: '1px solid #dee2e6' }}>
                      {/* Filter Header with Toggle */}
                      <div 
                        style={{ 
                          padding: '12px 16px', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'space-between',
                          cursor: 'pointer',
                          borderBottom: showFilters ? '1px solid #dee2e6' : 'none',
                          backgroundColor: showFilters ? '#e9ecef' : 'transparent',
                          borderRadius: showFilters ? '8px 8px 0 0' : '8px'
                        }}
                        onClick={() => setShowFilters(!showFilters)}
                      >
                        <h4 style={{ margin: 0, color: '#333', fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ 
                            transform: showFilters ? 'rotate(90deg)' : 'rotate(0deg)', 
                            transition: 'transform 0.2s ease',
                            display: 'inline-block',
                            fontSize: 14
                          }}>
                            ▶
                          </span>
                          Filter by Status
                        </h4>
                        <div style={{ fontSize: 12, color: '#666', fontWeight: 500 }}>
                          {showFilters ? 'Click to hide' : 'Click to show filters'}
                        </div>
                      </div>
                      
                      {/* Collapsible Filter Content */}
                      {showFilters && (
                        <div style={{ padding: 16 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                            <div style={{ fontSize: 14, color: '#666', fontWeight: 500 }}>
                              Select which medication statuses to display
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const allCategories = ['on_time', 'warning', 'late_early', 'upcoming', 'missed', 'skipped', 'ready_to_take'];
                                  const allSelected = allCategories.every(cat => statusFilters[cat]);
                                  const newFilters = {};
                                  allCategories.forEach(cat => newFilters[cat] = !allSelected);
                                  setStatusFilters(newFilters);
                                }}
                                style={{
                                  padding: '4px 8px',
                                  fontSize: 12,
                                  backgroundColor: '#007bff',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: 4,
                                  cursor: 'pointer'
                                }}
                              >
                                Toggle All
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setStatusFilters({
                                    on_time: false,
                                    warning: false,
                                    late_early: false,
                                    upcoming: true,
                                    missed: true,
                                    skipped: false,
                                    ready_to_take: true
                                  });
                                }}
                                style={{
                                  padding: '4px 8px',
                                  fontSize: 12,
                                  backgroundColor: '#6c757d',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: 4,
                                  cursor: 'pointer'
                                }}
                              >
                                Reset to Default
                              </button>
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                            {(() => {
                              const statusConfig = {
                                on_time: { label: 'On Time', color: '#28a745', bgColor: 'rgba(40, 167, 69, 0.1)' },
                                warning: { label: 'Warning', color: '#ffc107', bgColor: 'rgba(255, 193, 7, 0.1)' },
                                late_early: { label: 'Late/Early', color: '#fd7e14', bgColor: 'rgba(253, 126, 20, 0.1)' },
                                upcoming: { label: 'Upcoming', color: '#17a2b8', bgColor: 'rgba(23, 162, 184, 0.1)' },
                                missed: { label: 'Missed', color: '#dc3545', bgColor: 'rgba(220, 53, 69, 0.1)' },
                                skipped: { label: 'Skipped', color: '#6c757d', bgColor: 'rgba(108, 117, 125, 0.1)' },
                                ready_to_take: { label: 'Ready to Take', color: '#007bff', bgColor: 'rgba(0, 123, 255, 0.1)' }
                              };

                              const statusCounts = {};
                              if (scheduledMedications.scheduled_medications) {
                                scheduledMedications.scheduled_medications.forEach(item => {
                                  const status = medicationStatusUtils.getMedicationStatus(item);
                                  statusCounts[status] = (statusCounts[status] || 0) + 1;
                                });
                              }

                              return Object.entries(statusConfig).map(([status, config]) => (
                                <label key={status} style={{ 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  gap: 6, 
                                  cursor: 'pointer',
                                  padding: '6px 10px',
                                  borderRadius: 6,
                                  backgroundColor: statusFilters[status] ? config.bgColor : 'transparent',
                                  border: statusFilters[status] ? `1px solid ${config.color}` : '1px solid #dee2e6'
                                }}>
                                  <input
                                    type="checkbox"
                                    checked={statusFilters[status] || false}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      setStatusFilters(prev => ({ ...prev, [status]: e.target.checked }));
                                    }}
                                    style={{ margin: 0 }}
                                  />
                                  <span style={{ fontSize: 14, fontWeight: statusFilters[status] ? 600 : 400, color: statusFilters[status] ? config.color : '#333' }}>
                                    {config.label} ({statusCounts[status] || 0})
                                  </span>
                                </label>
                              ));
                            })()}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* All Scheduled Medications in Chronological Order, grouped by day and time */}
                  {scheduledMedications.scheduled_medications && scheduledMedications.scheduled_medications.length > 0 ? (
                    <div>
                      {/* Removed 'Medication Schedule' heading */}
                      {(() => {
                        // Filter medications by selected status filters
                        const filteredMedications = scheduledMedications.scheduled_medications.filter(item => {
                          const status = medicationStatusUtils.getMedicationStatus(item);
                          return statusFilters[status];
                        });

                        // Group filtered meds by day (YYYY-MM-DD), then by formatted time string
                        const groupByDay = {};
                        filteredMedications.forEach(item => {
                          const dateObj = new Date(item.scheduled_time);
                          const dayKey = dateObj.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                          const timeStr = dateObj.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
                          if (!groupByDay[dayKey]) groupByDay[dayKey] = {};
                          if (!groupByDay[dayKey][timeStr]) groupByDay[dayKey][timeStr] = [];
                          groupByDay[dayKey][timeStr].push(item);
                        });
                        // Sort days chronologically
                        const sortedDays = Object.keys(groupByDay).sort((a, b) => {
                          // Parse to Date for sorting
                          const parse = d => new Date(d);
                          return parse(a) - parse(b);
                        });
                        return (
                          <div>
                            {sortedDays.map(dayKey => (
                              <div key={dayKey} style={{ marginBottom: 36 }}>
                                <div style={{ fontWeight: 800, fontSize: 22, color: '#fff', marginBottom: 8, letterSpacing: 0.5, textShadow: '0 1px 2px #222' }}>{dayKey}</div>
                                <div style={{ borderBottom: '2px solid #e2e8f0', marginBottom: 16 }} />
                                {Object.keys(groupByDay[dayKey]).sort((a, b) => {
                                  // Convert to 24h for sorting
                                  const parse = t => {
                                    const [h, m, ampm] = t.match(/(\d+):(\d+)\s*(AM|PM)/i).slice(1);
                                    let hour = parseInt(h, 10);
                                    if (/pm/i.test(ampm) && hour !== 12) hour += 12;
                                    if (/am/i.test(ampm) && hour === 12) hour = 0;
                                    return hour * 60 + parseInt(m, 10);
                                  };
                                  return parse(a) - parse(b);
                                }).map(timeStr => (
                                  <div key={timeStr} style={{
                                    marginBottom: 32,
                                    background: '#181f2a',
                                    borderRadius: 18,
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
                                    padding: '18px 24px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    position: 'relative',
                                    border: '1.5px solid #2d3748',
                                  }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                      <div style={{ fontWeight: 700, fontSize: 20, color: '#00bfff', letterSpacing: 0.2, textShadow: '0 1px 2px #222' }}>{timeStr}</div>
                                      <button style={{
                                        background: '#007bff',
                                        color: '#fff',
                                        border: 'none',
                                        borderRadius: 12,
                                        padding: '8px 18px',
                                        fontWeight: 600,
                                        fontSize: 14,
                                        boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                                        cursor: 'pointer',
                                        transition: 'background 0.2s',
                                      }}
                                      onClick={() => handleMarkAllClick(timeStr, groupByDay[dayKey][timeStr])}
                                      >Mark All</button>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                      {groupByDay[dayKey][timeStr].map((item, idx) => {
                                        const calculatedStatus = medicationStatusUtils.getMedicationStatus(item);
                                        const colors = getStatusColor(item.status);
                                        const isCompleted = item.is_completed;
                                        const isToday = new Date(item.scheduled_time).toDateString() === new Date().toDateString();
                                        return (
                                          <div
                                            key={`scheduled-${dayKey}-${timeStr}-${idx}`}
                                            style={{
                                              backgroundColor: colors.bg,
                                              borderRadius: 12,
                                              padding: '14px 18px',
                                              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                                              border: `1.5px solid ${colors.border}`,
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: '12px',
                                              marginBottom: 0,
                                              opacity: isCompleted && isToday ? 0.7 : 1,
                                              order: isCompleted && isToday ? 1 : 0
                                            }}
                                          >
                                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
                                              <span style={{ color: colors.text, fontSize: '16px', fontWeight: '600' }}>
                                                {item.medication_name}{item.concentration ? ` (${item.concentration})` : ''}
                                              </span>
                                              <span style={{ color: colors.text, fontSize: '14px', fontWeight: 500 }}>
                                                - {item.dose_amount} {item.dose_unit}
                                              </span>
                                              <span style={{ color: colors.text, fontSize: '14px', fontWeight: 500 }}>
                                                {item.type ? `(${item.type})` : ''}
                                              </span>
                                              <span 
                                                style={{ 
                                                  backgroundColor: colors.border, 
                                                  color: '#fff', 
                                                  padding: '2px 8px', 
                                                  borderRadius: '12px', 
                                                  fontSize: '12px',
                                                  fontWeight: '500',
                                                  marginLeft: 8
                                                }}
                                              >
                                                {getStatusText(item)}
                                              </span>
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                              {!isCompleted && (
                                                <>
                                                  <button
                                                    style={{
                                                      padding: '6px 14px',
                                                      border: 'none',
                                                      borderRadius: '8px',
                                                      backgroundColor: '#28a745',
                                                      color: '#fff',
                                                      cursor: 'pointer',
                                                      fontSize: '13px',
                                                      fontWeight: '500',
                                                      boxShadow: '0 1px 2px rgba(0,0,0,0.07)'
                                                    }}
                                                    onClick={() => {
                                                      handleMarkTaken(item);
                                                    }}
                                                  >
                                                    {item.status === 'missed' ? 'Take Now' : 'Mark Taken'}
                                                  </button>
                                                  {item.status === 'missed' && (
                                                    <button
                                                      style={{
                                                        padding: '6px 14px',
                                                        border: '2px solid #6c757d',
                                                        borderRadius: '8px',
                                                        backgroundColor: '#fff',
                                                        color: '#6c757d',
                                                        cursor: 'pointer',
                                                        fontSize: '13px',
                                                        fontWeight: '500',
                                                        boxShadow: '0 1px 2px rgba(0,0,0,0.07)'
                                                      }}
                                                      onClick={() => {
                                                        handleSkipDose(item);
                                                      }}
                                                    >
                                                      Skip
                                                    </button>
                                                  )}
                                                </>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                      {/* Legend */}
                      <div style={{ marginTop: '24px', padding: '16px', backgroundColor: '#2d3748', borderRadius: '8px', border: '1px solid #4a5568' }}>
                        <h4 style={{ margin: '0 0 12px 0', color: '#ffffff', fontSize: '14px', fontWeight: '600' }}>Status Legend:</h4>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '12px', color: '#e2e8f0' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ width: 12, height: 12, backgroundColor: '#28a745', borderRadius: '50%' }}></div>
                            <span>On time (±1 hour)</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ width: 12, height: 12, backgroundColor: '#ffc107', borderRadius: '50%' }}></div>
                            <span>Warning (1-2 hours off)</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ width: 12, height: 12, backgroundColor: '#dc3545', borderRadius: '50%' }}></div>
                            <span>Late/Early ({'>'}2 hours off)</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ width: 12, height: 12, backgroundColor: '#17a2b8', borderRadius: '50%' }}></div>
                            <span>Upcoming</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{
                      textAlign: 'center',
                      padding: '40px',
                      color: '#a0aec0',
                      backgroundColor: '#2d3748',
                      borderRadius: '8px',
                      border: '1px solid #4a5568'
                    }}>
                      <p style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: '500', color: '#ffffff' }}>No scheduled medications</p>
                      <p style={{ margin: 0, color: '#a0aec0' }}>No medications scheduled for today and yesterday.</p>
                    </div>
                  )}
                </div>
              ) : tab === 'active' ? (
                activeMedications.length === 0 ? (
                  <div style={{
                    textAlign: 'center',
                    padding: '40px',
                    color: '#666',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '8px'
                  }}>
                    <p>No active medications found.</p>
                    <button
                      onClick={() => setShowAddForm(true)}
                      style={{
                        padding: '10px 20px',
                        border: 'none',
                        borderRadius: '6px',
                        backgroundColor: '#007bff',
                        color: '#fff',
                        cursor: 'pointer',
                        fontWeight: '500',
                        fontSize: '14px',
                        marginTop: '10px'
                      }}
                    >
                      Add your first medication
                    </button>
                  </div>
                ) : (
                  activeMedications.map(renderMedicationCard)
                )
              ) : (
                inactiveMedications.length === 0 ? (
                  <div style={{
                    textAlign: 'center',
                    padding: '40px',
                    color: '#666',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '8px'
                  }}>
                    <p>No inactive medications found.</p>
                  </div>
                ) : (
                  inactiveMedications.map(renderMedicationCard)
                )
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* Confirm Modal */}
      {confirmModal.open && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000
        }}>
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '10px',
            padding: '32px',
            maxWidth: '400px',
            width: '90%',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{ margin: '0 0 16px 0', color: '#333' }}>Confirm Administration</h3>
            <p style={{ margin: '0 0 24px 0', color: '#666' }}>
              Mark <strong>{confirmModal.item?.medication_name}</strong> as taken?<br/>
              Dose: <strong>{confirmModal.item?.dose_amount} {confirmModal.item?.dose_unit}</strong>
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConfirmModal({ open: false, item: null })}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  backgroundColor: '#fff',
                  color: '#333',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmMarkTaken}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '4px',
                  backgroundColor: '#28a745',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
                disabled={loading}
              >
                {loading ? 'Saving...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Skip Dose Confirmation Modal */}
      {skipModal.open && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000
        }}>
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '10px',
            padding: '32px',
            maxWidth: '400px',
            width: '90%',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{ margin: '0 0 16px 0', color: '#333' }}>Confirm Skip Dose</h3>
            <p style={{ margin: '0 0 24px 0', color: '#666' }}>
              Skip <strong>{skipModal.item?.medication_name}</strong>?<br/>
              Scheduled dose: <strong>{skipModal.item?.dose_amount} {skipModal.item?.dose_unit}</strong><br/>
              <em style={{ color: '#999', fontSize: '13px' }}>This will be logged as a skipped dose for your records.</em>
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setSkipModal({ open: false, item: null })}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  backgroundColor: '#fff',
                  color: '#333',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSkipDose}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '4px',
                  backgroundColor: '#dc3545',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
                disabled={loading}
              >
                {loading ? 'Saving...' : 'Skip Dose'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mark All Confirmation Modal */}
      {markAllModal.open && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000
        }}>
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '500px',
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto',
            boxShadow: '0 8px 32px rgba(0,0,0,0.15)'
          }}>
            <h3 style={{ margin: '0 0 16px 0', color: '#333', fontSize: '20px', fontWeight: '600' }}>
              Mark Medications for {markAllModal.timeGroup}
            </h3>
            <p style={{ margin: '0 0 20px 0', color: '#666', fontSize: '14px' }}>
              Select which medications you want to mark as taken:
            </p>
            
            <div style={{ maxHeight: '300px', overflow: 'auto', marginBottom: '20px' }}>
              {markAllModal.medications.map((med, index) => {
                const isSelected = markAllModal.selectedMeds.has(med.schedule_id);
                const isCompleted = markAllModal.completedMeds.has(med.schedule_id);
                const isLoading = markAllModal.loading && isSelected && !isCompleted;
                
                return (
                  <div
                    key={med.schedule_id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '12px',
                      border: '1px solid #e9ecef',
                      borderRadius: '8px',
                      marginBottom: '8px',
                      backgroundColor: isCompleted ? '#d4edda' : '#fff',
                      opacity: isCompleted ? 0.7 : 1,
                      transition: 'all 0.3s ease'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => !markAllModal.loading && !isCompleted && handleMarkAllToggle(med.schedule_id)}
                      disabled={markAllModal.loading || isCompleted}
                      style={{
                        marginRight: '12px',
                        transform: 'scale(1.2)',
                        accentColor: '#007bff'
                      }}
                    />
                    
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '600', color: '#333', fontSize: '16px' }}>
                        {med.medication_name}
                      </div>
                      <div style={{ color: '#666', fontSize: '14px' }}>
                        Dose: {med.dose_amount} {med.dose_unit}
                      </div>
                    </div>
                    
                    {isLoading && (
                      <div style={{
                        width: '20px',
                        height: '20px',
                        border: '2px solid #f3f3f3',
                        borderTop: '2px solid #007bff',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite'
                      }}></div>
                    )}
                    
                    {isCompleted && (
                      <div style={{
                        color: '#28a745',
                        fontWeight: '600',
                        fontSize: '14px'
                      }}>
                        ✓ Completed
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={handleMarkAllCancel}
                disabled={markAllModal.loading}
                style={{
                  padding: '10px 20px',
                  border: '2px solid #6c757d',
                  borderRadius: '6px',
                  backgroundColor: '#fff',
                  color: '#6c757d',
                  cursor: markAllModal.loading ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  opacity: markAllModal.loading ? 0.6 : 1
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleMarkAllConfirm}
                disabled={markAllModal.loading || markAllModal.selectedMeds.size === 0}
                style={{
                  padding: '10px 20px',
                  border: 'none',
                  borderRadius: '6px',
                  backgroundColor: markAllModal.selectedMeds.size === 0 ? '#6c757d' : '#007bff',
                  color: '#fff',
                  cursor: (markAllModal.loading || markAllModal.selectedMeds.size === 0) ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: '600',
                  opacity: markAllModal.loading ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                {markAllModal.loading && (
                  <div style={{
                    width: '16px',
                    height: '16px',
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTop: '2px solid #fff',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                  }}></div>
                )}
                {markAllModal.loading ? 'Processing...' : `Mark ${markAllModal.selectedMeds.size} Selected`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSS for spinner animation */}
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </ModalBase>
  );
};

export default MedicationModal;
