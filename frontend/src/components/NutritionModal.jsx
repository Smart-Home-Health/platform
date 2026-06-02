import React, { useState, useEffect, useMemo } from 'react';
import ModalBase from './ModalBase';
import config from '../config';
import { useAdminPatient } from '../contexts/AdminPatientContext';
import { useAuth } from '../contexts/AuthContext';
import {
  checkAdministrationWindow,
  formatDurationMinutes,
  getCurrentLocalDateTime,
} from '../utils/timezone';
import IntakeModal from '../pages/admin-v2/components/IntakeModal';
import OutputModal from '../pages/admin-v2/components/OutputModal';
import ScheduleList from './schedule/ScheduleList';
// Pull in AdminV2 styles so the shared Intake/Output modals render correctly
// when this component is mounted from the live dashboard (which doesn't
// otherwise load admin-v2 CSS). Vite dedupes with admin pages that also import it.
import '../pages/admin-v2/AdminV2.css';

const NutritionModal = ({ onClose }) => {
  const { selectedPatient } = useAdminPatient();
  const { user } = useAuth() || {};
  const [tab, setTab] = useState('scheduled');
  const [scheduled, setScheduled] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth <= 768);

  // Off-window confirm (mirrors care-task modal)
  const [windowConfirm, setWindowConfirm] = useState({ open: false, item: null, check: null });

  // PRN flow: 'pick' opens the choice screen; 'intake'/'output' delegate to
  // the shared AdminV2 modal of the same name.
  const [prnMode, setPrnMode] = useState(null); // null | 'pick' | 'intake' | 'output'
  const [prnDefaultDateTime, setPrnDefaultDateTime] = useState('');

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
        `${config.apiUrl}/api/schedule/daily?patient_id=${selectedPatient.id}&target_date=${dateParam}&tz_offset_minutes=${tz}&include_prior_day=true`,
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

  // Compute time-based status for ScheduleList (matches care-task backend logic).
  const computeStatus = (item) => {
    if (item.completed) return 'completed';
    if (item.is_yesterday) return 'missed';
    const now = new Date();
    const sched = new Date(item.scheduled_time);
    const diffMin = (sched - now) / 60000;
    if (diffMin > 30) return 'pending';
    if (diffMin > 15) return 'pending';
    if (diffMin > -15) return 'due_on_time';
    if (diffMin > -60) return 'due_warning';
    return 'missed';
  };

  // Normalize the API rows into the shape ScheduleList expects.
  const scheduledItems = useMemo(() => {
    return scheduled.map(item => {
      const detail = [];
      if (item.default_item) detail.push(item.default_item);
      if (item.default_amount != null) {
        detail.push(`${item.default_amount}${item.default_amount_unit ? ' ' + item.default_amount_unit : ''}`);
      }
      if (item.default_calories != null) detail.push(`${item.default_calories} kcal`);
      return {
        id: `${item.schedule_id}-${item.scheduled_time}`,
        scheduled_time: item.scheduled_time,
        name: item.name,
        description: item.description,
        extra: detail.length ? detail.join(' · ') : null,
        category: null,
        status: computeStatus(item),
        is_completed: !!item.completed,
        is_yesterday: !!item.is_yesterday,
        _raw: item,
      };
    });
  }, [scheduled]);

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

  // ===== PRN entry =====
  const openPrnPicker = () => {
    setPrnDefaultDateTime(getCurrentLocalDateTime());
    setPrnMode('pick');
  };

  const closePrn = () => setPrnMode(null);

  const onPrnSaved = () => {
    closePrn();
    fetchSchedule();
  };

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
            {tab === 'scheduled' && (
              <ScheduleList
                items={scheduledItems}
                loading={loading}
                title="Scheduled Nutrition"
                emptyText="No scheduled nutrition for today"
                onMarkComplete={(item) => handleMarkCompleted(item._raw)}
              />
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

      {/* PRN pick: intake vs output */}
      {prnMode === 'pick' && (
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
              maxWidth: 480, width: '90%',
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
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Log Ad-Hoc Nutrition</h3>
              <button
                onClick={closePrn}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: '#a0aec0', padding: 0 }}
                aria-label="Close"
              >×</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <button
                type="button"
                onClick={() => setPrnMode('intake')}
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
                onClick={() => setPrnMode('output')}
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
          </div>
        </div>
      )}

      {/* Shared AdminV2 intake form */}
      <IntakeModal
        open={prnMode === 'intake'}
        onClose={closePrn}
        onSaved={onPrnSaved}
        patient={selectedPatient}
        defaultDateTime={prnDefaultDateTime}
      />

      {/* Shared AdminV2 output form */}
      <OutputModal
        open={prnMode === 'output'}
        onClose={closePrn}
        onSaved={onPrnSaved}
        patient={selectedPatient}
        defaultDateTime={prnDefaultDateTime}
      />
    </>
  );
};

export default NutritionModal;
