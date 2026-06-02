import React, { useState, useEffect, useMemo } from 'react';
import ModalBase from './ModalBase';
import config from '../config';
import { useAdminPatient } from '../contexts/AdminPatientContext';
import ScheduleList from './schedule/ScheduleList';
import {
  checkAdministrationWindow,
  formatDurationMinutes,
  getCurrentLocalDateTime,
  localDateTimeToUTC,
} from '../utils/timezone';

// Map the medication backend's status taxonomy onto the unified ScheduleList one.
function mapMedStatus(s) {
  switch (s) {
    case 'completed_on_time':
    case 'completed_warning':
    case 'completed_late':
      return 'completed';
    case 'skipped': return 'skipped';
    case 'ready':
    case 'due_on_time': return 'due_on_time';
    case 'warning':
    case 'due_warning': return 'due_warning';
    case 'late_early':
    case 'due_late': return 'due_late';
    case 'missed': return 'missed';
    case 'upcoming':
    case 'pending':
    default: return 'upcoming';
  }
}

const MedicationModal = ({ onClose }) => {
  const { selectedPatient } = useAdminPatient();
  const [tab, setTab] = useState('scheduled');
  const [activeMedications, setActiveMedications] = useState([]);
  const [scheduledMedications, setScheduledMedications] = useState({ scheduled_medications: [] });
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

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

  // PRN modal — pick an as-needed med, then enter dose/time
  const [prnModal, setPrnModal] = useState({ open: false, selectedMed: null });
  const [prnForm, setPrnForm] = useState({ dose_amount: '', dose_unit: '', given_at: '', notes: '' });
  const [prnSaving, setPrnSaving] = useState(false);
  const [prnError, setPrnError] = useState(null);

  // Hard gate when an administration is refused for insufficient on-hand quantity
  // (backend 409 insufficient_quantity). `retry` re-runs the original action after
  // the quantity is updated; null for bulk Mark-All (user re-runs it manually).
  const [qtyGate, setQtyGate] = useState({ open: false, info: null, retry: null });
  const [qtyInput, setQtyInput] = useState('');
  const [qtySaving, setQtySaving] = useState(false);
  const [qtyError, setQtyError] = useState(null);

  const openQtyGate = (info, retry) => {
    setQtyInput('');
    setQtyError(null);
    setQtyGate({ open: true, info, retry });
  };
  const closeQtyGate = () => setQtyGate({ open: false, info: null, retry: null });

  const handleQtySave = async () => {
    const newQty = parseFloat(qtyInput);
    if (!(newQty > 0)) { setQtyError('Enter a quantity greater than 0'); return; }
    setQtySaving(true);
    setQtyError(null);
    try {
      const res = await fetch(`${config.apiUrl}/api/medications/${qtyGate.info.medication_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ quantity: newQty }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || 'Failed to update quantity');
      }
      const retry = qtyGate.retry;
      closeQtyGate();
      await fetchMedications();
      if (retry) await retry();
    } catch (err) {
      setQtyError(err.message);
    } finally {
      setQtySaving(false);
    }
  };

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
    if (tab === 'scheduled') {
      fetchScheduledMedications();
    }
  }, [tab, selectedPatient?.id]);

  const fetchMedications = async () => {
    if (!selectedPatient) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${config.apiUrl}/api/admin/medications/active?patient_id=${selectedPatient.id}`,
        { credentials: 'include' }
      );
      if (res.ok) {
        setActiveMedications(await res.json());
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

  // Normalize the API rows into the shape ScheduleList expects.
  const scheduledItems = useMemo(() => {
    const raw = scheduledMedications.scheduled_medications || [];
    return raw.map(item => {
      const mapped = mapMedStatus(item.status);
      const completed = mapped === 'completed' || mapped === 'skipped';
      const dose = item.dose_amount != null
        ? `${item.dose_amount}${item.dose_unit ? ' ' + item.dose_unit : ''}`
        : null;
      return {
        id: `${item.schedule_id}-${item.scheduled_time}`,
        scheduled_time: item.scheduled_time,
        name: item.medication_name,
        description: item.description,
        extra: dose,
        category: null,
        status: mapped,
        is_completed: completed,
        is_yesterday: !!item.is_yesterday,
        completeLabel: item.status === 'missed' ? 'Take Now' : 'Mark Taken',
        skipLabel: 'Skip',
        showSkip: true,
        _raw: item,
      };
    });
  }, [scheduledMedications]);

  const formatTimestamp = (iso) => {
    if (!iso) return null;
    try {
      return new Date(iso).toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
      });
    } catch {
      return null;
    }
  };

  const renderMedicationCard = (med) => {
    const lastGiven = formatTimestamp(med.last_administered);
    // Some meds are marked PRN but still carry a schedule (e.g. olanzapine
    // with an as-needed flag plus a scheduled dose). Surface next_due whenever
    // it's populated rather than gating on as_needed.
    const nextDue = formatTimestamp(med.next_due);
    return (
      <div key={med.id} className="medication-card" style={{
        backgroundColor: '#fff',
        borderRadius: '6px',
        padding: '12px',
        marginBottom: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        border: '1px solid #28a745',
        borderLeft: '4px solid #28a745'
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
            <h4 style={{ margin: 0, color: '#333', fontSize: '16px', fontWeight: 600 }}>
              {med.name}
            </h4>
            {med.concentration && (
              <span style={{ fontSize: 12, color: '#666', fontWeight: 500 }}>
                {med.concentration}
              </span>
            )}
            {med.as_needed && (
              <span style={{
                background: '#ede1ff', color: '#6f42c1',
                padding: '2px 8px', borderRadius: 10,
                fontSize: 11, fontWeight: 600
              }}>
                PRN
              </span>
            )}
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '6px 16px',
            fontSize: 13,
            color: '#555'
          }}>
            <span>
              <strong style={{ color: '#333' }}>On hand:</strong>{' '}
              {med.quantity ?? '—'} {med.quantity_unit || 'units'}
            </span>
            <span>
              <strong style={{ color: '#333' }}>Last given:</strong>{' '}
              {lastGiven
                ? (
                  <>
                    {lastGiven}
                    {med.last_dose_amount != null && (
                      <span style={{ color: '#888' }}> ({med.last_dose_amount})</span>
                    )}
                  </>
                )
                : <span style={{ color: '#999' }}>never</span>}
            </span>
            {nextDue && (
              <span>
                <strong style={{ color: '#333' }}>Next due:</strong> {nextDue}
              </span>
            )}
          </div>

          {med.notes && (
            <div style={{ fontSize: 12, color: '#777', marginTop: 8, fontStyle: 'italic' }}>
              {med.notes.length > 80 ? med.notes.substring(0, 80) + '…' : med.notes}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Admin actions (edit/toggle/delete/manage schedules) intentionally removed
  // from the live dashboard modal. Cards are info-only; admin lives in
  // /admin-v2/medications.


  // Handler for Mark Taken/Take Now
  const handleMarkTaken = (item) => {
    setConfirmModal({ open: true, item });
  };

  const handleConfirmMarkTaken = async () => {
    const { item } = confirmModal;
    // Backend gates BOTH edges of the administration window; the inline warning
    // banner is the user's acknowledgement, so pass early_override for either.
    const { status } = checkAdministrationWindow(item?.scheduled_time);
    const offWindow = status === 'early' || status === 'late';
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
          early_override: offWindow,
          ...(selectedPatient && { patient_id: selectedPatient.id })
        })
      });
      if (res.ok) {
        setConfirmModal({ open: false, item: null });
        fetchMedications();
        fetchScheduledMedications();
      } else {
        const data = await res.json().catch(() => ({}));
        if (data.error === 'insufficient_quantity') {
          // Keep the confirm modal open behind the gate; retry re-administers
          // after the on-hand quantity is updated.
          openQtyGate(data, handleConfirmMarkTaken);
        } else {
          alert(data.detail || 'Failed to record medication administration.');
        }
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
    const { selectedMeds, medications, completedMeds } = markAllModal;
    // Skip any already-administered in a prior pass so re-running after an
    // out-of-stock gate doesn't double-administer.
    const selectedMedications = medications.filter(
      med => selectedMeds.has(med.schedule_id) && !completedMeds.has(med.schedule_id)
    );

    setMarkAllModal(prev => ({ ...prev, loading: true }));

    for (const med of selectedMedications) {
      try {
        const { status } = checkAdministrationWindow(med.scheduled_time);
        const offWindow = status === 'early' || status === 'late';
        const res = await fetch(`${config.apiUrl}/api/medications/${med.medication_id}/administer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            dose_amount: med.dose_amount,
            schedule_id: med.schedule_id,
            scheduled_time: med.scheduled_time,
            notes: 'Administered via bulk mark all',
            early_override: offWindow,
            ...(selectedPatient && { patient_id: selectedPatient.id })
          })
        });

        if (res.ok) {
          // Mark this medication as completed
          setMarkAllModal(prev => ({
            ...prev,
            completedMeds: new Set([...prev.completedMeds, med.schedule_id])
          }));
        } else {
          const data = await res.json().catch(() => ({}));
          if (data.error === 'insufficient_quantity') {
            // Stop the run, keep the modal open with progress so far, and let the
            // caregiver update the quantity. They re-click "Mark Selected" to
            // finish the rest (completed ones are skipped above).
            setMarkAllModal(prev => ({ ...prev, loading: false }));
            openQtyGate(data, null);
            await fetchMedications();
            await fetchScheduledMedications();
            return;
          }
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

  // PRN handlers
  const openPrnPicker = () => {
    setPrnError(null);
    setPrnModal({ open: true, selectedMed: null });
  };

  const closePrnModal = () => {
    setPrnModal({ open: false, selectedMed: null });
    setPrnError(null);
    setPrnSaving(false);
  };

  const pickPrnMed = (med) => {
    const firstSchedule = med.schedules?.[0];
    setPrnForm({
      dose_amount: firstSchedule?.dose_amount?.toString() || '',
      dose_unit: firstSchedule?.dose_unit || med.quantity_unit || '',
      given_at: getCurrentLocalDateTime(),
      notes: '',
    });
    setPrnError(null);
    setPrnModal({ open: true, selectedMed: med });
  };

  const handlePrnSave = async () => {
    if (!prnModal.selectedMed || !selectedPatient) return;
    setPrnSaving(true);
    setPrnError(null);
    try {
      const res = await fetch(
        `${config.apiUrl}/api/medications/${prnModal.selectedMed.id}/administer`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            patient_id: selectedPatient.id,
            dose_amount: parseFloat(prnForm.dose_amount) || 0,
            notes: prnForm.notes || null,
            administered_at: localDateTimeToUTC(prnForm.given_at),
          }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.error === 'insufficient_quantity') {
          openQtyGate(data, handlePrnSave);
          return;
        }
        throw new Error(data.detail || 'Failed to record administration');
      }
      await fetchMedications();
      await fetchScheduledMedications();
      closePrnModal();
    } catch (err) {
      setPrnError(err.message);
    } finally {
      setPrnSaving(false);
    }
  };

  const prnMedications = activeMedications.filter(m => m.as_needed);

  return (
    <ModalBase isOpen={true} onClose={onClose} title={
      isMobile ? (
        <div style={{ display: 'flex', gap: 8, width: '100%' }}>
          <select
            value={tab}
            onChange={(e) => setTab(e.target.value)}
            style={{
              flex: 1,
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
              paddingRight: '40px',
              minWidth: 0,
            }}
          >
            <option value="scheduled" style={{ backgroundColor: '#1a2332', color: '#fff' }}>Scheduled</option>
            <option value="active" style={{ backgroundColor: '#1a2332', color: '#fff' }}>Active ({activeMedications.length})</option>
          </select>
          <button
            onClick={openPrnPicker}
            disabled={!selectedPatient}
            style={{
              padding: '12px 18px',
              border: 'none',
              borderRadius: '8px',
              backgroundColor: '#6f42c1',
              color: '#fff',
              cursor: selectedPatient ? 'pointer' : 'not-allowed',
              opacity: selectedPatient ? 1 : 0.6,
              fontWeight: '600',
              fontSize: '15px',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              flexShrink: 0,
            }}
            title={selectedPatient ? 'Give an as-needed (PRN) medication' : 'Select a patient first'}
          >
            PRN
          </button>
        </div>
      ) : (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setTab('scheduled')}
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
              onClick={() => setTab('active')}
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
              onClick={openPrnPicker}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: '#6f42c1',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '14px'
              }}
              disabled={loading || !selectedPatient}
              title={selectedPatient ? 'Give an as-needed (PRN) medication' : 'Select a patient first'}
            >
              PRN
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
          {!loading ? (
            <div>
              {tab === 'scheduled' ? (
                <ScheduleList
                  items={scheduledItems}
                  title="Scheduled Medications"
                  emptyText="No scheduled medications"
                  onMarkComplete={(item) => handleMarkTaken(item._raw)}
                  onSkip={(item) => handleSkipDose(item._raw)}
                  onMarkAll={(items) => {
                    // Re-use the existing Mark-All pre-select confirmation flow.
                    const raws = items.map(i => i._raw);
                    const timeStr = raws[0]?.scheduled_time
                      ? new Date(raws[0].scheduled_time).toLocaleTimeString(undefined, {
                          hour: 'numeric', minute: '2-digit', hour12: true,
                        })
                      : '';
                    handleMarkAllClick(timeStr, raws);
                  }}
                />
              ) : tab === 'active' ? (
                activeMedications.length === 0 ? (
                  <div style={{
                    textAlign: 'center',
                    padding: '40px',
                    color: '#666',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '8px'
                  }}>
                    <p style={{ margin: 0 }}>No active medications for this patient.</p>
                  </div>
                ) : (
                  activeMedications.map(renderMedicationCard)
                )
              ) : null}
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
            <p style={{ margin: '0 0 16px 0', color: '#666' }}>
              Mark <strong>{confirmModal.item?.medication_name}</strong> as taken?<br/>
              Dose: <strong>{confirmModal.item?.dose_amount} {confirmModal.item?.dose_unit}</strong>
            </p>
            {(() => {
              const check = checkAdministrationWindow(confirmModal.item?.scheduled_time);
              if (check.status !== 'early' && check.status !== 'late') return null;
              const isEarly = check.status === 'early';
              const minutes = isEarly ? check.minutesOffset : -check.minutesOffset;
              return (
                <div
                  role="alert"
                  style={{
                    background: '#fff8e1',
                    border: '1px solid #f0ad4e',
                    borderRadius: 6,
                    padding: '10px 12px',
                    marginBottom: 16,
                    color: '#5a3e00'
                  }}
                >
                  <div style={{ fontWeight: 600, color: '#b35a00', marginBottom: 4 }}>
                    Warning: {isEarly ? 'early' : 'late'} administration
                  </div>
                  <div style={{ fontSize: 13 }}>
                    This dose {isEarly ? 'is scheduled for' : 'was scheduled for'}{' '}
                    <strong>{check.scheduledLocal}</strong>
                    {' '}— that's <strong>{formatDurationMinutes(minutes)}</strong>{' '}
                    {isEarly ? 'from now' : 'ago'}. Giving a medication more than 1 hour{' '}
                    {isEarly ? 'early' : 'late'} can be unsafe.
                  </div>
                </div>
              );
            })()}
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
              {(() => {
                const { status } = checkAdministrationWindow(confirmModal.item?.scheduled_time);
                const offWindow = status === 'early' || status === 'late';
                const label = status === 'early'
                  ? 'Confirm Early Administration'
                  : status === 'late'
                    ? 'Confirm Late Administration'
                    : 'Confirm';
                return (
                  <button
                    onClick={handleConfirmMarkTaken}
                    style={{
                      padding: '8px 16px',
                      border: 'none',
                      borderRadius: '4px',
                      backgroundColor: offWindow ? '#f0ad4e' : '#28a745',
                      color: '#fff',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '500'
                    }}
                    disabled={loading}
                  >
                    {loading ? 'Saving...' : label}
                  </button>
                );
              })()}
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

            {(() => {
              const offWindowMeds = markAllModal.medications
                .filter(med => markAllModal.selectedMeds.has(med.schedule_id))
                .map(med => ({ med, check: checkAdministrationWindow(med.scheduled_time) }))
                .filter(({ check }) => check.status === 'early' || check.status === 'late');
              if (offWindowMeds.length === 0) return null;
              return (
                <div
                  role="alert"
                  style={{
                    background: '#fff8e1',
                    border: '1px solid #f0ad4e',
                    borderRadius: 6,
                    padding: '10px 12px',
                    marginBottom: 16,
                    color: '#5a3e00'
                  }}
                >
                  <div style={{ fontWeight: 600, color: '#b35a00', marginBottom: 4 }}>
                    Warning: off-window administration
                  </div>
                  <div style={{ fontSize: 13, marginBottom: 6 }}>
                    {offWindowMeds.length === 1
                      ? '1 selected medication is more than 1 hour outside its scheduled window.'
                      : `${offWindowMeds.length} selected medications are more than 1 hour outside their scheduled window.`}
                    {' '}Confirm this is intentional.
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#5a3e00' }}>
                    {offWindowMeds.map(({ med, check }) => {
                      const isEarly = check.status === 'early';
                      const minutes = isEarly ? check.minutesOffset : -check.minutesOffset;
                      return (
                        <li key={`off-${med.schedule_id}`}>
                          <strong>{med.medication_name}</strong> — scheduled {check.scheduledLocal}
                          {' '}({formatDurationMinutes(minutes)} {isEarly ? 'early' : 'late'})
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })()}

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
              {(() => {
                const hasOffWindow = markAllModal.medications
                  .filter(med => markAllModal.selectedMeds.has(med.schedule_id))
                  .some(med => {
                    const { status } = checkAdministrationWindow(med.scheduled_time);
                    return status === 'early' || status === 'late';
                  });
                const disabled = markAllModal.loading || markAllModal.selectedMeds.size === 0;
                const bg = markAllModal.selectedMeds.size === 0
                  ? '#6c757d'
                  : hasOffWindow ? '#f0ad4e' : '#007bff';
                return (
                  <button
                    onClick={handleMarkAllConfirm}
                    disabled={disabled}
                    style={{
                      padding: '10px 20px',
                      border: 'none',
                      borderRadius: '6px',
                      backgroundColor: bg,
                      color: '#fff',
                      cursor: disabled ? 'not-allowed' : 'pointer',
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
                    {markAllModal.loading
                      ? 'Processing...'
                      : hasOffWindow
                        ? `Confirm Off-Window — ${markAllModal.selectedMeds.size} Selected`
                        : `Mark ${markAllModal.selectedMeds.size} Selected`}
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* PRN Modal — pick an as-needed med, then enter dose/time */}
      {prnModal.open && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 2000
        }} onClick={closePrnModal}>
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '10px',
              padding: '24px',
              maxWidth: '480px',
              width: '90%',
              maxHeight: '85vh',
              overflow: 'auto',
              boxShadow: '0 4px 16px rgba(0,0,0,0.2)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, color: '#333' }}>
                {prnModal.selectedMed ? `Give PRN — ${prnModal.selectedMed.name}` : 'Give PRN Medication'}
              </h3>
              <button
                onClick={closePrnModal}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 22, color: '#666', lineHeight: 1, padding: 0
                }}
                aria-label="Close"
              >×</button>
            </div>

            {prnError && (
              <div role="alert" style={{
                background: '#f8d7da',
                border: '1px solid #f5c6cb',
                borderRadius: 6,
                padding: '10px 12px',
                marginBottom: 16,
                color: '#721c24',
                fontSize: 13
              }}>
                {prnError}
              </div>
            )}

            {/* Step 1: pick a PRN med */}
            {!prnModal.selectedMed && (
              prnMedications.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 8px', color: '#666' }}>
                  No PRN (as-needed) medications for this patient.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {prnMedications.map(med => (
                    <button
                      key={med.id}
                      type="button"
                      onClick={() => pickPrnMed(med)}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '12px 14px',
                        textAlign: 'left',
                        background: '#f8f9fa',
                        border: '1px solid #dee2e6',
                        borderRadius: 6,
                        cursor: 'pointer'
                      }}
                    >
                      <span style={{ display: 'flex', flexDirection: 'column' }}>
                        <strong style={{ color: '#333' }}>{med.name}</strong>
                        <span style={{ color: '#666', fontSize: 12 }}>
                          {med.concentration ? `${med.concentration} • ` : ''}
                          Last given: {med.last_administered
                            ? new Date(med.last_administered).toLocaleString(undefined, {
                                month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
                              })
                            : 'never'}
                        </span>
                      </span>
                      <span style={{
                        background: '#6f42c1', color: '#fff',
                        padding: '4px 10px', borderRadius: 12,
                        fontSize: 12, fontWeight: 600
                      }}>Give</span>
                    </button>
                  ))}
                </div>
              )
            )}

            {/* Step 2: enter dose/time/notes for the picked med */}
            {prnModal.selectedMed && (
              <>
                {prnModal.selectedMed.instructions && (
                  <div style={{
                    background: '#f8f9fa',
                    border: '1px solid #dee2e6',
                    borderRadius: 6,
                    padding: '10px 12px',
                    marginBottom: 16,
                    color: '#555',
                    fontSize: 13
                  }}>
                    {prnModal.selectedMed.instructions}
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, color: '#333', fontSize: 13 }}>
                      Dose Amount *
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={prnForm.dose_amount}
                      onChange={(e) => setPrnForm(f => ({ ...f, dose_amount: e.target.value }))}
                      style={{
                        width: '100%', padding: 10, fontSize: 14,
                        border: '2px solid #ddd', borderRadius: 6,
                        boxSizing: 'border-box', background: '#f8f9fa', color: '#333'
                      }}
                      placeholder="Amount given"
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, color: '#333', fontSize: 13 }}>
                      Unit
                    </label>
                    <input
                      type="text"
                      value={prnForm.dose_unit}
                      onChange={(e) => setPrnForm(f => ({ ...f, dose_unit: e.target.value }))}
                      style={{
                        width: '100%', padding: 10, fontSize: 14,
                        border: '2px solid #ddd', borderRadius: 6,
                        boxSizing: 'border-box', background: '#f8f9fa', color: '#333'
                      }}
                      placeholder="mg, ml, tablets..."
                    />
                  </div>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, color: '#333', fontSize: 13 }}>
                    Given At *
                  </label>
                  <input
                    type="datetime-local"
                    value={prnForm.given_at}
                    onChange={(e) => setPrnForm(f => ({ ...f, given_at: e.target.value }))}
                    style={{
                      width: '100%', padding: 10, fontSize: 14,
                      border: '2px solid #ddd', borderRadius: 6,
                      boxSizing: 'border-box', background: '#f8f9fa', color: '#333'
                    }}
                  />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, color: '#333', fontSize: 13 }}>
                    Notes (optional)
                  </label>
                  <textarea
                    value={prnForm.notes}
                    onChange={(e) => setPrnForm(f => ({ ...f, notes: e.target.value }))}
                    rows={2}
                    style={{
                      width: '100%', padding: 10, fontSize: 14,
                      border: '2px solid #ddd', borderRadius: 6,
                      boxSizing: 'border-box', background: '#f8f9fa', color: '#333',
                      resize: 'vertical'
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between' }}>
                  <button
                    type="button"
                    onClick={() => setPrnModal({ open: true, selectedMed: null })}
                    disabled={prnSaving}
                    style={{
                      padding: '8px 16px',
                      border: '1px solid #ddd',
                      borderRadius: 4,
                      background: '#fff',
                      color: '#333',
                      cursor: prnSaving ? 'not-allowed' : 'pointer',
                      fontSize: 14
                    }}
                  >
                    ← Back
                  </button>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <button
                      type="button"
                      onClick={closePrnModal}
                      disabled={prnSaving}
                      style={{
                        padding: '8px 16px',
                        border: '1px solid #ddd',
                        borderRadius: 4,
                        background: '#fff',
                        color: '#333',
                        cursor: prnSaving ? 'not-allowed' : 'pointer',
                        fontSize: 14
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handlePrnSave}
                      disabled={prnSaving || !prnForm.dose_amount || !prnForm.given_at}
                      style={{
                        padding: '8px 16px',
                        border: 'none',
                        borderRadius: 4,
                        background: '#6f42c1',
                        color: '#fff',
                        cursor: (prnSaving || !prnForm.dose_amount || !prnForm.given_at) ? 'not-allowed' : 'pointer',
                        fontSize: 14,
                        fontWeight: 500,
                        opacity: (prnSaving || !prnForm.dose_amount || !prnForm.given_at) ? 0.6 : 1
                      }}
                    >
                      {prnSaving ? 'Saving...' : 'Record Administration'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Out-of-stock gate — must update on-hand quantity before the dose records */}
      {qtyGate.open && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 2100
        }}>
          <div style={{
            backgroundColor: '#fff', borderRadius: '10px', padding: '32px',
            maxWidth: '420px', width: '90%', boxShadow: '0 4px 16px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{ margin: '0 0 12px 0', color: '#333' }}>
              Out of Stock — {qtyGate.info?.medication_name}
            </h3>
            <div role="alert" style={{
              background: '#fdecea', border: '1px solid #f5c2c0', borderRadius: 6,
              padding: '10px 12px', marginBottom: 16, color: '#611a15', fontSize: 14
            }}>
              Only <strong>{qtyGate.info?.current_quantity ?? 0} {qtyGate.info?.quantity_unit || ''}</strong> on
              hand, but this dose needs <strong>{qtyGate.info?.requested_dose} {qtyGate.info?.quantity_unit || ''}</strong>.
              Update the on-hand quantity to continue — the dose can’t be recorded until you do.
            </div>
            {qtyError && (
              <div style={{ color: '#c0392b', fontSize: 13, marginBottom: 12 }}>{qtyError}</div>
            )}
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, color: '#333', fontSize: 13 }}>
              New on-hand quantity{qtyGate.info?.quantity_unit ? ` (${qtyGate.info.quantity_unit})` : ''} *
            </label>
            <input
              type="number" step="0.1" min="0" value={qtyInput} autoFocus
              onChange={(e) => setQtyInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !qtySaving && parseFloat(qtyInput) > 0) handleQtySave(); }}
              style={{
                width: '100%', padding: 10, fontSize: 14, border: '2px solid #ddd',
                borderRadius: 6, boxSizing: 'border-box', background: '#f8f9fa', color: '#333', marginBottom: 20
              }}
              placeholder="Enter current count on hand"
            />
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={closeQtyGate}
                disabled={qtySaving}
                style={{
                  padding: '8px 16px', border: '1px solid #ddd', borderRadius: 4,
                  background: '#fff', color: '#333', cursor: qtySaving ? 'not-allowed' : 'pointer', fontSize: 14
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleQtySave}
                disabled={qtySaving || !(parseFloat(qtyInput) > 0)}
                style={{
                  padding: '8px 16px', border: 'none', borderRadius: 4,
                  background: '#28a745', color: '#fff',
                  cursor: (qtySaving || !(parseFloat(qtyInput) > 0)) ? 'not-allowed' : 'pointer',
                  fontSize: 14, fontWeight: 500,
                  opacity: (qtySaving || !(parseFloat(qtyInput) > 0)) ? 0.6 : 1
                }}
              >
                {qtySaving ? 'Saving...' : 'Update & Continue'}
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
