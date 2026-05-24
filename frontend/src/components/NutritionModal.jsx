import React, { useState, useEffect } from 'react';
import ModalBase from './ModalBase';
import config from '../config';
import { useAdminPatient } from '../contexts/AdminPatientContext';
import { useAuth } from '../contexts/AuthContext';
import {
  checkAdministrationWindow,
  formatDurationMinutes,
  getCurrentLocalDateTime,
  localDateTimeToUTC,
} from '../utils/timezone';

const INTAKE_TYPES = [
  { value: 'liquid', label: 'Liquid' },
  { value: 'food', label: 'Food' },
  { value: 'supplement', label: 'Supplement' },
];

const OUTPUT_TYPES = [
  { value: 'urine', label: 'Urine' },
  { value: 'bowel', label: 'Bowel' },
  { value: 'vomit', label: 'Vomit' },
  { value: 'other', label: 'Other' },
];

const NutritionModal = ({ onClose }) => {
  const { selectedPatient } = useAdminPatient();
  const { user } = useAuth() || {};
  const [tab, setTab] = useState('scheduled');
  const [scheduled, setScheduled] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth <= 768);

  // Off-window confirm (mirrors care-task modal)
  const [windowConfirm, setWindowConfirm] = useState({ open: false, item: null, check: null });

  // PRN: pick → intake | output form
  const [prnModal, setPrnModal] = useState({ open: false, mode: null }); // 'pick' | 'intake' | 'output'
  const [intakeForm, setIntakeForm] = useState({
    item_type: 'liquid',
    item_name: '',
    amount: '',
    amount_unit: 'ml',
    consumed_at: '',
    notes: '',
  });
  const [outputForm, setOutputForm] = useState({
    output_type: 'urine',
    amount: '',
    amount_unit: 'ml',
    occurred_at: '',
    notes: '',
  });
  const [prnSaving, setPrnSaving] = useState(false);
  const [prnError, setPrnError] = useState(null);

  // ===== Boilerplate =====
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (document.getElementById('nutrition-modal-styles')) return;
    const style = document.createElement('style');
    style.id = 'nutrition-modal-styles';
    style.textContent = `
      @keyframes nutModalFade { 0% { opacity: 0; } 100% { opacity: 1; } }
      @keyframes nutModalSlide { 0% { opacity: 0; transform: translateY(20px); } 100% { opacity: 1; transform: translateY(0); } }
    `;
    document.head.appendChild(style);
  }, []);

  useEffect(() => {
    if (!selectedPatient) return;
    if (tab === 'scheduled') fetchSchedule();
  }, [tab, selectedPatient?.id]);

  const fetchSchedule = async () => {
    if (!selectedPatient) return;
    setLoading(true);
    try {
      const today = new Date();
      const dateParam = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const tz = -today.getTimezoneOffset();
      const res = await fetch(
        `${config.apiUrl}/api/schedule/daily?patient_id=${selectedPatient.id}&target_date=${dateParam}&tz_offset_minutes=${tz}`,
        { credentials: 'include' }
      );
      if (res.ok) {
        const data = await res.json();
        setScheduled(data.nutrition || []);
      }
    } catch (err) {
      console.error('Error fetching nutrition schedule:', err);
    } finally {
      setLoading(false);
    }
  };

  // ===== Status helpers =====
  const getStatus = (item) => {
    if (item.completed) return { color: '#3fb950', bg: 'rgba(63,185,80,0.12)', label: 'Completed' };
    const now = new Date();
    const sched = new Date(item.scheduled_time);
    const diffMin = (sched - now) / 60000;
    if (diffMin > 60) return { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', label: 'Upcoming' };
    if (diffMin > -15) return { color: '#3fb950', bg: 'rgba(63,185,80,0.12)', label: 'Ready' };
    if (diffMin > -60) return { color: '#f0b400', bg: 'rgba(240,180,0,0.12)', label: 'Late' };
    return { color: '#dc3545', bg: 'rgba(220,53,69,0.12)', label: 'Missed' };
  };

  const formatTime = (iso) => {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  // Group scheduled items by hour
  const groupByHour = (items) => {
    const sorted = [...items].sort((a, b) => new Date(a.scheduled_time) - new Date(b.scheduled_time));
    const groups = new Map();
    for (const item of sorted) {
      const d = new Date(item.scheduled_time);
      const key = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
      if (!groups.has(key)) groups.set(key, { time: formatTime(item.scheduled_time), items: [] });
      groups.get(key).items.push(item);
    }
    return Array.from(groups.values());
  };

  // ===== Complete scheduled item =====
  const submitComplete = async (item, earlyOverride = false) => {
    try {
      const res = await fetch(`${config.apiUrl}/api/schedule/complete/nutrition`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schedule_id: item.schedule_id,
          scheduled_time: item.scheduled_time,
          patient_id: selectedPatient.id,
          user_id: user?.id || null,
          completed_at: null,
          notes: 'Completed via live dashboard',
          early_override: earlyOverride,
        }),
      });
      if (res.ok) {
        fetchSchedule();
        return;
      }
      const errorData = await res.json().catch(() => ({}));
      const offWindow = res.status === 409 && (
        errorData.error === 'early_administration' ||
        errorData.error === 'late_administration' ||
        errorData.error === 'off_window_administration'
      );
      if (offWindow && !earlyOverride) {
        setWindowConfirm({
          open: true,
          item,
          check: checkAdministrationWindow(item.scheduled_time),
        });
        return;
      }
      alert(errorData.detail || errorData.error || 'Failed to mark as completed');
    } catch (err) {
      console.error('Error completing nutrition item:', err);
      alert('Error connecting to server');
    }
  };

  const handleMarkCompleted = (item) => submitComplete(item, false);

  // ===== PRN =====
  const openPrnPicker = () => {
    setPrnError(null);
    const now = getCurrentLocalDateTime();
    setIntakeForm(f => ({ ...f, consumed_at: now }));
    setOutputForm(f => ({ ...f, occurred_at: now }));
    setPrnModal({ open: true, mode: 'pick' });
  };

  const closePrn = () => {
    setPrnModal({ open: false, mode: null });
    setPrnError(null);
    setPrnSaving(false);
  };

  const submitIntake = async () => {
    if (!selectedPatient) return;
    setPrnSaving(true);
    setPrnError(null);
    try {
      const res = await fetch(
        `${config.apiUrl}/api/nutrition-intake?patient_id=${selectedPatient.id}`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            item_name: intakeForm.item_name,
            item_type: intakeForm.item_type,
            amount: parseFloat(intakeForm.amount) || 0,
            amount_unit: intakeForm.amount_unit,
            consumed_at: intakeForm.consumed_at ? localDateTimeToUTC(intakeForm.consumed_at) : null,
            notes: intakeForm.notes || null,
          }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to record intake');
      }
      closePrn();
      fetchSchedule();
    } catch (err) {
      setPrnError(err.message);
    } finally {
      setPrnSaving(false);
    }
  };

  const submitOutput = async () => {
    if (!selectedPatient) return;
    setPrnSaving(true);
    setPrnError(null);
    try {
      const body = {
        patient_id: selectedPatient.id,
        output_type: outputForm.output_type,
        occurred_at: outputForm.occurred_at
          ? localDateTimeToUTC(outputForm.occurred_at)
          : new Date().toISOString(),
        notes: outputForm.notes || null,
      };
      if (outputForm.amount !== '') {
        body.amount = parseFloat(outputForm.amount) || 0;
        body.amount_unit = outputForm.amount_unit;
      }
      const res = await fetch(`${config.apiUrl}/api/nutrition/outputs`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to record output');
      }
      closePrn();
      fetchSchedule();
    } catch (err) {
      setPrnError(err.message);
    } finally {
      setPrnSaving(false);
    }
  };

  // ===== Reusable form styles =====
  const inputStyle = {
    width: '100%', padding: 10, fontSize: 14,
    background: '#2d3748', color: '#fff',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 6, boxSizing: 'border-box', outline: 'none',
  };
  const labelStyle = { display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13, color: '#e6edf3' };

  const typeButton = (value, label, current, onPick) => (
    <button
      key={value}
      type="button"
      onClick={() => onPick(value)}
      style={{
        flex: 1, minWidth: 80, padding: '10px 12px',
        borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)',
        background: current === value ? '#3fb950' : 'transparent',
        color: current === value ? '#0d1117' : '#e6edf3',
        cursor: 'pointer', fontSize: 13, fontWeight: 600,
      }}
    >{label}</button>
  );

  // ===== Render =====
  return (
    <>
      <ModalBase isOpen={true} onClose={onClose} title={
        isMobile ? (
          <div style={{ display: 'flex', gap: 8, width: '100%' }}>
            <select
              value={tab}
              onChange={(e) => setTab(e.target.value)}
              style={{
                flex: 1, padding: '12px 16px', fontSize: 15, fontWeight: 600,
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
                backgroundColor: '#1a2332', color: '#fff',
                cursor: 'pointer', outline: 'none',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                WebkitAppearance: 'none', MozAppearance: 'none', appearance: 'none',
                backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'white\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3e%3cpolyline points=\'6 9 12 15 18 9\'%3e%3c/polyline%3e%3c/svg%3e")',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 12px center',
                backgroundSize: 20, paddingRight: 40, minWidth: 0,
              }}
            >
              <option value="scheduled" style={{ backgroundColor: '#1a2332', color: '#fff' }}>Scheduled</option>
            </select>
            <button
              onClick={openPrnPicker}
              disabled={!selectedPatient}
              style={{
                padding: '12px 18px', border: 'none', borderRadius: 8,
                backgroundColor: '#6f42c1', color: '#fff',
                cursor: selectedPatient ? 'pointer' : 'not-allowed',
                opacity: selectedPatient ? 1 : 0.6,
                fontWeight: 600, fontSize: 15,
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)', flexShrink: 0,
              }}
            >PRN</button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
            <button
              onClick={() => setTab('scheduled')}
              style={{
                padding: '8px 14px', border: 'none', borderRadius: 6,
                backgroundColor: tab === 'scheduled' ? '#007bff' : '#f8f9fa',
                color: tab === 'scheduled' ? '#fff' : '#333',
                cursor: 'pointer', fontWeight: 500, fontSize: 13,
              }}
            >Scheduled</button>
            <button
              onClick={openPrnPicker}
              disabled={!selectedPatient}
              style={{
                padding: '8px 14px', border: 'none', borderRadius: 6,
                backgroundColor: '#6f42c1', color: '#fff',
                cursor: selectedPatient ? 'pointer' : 'not-allowed',
                opacity: selectedPatient ? 1 : 0.6,
                fontWeight: 500, fontSize: 13,
              }}
            >PRN</button>
          </div>
        )
      }>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Patient banner */}
          <div style={{
            marginBottom: 16, padding: 12,
            backgroundColor: selectedPatient ? '#e8f4fd' : '#fff3cd',
            borderRadius: 6,
            border: selectedPatient ? '1px solid #b3d7ff' : '1px solid #ffeaa7',
          }}>
            <span style={{ fontSize: 14, color: selectedPatient ? '#0066cc' : '#856404', fontWeight: 500 }}>
              {selectedPatient
                ? <>Viewing nutrition for: {selectedPatient.first_name} {selectedPatient.last_name}</>
                : 'No patient selected'}
            </span>
          </div>

          <div style={{ flex: 1, overflow: 'auto' }}>
            {loading && <div style={{ textAlign: 'center', padding: 40, color: '#a0aec0' }}>Loading…</div>}

            {!loading && tab === 'scheduled' && (
              scheduled.length === 0 ? (
                <div style={{
                  textAlign: 'center', padding: 40,
                  background: '#2d3748', borderRadius: 8,
                  border: '1px solid #4a5568', color: '#a0aec0',
                }}>
                  <p style={{ margin: '0 0 6px 0', fontSize: 18, fontWeight: 500, color: '#fff' }}>
                    No scheduled nutrition for today
                  </p>
                  <p style={{ margin: 0 }}>Use PRN to log ad-hoc intake or output.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {groupByHour(scheduled).map(group => (
                    <div key={group.time}>
                      <div style={{
                        fontWeight: 700, fontSize: 18, color: '#00bfff',
                        marginBottom: 8, letterSpacing: 0.2,
                      }}>{group.time}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {group.items.map(item => {
                          const st = getStatus(item);
                          return (
                            <div
                              key={`${item.schedule_id}-${item.scheduled_time}`}
                              style={{
                                background: '#fff',
                                border: '1px solid #e9ecef',
                                borderLeft: `6px solid ${st.color}`,
                                borderRadius: 10,
                                padding: isMobile ? '12px 14px' : '14px 18px',
                                display: 'flex',
                                flexDirection: isMobile ? 'column' : 'row',
                                alignItems: isMobile ? 'stretch' : 'center',
                                gap: isMobile ? 10 : 12,
                                opacity: item.completed ? 0.7 : 1,
                              }}
                            >
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                                  <h4 style={{ margin: 0, color: '#222', fontSize: isMobile ? 15 : 16, fontWeight: 700 }}>
                                    {item.name}
                                  </h4>
                                  <span style={{
                                    padding: '2px 8px', borderRadius: 10,
                                    background: st.bg, color: st.color,
                                    fontSize: 11, fontWeight: 700,
                                    border: `1px solid ${st.color}40`,
                                  }}>{st.label}</span>
                                </div>
                                {(item.default_item || item.default_amount) && (
                                  <div style={{ color: '#555', fontSize: 13 }}>
                                    {item.default_item && <strong>{item.default_item}</strong>}
                                    {item.default_amount != null && (
                                      <> — {item.default_amount} {item.default_amount_unit || ''}</>
                                    )}
                                    {item.default_calories != null && (
                                      <> · {item.default_calories} kcal</>
                                    )}
                                  </div>
                                )}
                                {item.description && (
                                  <div style={{ color: '#777', fontSize: 12, marginTop: 4, fontStyle: 'italic' }}>
                                    {item.description}
                                  </div>
                                )}
                              </div>
                              <div style={{ display: 'flex', gap: 8, width: isMobile ? '100%' : 'auto' }}>
                                {item.completed ? (
                                  <span style={{
                                    padding: isMobile ? '10px 14px' : '6px 14px',
                                    background: '#e8f5e8', color: '#28a745',
                                    borderRadius: 8, fontSize: 13, fontWeight: 600,
                                    flex: isMobile ? 1 : '0 0 auto',
                                    textAlign: 'center',
                                  }}>✓ Completed</span>
                                ) : (
                                  <button
                                    onClick={() => handleMarkCompleted(item)}
                                    style={{
                                      padding: isMobile ? '10px 14px' : '6px 14px',
                                      border: 'none', borderRadius: 8,
                                      background: '#28a745', color: '#fff',
                                      cursor: 'pointer', fontSize: isMobile ? 14 : 13, fontWeight: 600,
                                      flex: isMobile ? 1 : '0 0 auto',
                                    }}
                                  >
                                    {st.label === 'Missed' ? 'Complete Now' : 'Mark Complete'}
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </div>
      </ModalBase>

      {/* Off-window confirm */}
      {windowConfirm.open && windowConfirm.item && windowConfirm.check && (() => {
        const isLate = windowConfirm.check.status === 'late';
        const title = isLate ? 'Confirm Late Completion' : 'Confirm Early Completion';
        const heading = isLate
          ? 'This nutrition item was scheduled earlier'
          : 'This nutrition item is scheduled later';
        const offsetText = isLate
          ? `${formatDurationMinutes(Math.abs(windowConfirm.check.minutesOffset))} ago`
          : `${formatDurationMinutes(windowConfirm.check.minutesOffset)} from now`;
        const close = () => setWindowConfirm({ open: false, item: null, check: null });
        return (
          <div style={{
            position: 'fixed', inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1060, animation: 'nutModalFade 0.2s ease-out',
          }} onClick={close}>
            <div onClick={e => e.stopPropagation()} style={{
              backgroundColor: '#1a2332', borderRadius: 12, padding: 24,
              maxWidth: 440, width: '90%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.08)',
              animation: 'nutModalSlide 0.25s ease-out', color: '#e6edf3',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                marginBottom: 16, paddingBottom: 12,
                borderBottom: '1px solid rgba(255,255,255,0.08)',
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  backgroundColor: 'rgba(240,136,62,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#f0883e', fontSize: 18, fontWeight: 700,
                }}>⚠</div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{title}</h3>
              </div>
              <div style={{
                background: 'rgba(187,128,9,0.15)',
                border: '1px solid rgba(187,128,9,0.5)',
                borderRadius: 6, padding: '12px 14px', fontSize: 14, lineHeight: 1.5,
              }}>
                <div style={{ fontWeight: 600, color: '#f0883e', marginBottom: 6 }}>{heading}</div>
                <div>
                  <strong>{windowConfirm.item.name}</strong> is scheduled for{' '}
                  <strong>{windowConfirm.check.scheduledLocal}</strong> — that's{' '}
                  <strong>{offsetText}</strong>.
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                <button onClick={close} style={{
                  padding: '10px 18px', border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 8, background: 'transparent', color: '#e6edf3',
                  cursor: 'pointer', fontSize: 14, fontWeight: 500,
                }}>Cancel</button>
                <button
                  onClick={async () => {
                    const item = windowConfirm.item;
                    close();
                    await submitComplete(item, true);
                  }}
                  style={{
                    padding: '10px 18px', border: 'none', borderRadius: 8,
                    background: '#bb8009', color: '#0d1117',
                    cursor: 'pointer', fontSize: 14, fontWeight: 600,
                  }}
                >Complete Anyway</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* PRN modal — pick → intake | output form */}
      {prnModal.open && (
        <div
          onClick={closePrn}
          style={{
            position: 'fixed', inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1060, animation: 'nutModalFade 0.2s ease-out',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              backgroundColor: '#1a2332', borderRadius: 12, padding: 24,
              maxWidth: 480, width: '90%', maxHeight: '85vh', overflow: 'auto',
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.08)',
              animation: 'nutModalSlide 0.25s ease-out', color: '#e6edf3',
            }}
          >
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: 16, paddingBottom: 12,
              borderBottom: '1px solid rgba(255,255,255,0.08)',
            }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
                {prnModal.mode === 'intake' && 'Log Intake'}
                {prnModal.mode === 'output' && 'Log Output'}
                {prnModal.mode === 'pick' && 'Log Ad-Hoc Nutrition'}
              </h3>
              <button
                onClick={closePrn}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: '#a0aec0', padding: 0 }}
                aria-label="Close"
              >×</button>
            </div>

            {prnError && (
              <div role="alert" style={{
                background: 'rgba(220,53,69,0.15)',
                border: '1px solid rgba(220,53,69,0.5)',
                borderRadius: 6, padding: '10px 12px', marginBottom: 16,
                color: '#f8d7da', fontSize: 13,
              }}>{prnError}</div>
            )}

            {/* Step 1: pick intake or output */}
            {prnModal.mode === 'pick' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <button
                  type="button"
                  onClick={() => setPrnModal({ open: true, mode: 'intake' })}
                  style={{
                    padding: '24px 16px', borderRadius: 10, border: 'none',
                    background: '#3fb950', color: '#0d1117',
                    cursor: 'pointer', fontSize: 16, fontWeight: 700,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  }}
                >
                  <span style={{ fontSize: 24 }}>↓</span>
                  Log Intake
                </button>
                <button
                  type="button"
                  onClick={() => setPrnModal({ open: true, mode: 'output' })}
                  style={{
                    padding: '24px 16px', borderRadius: 10,
                    border: '1px solid rgba(255,255,255,0.15)',
                    background: 'transparent', color: '#e6edf3',
                    cursor: 'pointer', fontSize: 16, fontWeight: 700,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  }}
                >
                  <span style={{ fontSize: 24 }}>↑</span>
                  Log Output
                </button>
              </div>
            )}

            {/* Step 2a: intake form */}
            {prnModal.mode === 'intake' && (
              <>
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Type *</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {INTAKE_TYPES.map(t => typeButton(t.value, t.label, intakeForm.item_type, (v) => setIntakeForm(f => ({ ...f, item_type: v }))))}
                  </div>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Item Name *</label>
                  <input
                    type="text"
                    value={intakeForm.item_name}
                    onChange={e => setIntakeForm(f => ({ ...f, item_name: e.target.value }))}
                    placeholder="e.g. Water, Peptamen, Apple"
                    style={inputStyle}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 14 }}>
                  <div>
                    <label style={labelStyle}>Amount *</label>
                    <input
                      type="number" step="0.1" min="0"
                      value={intakeForm.amount}
                      onChange={e => setIntakeForm(f => ({ ...f, amount: e.target.value }))}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Unit</label>
                    <select
                      value={intakeForm.amount_unit}
                      onChange={e => setIntakeForm(f => ({ ...f, amount_unit: e.target.value }))}
                      style={{ ...inputStyle, cursor: 'pointer' }}
                    >
                      <option value="ml">ml</option>
                      <option value="oz">oz</option>
                      <option value="cups">cups</option>
                      <option value="grams">grams</option>
                      <option value="servings">servings</option>
                    </select>
                  </div>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Consumed At *</label>
                  <input
                    type="datetime-local"
                    value={intakeForm.consumed_at}
                    onChange={e => setIntakeForm(f => ({ ...f, consumed_at: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
                <div style={{ marginBottom: 18 }}>
                  <label style={labelStyle}>Notes (optional)</label>
                  <textarea
                    rows={2}
                    value={intakeForm.notes}
                    onChange={e => setIntakeForm(f => ({ ...f, notes: e.target.value }))}
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
                  <button
                    type="button"
                    onClick={() => setPrnModal({ open: true, mode: 'pick' })}
                    disabled={prnSaving}
                    style={{
                      padding: '8px 16px', borderRadius: 6,
                      border: '1px solid rgba(255,255,255,0.15)',
                      background: 'transparent', color: '#e6edf3',
                      cursor: prnSaving ? 'not-allowed' : 'pointer', fontSize: 14,
                    }}
                  >← Back</button>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      type="button" onClick={closePrn} disabled={prnSaving}
                      style={{
                        padding: '8px 16px', borderRadius: 6,
                        border: '1px solid rgba(255,255,255,0.15)',
                        background: 'transparent', color: '#e6edf3',
                        cursor: prnSaving ? 'not-allowed' : 'pointer', fontSize: 14,
                      }}
                    >Cancel</button>
                    <button
                      type="button" onClick={submitIntake}
                      disabled={prnSaving || !intakeForm.item_name || !intakeForm.amount || !intakeForm.consumed_at}
                      style={{
                        padding: '8px 16px', borderRadius: 6, border: 'none',
                        background: '#3fb950', color: '#0d1117',
                        cursor: (prnSaving || !intakeForm.item_name || !intakeForm.amount || !intakeForm.consumed_at) ? 'not-allowed' : 'pointer',
                        fontSize: 14, fontWeight: 600,
                        opacity: (prnSaving || !intakeForm.item_name || !intakeForm.amount || !intakeForm.consumed_at) ? 0.6 : 1,
                      }}
                    >{prnSaving ? 'Saving…' : 'Save Intake'}</button>
                  </div>
                </div>
              </>
            )}

            {/* Step 2b: output form */}
            {prnModal.mode === 'output' && (
              <>
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Type *</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {OUTPUT_TYPES.map(t => typeButton(t.value, t.label, outputForm.output_type, (v) => setOutputForm(f => ({ ...f, output_type: v }))))}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 14 }}>
                  <div>
                    <label style={labelStyle}>Amount (optional)</label>
                    <input
                      type="number" step="0.1" min="0"
                      value={outputForm.amount}
                      onChange={e => setOutputForm(f => ({ ...f, amount: e.target.value }))}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Unit</label>
                    <select
                      value={outputForm.amount_unit}
                      onChange={e => setOutputForm(f => ({ ...f, amount_unit: e.target.value }))}
                      style={{ ...inputStyle, cursor: 'pointer' }}
                    >
                      <option value="ml">ml</option>
                      <option value="oz">oz</option>
                      <option value="small">small</option>
                      <option value="medium">medium</option>
                      <option value="large">large</option>
                    </select>
                  </div>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Occurred At *</label>
                  <input
                    type="datetime-local"
                    value={outputForm.occurred_at}
                    onChange={e => setOutputForm(f => ({ ...f, occurred_at: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
                <div style={{ marginBottom: 18 }}>
                  <label style={labelStyle}>Notes (optional)</label>
                  <textarea
                    rows={2}
                    value={outputForm.notes}
                    onChange={e => setOutputForm(f => ({ ...f, notes: e.target.value }))}
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
                  <button
                    type="button"
                    onClick={() => setPrnModal({ open: true, mode: 'pick' })}
                    disabled={prnSaving}
                    style={{
                      padding: '8px 16px', borderRadius: 6,
                      border: '1px solid rgba(255,255,255,0.15)',
                      background: 'transparent', color: '#e6edf3',
                      cursor: prnSaving ? 'not-allowed' : 'pointer', fontSize: 14,
                    }}
                  >← Back</button>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      type="button" onClick={closePrn} disabled={prnSaving}
                      style={{
                        padding: '8px 16px', borderRadius: 6,
                        border: '1px solid rgba(255,255,255,0.15)',
                        background: 'transparent', color: '#e6edf3',
                        cursor: prnSaving ? 'not-allowed' : 'pointer', fontSize: 14,
                      }}
                    >Cancel</button>
                    <button
                      type="button" onClick={submitOutput}
                      disabled={prnSaving || !outputForm.occurred_at}
                      style={{
                        padding: '8px 16px', borderRadius: 6, border: 'none',
                        background: '#3fb950', color: '#0d1117',
                        cursor: (prnSaving || !outputForm.occurred_at) ? 'not-allowed' : 'pointer',
                        fontSize: 14, fontWeight: 600,
                        opacity: (prnSaving || !outputForm.occurred_at) ? 0.6 : 1,
                      }}
                    >{prnSaving ? 'Saving…' : 'Save Output'}</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default NutritionModal;
