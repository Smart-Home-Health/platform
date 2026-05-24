import { useState, useEffect } from 'react';
import config from '../config';
import ModalBase from './ModalBase';
import { useAdminPatient } from '../contexts/AdminPatientContext';

export default function EquipmentModal({ isOpen, onClose, noModal, equipmentDueCount }) {
  const { selectedPatient } = useAdminPatient();
  const [tab, setTab] = useState('list');
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [selectedEquip, setSelectedEquip] = useState(null);
  const [addForm, setAddForm] = useState({
    name: '',
    quantity: 1,
    scheduled_replacement: true,
    last_changed: '',
    useful_days: '',
  });
  const [addLoading, setAddLoading] = useState(false);
  const [historyTab, setHistoryTab] = useState({ filter: '', logs: [], loading: false, selectedEquipment: '' });
  const [editEquip, setEditEquip] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', quantity: 1 });
  const [editLoading, setEditLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth <= 768);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (isOpen && selectedPatient) fetchEquipment();
  }, [isOpen, selectedPatient?.id]);

  const fetchEquipment = async () => {
    if (!selectedPatient) return;
    setLoading(true);
    try {
      const res = await fetch(`${config.apiUrl}/api/equipment?patient_id=${selectedPatient.id}`, {
        credentials: 'include',
      });
      const data = await res.json();
      setEquipment(data);
    } catch (err) {
      setEquipment([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    setAddLoading(true);
    try {
      const payload = {
        name: addForm.name,
        quantity: parseInt(addForm.quantity),
        scheduled_replacement: addForm.scheduled_replacement,
      };
      if (addForm.scheduled_replacement) {
        payload.last_changed = addForm.last_changed;
        payload.useful_days = parseInt(addForm.useful_days);
      }
      if (selectedPatient) payload.patient_id = selectedPatient.id;
      await fetch(`${config.apiUrl}/api/equipment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      setAddForm({
        name: '',
        quantity: 1,
        scheduled_replacement: true,
        last_changed: '',
        useful_days: '',
      });
      fetchEquipment();
      setTab('list');
    } finally {
      setAddLoading(false);
    }
  };

  const handleChangeClick = (equip) => {
    setSelectedEquip(equip);
    setShowConfirm(true);
  };

  const handleConfirmChange = async () => {
    setShowConfirm(false);
    if (!selectedEquip) return;
    await fetch(`${config.apiUrl}/api/equipment/${selectedEquip.id}/change`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ changed_at: new Date().toISOString() }),
    });
    setSelectedEquip(null);
    fetchEquipment();
  };

  const handleReceive = async (equip) => {
    const amount = prompt('How many to receive?', '1');
    if (!amount || isNaN(amount)) return;
    await fetch(`${config.apiUrl}/api/equipment/${equip.id}/receive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ amount: parseInt(amount) }),
    });
    fetchEquipment();
  };

  const handleOpen = async (equip) => {
    const amount = prompt('How many to open/use?', '1');
    if (!amount || isNaN(amount)) return;
    const numAmount = parseInt(amount);
    if (numAmount > equip.quantity) {
      alert(`Cannot open ${numAmount} items. Only ${equip.quantity} available.`);
      return;
    }
    const response = await fetch(`${config.apiUrl}/api/equipment/${equip.id}/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ amount: numAmount }),
    });
    const result = await response.json();
    if (result.success) {
      fetchEquipment();
    } else {
      alert('Failed to open equipment. Please try again.');
    }
  };

  const handleEditClick = (equip) => {
    setEditEquip(equip);
    setEditForm({ name: equip.name, quantity: equip.quantity });
  };

  const handleEditSave = async (e) => {
    e.preventDefault();
    setEditLoading(true);
    try {
      await fetch(`${config.apiUrl}/api/equipment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...editForm,
          id: editEquip.id,
          scheduled_replacement: editEquip.scheduled_replacement,
          last_changed: editEquip.last_changed,
          useful_days: editEquip.useful_days,
        }),
      });
      setEditEquip(null);
      fetchEquipment();
    } finally {
      setEditLoading(false);
    }
  };

  const handleHistoryTab = async () => {
    if (tab === 'history') return;
    setTab('history');
    setHistoryTab(t => ({ ...t, loading: true }));
    try {
      let logs = [];
      for (const equip of equipment) {
        const res = await fetch(`${config.apiUrl}/api/equipment/${equip.id}/history`, { credentials: 'include' });
        const data = await res.json();
        logs = logs.concat(data.map(log => ({ ...log, equipment: equip.name, equipment_id: equip.id })));
      }
      logs.sort((a, b) => new Date(b.changed_at) - new Date(a.changed_at));
      logs = logs.slice(0, 20);
      setHistoryTab(t => ({ ...t, logs, loading: false }));
    } catch {
      setHistoryTab(t => ({ ...t, logs: [], loading: false }));
    }
  };

  const handleEquipmentHistoryFilter = async (equipmentId) => {
    setHistoryTab(t => ({ ...t, selectedEquipment: equipmentId, loading: true }));
    try {
      if (!equipmentId) {
        let logs = [];
        for (const equip of equipment) {
          const res = await fetch(`${config.apiUrl}/api/equipment/${equip.id}/history`, { credentials: 'include' });
          const data = await res.json();
          logs = logs.concat(data.map(log => ({ ...log, equipment: equip.name, equipment_id: equip.id })));
        }
        logs.sort((a, b) => new Date(b.changed_at) - new Date(a.changed_at));
        logs = logs.slice(0, 20);
        setHistoryTab(t => ({ ...t, logs, loading: false }));
      } else {
        const res = await fetch(`${config.apiUrl}/api/equipment/${equipmentId}/history`, { credentials: 'include' });
        const data = await res.json();
        const equipName = equipment.find(e => e.id == equipmentId)?.name || '';
        const logs = data.map(log => ({ ...log, equipment: equipName, equipment_id: equipmentId }));
        setHistoryTab(t => ({ ...t, logs, loading: false }));
      }
    } catch {
      setHistoryTab(t => ({ ...t, logs: [], loading: false }));
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString();
  };

  const formatDateTime = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
  };

  const isDue = (item) => {
    if (!item.scheduled_replacement || !item.due_date) return false;
    return new Date(item.due_date) <= new Date();
  };

  const dueCount = equipment.filter(isDue).length;

  // ===== Status mapping (matches AlertsList pattern) =====
  const STATUS = {
    due:        { color: '#dc3545', bg: 'rgba(220,53,69,0.12)', label: 'Due Now' },
    scheduled:  { color: '#3fb950', bg: 'rgba(63,185,80,0.12)', label: 'On Schedule' },
    consumable: { color: '#6f42c1', bg: 'rgba(111,66,193,0.12)', label: 'Consumable' },
  };
  const getStatus = (equip) => {
    if (!equip.scheduled_replacement) return STATUS.consumable;
    if (isDue(equip)) return STATUS.due;
    return STATUS.scheduled;
  };

  // ===== Reusable tile (matches AlertsList metric tile) =====
  const metricTile = (label, value, accent = 'gray', highlight = false) => {
    const palette = {
      blue:   { bg: 'rgba(96,165,250,0.1)',  border: 'rgba(96,165,250,0.3)', label: '#93c5fd' },
      green:  { bg: 'rgba(72,187,120,0.1)',  border: 'rgba(72,187,120,0.3)', label: '#9ae6b4' },
      red:    { bg: 'rgba(245,101,101,0.1)', border: 'rgba(245,101,101,0.3)', label: '#feb2b2' },
      gray:   { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.1)', label: '#a0aec0' },
    }[accent];
    return (
      <div style={{
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        borderRadius: 8, padding: '8px 12px',
      }}>
        <div style={{
          color: palette.label, fontSize: 11, fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: 0.5,
        }}>{label}</div>
        <div style={{
          color: highlight ? '#feb2b2' : '#e6edf3',
          fontSize: 16, fontWeight: 700, marginTop: 2,
        }}>{value}</div>
      </div>
    );
  };

  // ===== Form helpers (dark inputs) =====
  const inputStyle = {
    width: '100%',
    padding: 10,
    fontSize: 14,
    background: '#2d3748',
    color: '#e6edf3',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 6,
    boxSizing: 'border-box',
    outline: 'none',
  };
  const labelStyle = {
    display: 'block', marginBottom: 6,
    fontWeight: 600, color: '#e6edf3', fontSize: 13,
  };

  const renderContent = () => (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
    }}>
      <div style={{
        flex: 1,
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        paddingBottom: isMobile ? 80 : 16,
      }}>
      {tab === 'history' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Controls */}
          <div style={{
            display: 'flex', alignItems: isMobile ? 'stretch' : 'center',
            flexDirection: isMobile ? 'column' : 'row',
            gap: isMobile ? 8 : 12,
            padding: '12px 14px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8,
          }}>
            <label style={{ fontWeight: 600, color: '#cbd5e0', fontSize: 13 }}>
              Equipment
            </label>
            <select
              value={historyTab.selectedEquipment}
              onChange={e => handleEquipmentHistoryFilter(e.target.value)}
              style={{
                ...inputStyle,
                width: isMobile ? '100%' : 280,
                padding: '8px 12px',
                cursor: 'pointer',
              }}
            >
              <option value="">All Equipment (Last 20)</option>
              {equipment.map(equip => (
                <option key={equip.id} value={equip.id}>{equip.name}</option>
              ))}
            </select>
          </div>

          {historyTab.loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#a0aec0' }}>Loading…</div>
          ) : historyTab.logs.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: 40,
              background: 'rgba(255,255,255,0.04)',
              border: '1px dashed rgba(255,255,255,0.15)',
              borderRadius: 8, color: '#a0aec0', fontStyle: 'italic',
            }}>No history found</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {historyTab.logs.map((log, i) => (
                <div key={i} style={{
                  background: '#1a2332',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderLeft: '4px solid #6c757d',
                  borderRadius: 8,
                  padding: '10px 14px',
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', gap: 12,
                }}>
                  <span style={{ color: '#e6edf3', fontSize: 14, fontWeight: 600 }}>
                    {log.equipment}
                  </span>
                  <span style={{ color: '#a0aec0', fontSize: 12, fontWeight: 500 }}>
                    {formatDateTime(log.changed_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : tab === 'add' ? (
        <div style={{
          background: '#1a2332',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 10,
          padding: 20,
          boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
        }}>
          <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>Name *</label>
              <input
                required
                value={addForm.name}
                onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Enter equipment name"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Quantity *</label>
              <input
                required
                type="number"
                min={1}
                value={addForm.quantity}
                onChange={e => setAddForm(f => ({ ...f, quantity: e.target.value }))}
                placeholder="Enter quantity"
                style={inputStyle}
              />
            </div>

            <label style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '12px 14px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              cursor: 'pointer',
              userSelect: 'none',
            }}>
              <input
                type="checkbox"
                checked={addForm.scheduled_replacement}
                onChange={e => setAddForm(f => ({ ...f, scheduled_replacement: e.target.checked }))}
                style={{ marginTop: 2, width: 18, height: 18, cursor: 'pointer', accentColor: '#3fb950' }}
              />
              <span>
                <span style={{ display: 'block', color: '#e6edf3', fontWeight: 600, fontSize: 14 }}>
                  Has scheduled replacement
                </span>
                <span style={{ color: '#a0aec0', fontSize: 12 }}>
                  Track replacement on a schedule (last-changed + useful days).
                </span>
              </span>
            </label>

            {addForm.scheduled_replacement && (
              <>
                <div>
                  <label style={labelStyle}>Date Last Changed *</label>
                  <input
                    required
                    type="date"
                    value={addForm.last_changed}
                    onChange={e => setAddForm(f => ({ ...f, last_changed: e.target.value }))}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Useful Days *</label>
                  <input
                    required
                    type="number"
                    min={1}
                    value={addForm.useful_days}
                    onChange={e => setAddForm(f => ({ ...f, useful_days: e.target.value }))}
                    placeholder="Enter number of days"
                    style={inputStyle}
                  />
                </div>
              </>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => setTab('list')}
                disabled={addLoading}
                style={{
                  padding: '10px 18px', borderRadius: 6,
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: 'transparent', color: '#e6edf3',
                  cursor: addLoading ? 'not-allowed' : 'pointer',
                  fontSize: 14, fontWeight: 500,
                }}
              >Cancel</button>
              <button
                type="submit"
                disabled={addLoading}
                style={{
                  padding: '10px 18px', borderRadius: 6, border: 'none',
                  background: '#3fb950', color: '#0d1117',
                  cursor: addLoading ? 'not-allowed' : 'pointer',
                  fontSize: 14, fontWeight: 600,
                  opacity: addLoading ? 0.6 : 1,
                }}
              >{addLoading ? 'Adding…' : 'Add Equipment'}</button>
            </div>
          </form>
        </div>
      ) : loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#a0aec0' }}>Loading…</div>
      ) : equipment.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 40,
          background: 'rgba(255,255,255,0.04)',
          border: '1px dashed rgba(255,255,255,0.15)',
          borderRadius: 8, color: '#a0aec0', fontStyle: 'italic',
        }}>No equipment found</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {equipment.map(equip => {
            const status = getStatus(equip);
            const due = isDue(equip);
            return (
              <div
                key={equip.id}
                style={{
                  position: 'relative',
                  background: '#1a2332',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderLeft: `5px solid ${status.color}`,
                  borderRadius: 10,
                  padding: '14px 16px',
                  display: 'flex', flexDirection: 'column', gap: 12,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
                }}
              >
                {/* Top row: name + status pill */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', flexWrap: 'wrap', gap: 8,
                }}>
                  <h4 style={{ margin: 0, color: '#e6edf3', fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>
                    {equip.name}
                  </h4>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '4px 10px', borderRadius: 12,
                    background: status.bg, color: status.color,
                    fontSize: 12, fontWeight: 700,
                    border: `1px solid ${status.color}40`,
                  }}>{status.label}</span>
                </div>

                {/* Metric grid */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                  gap: 10,
                }}>
                  {metricTile('On Hand', equip.quantity, 'blue')}
                  {equip.scheduled_replacement && (
                    <>
                      {metricTile('Due Next', formatDate(equip.due_date), due ? 'red' : 'green', due)}
                      {metricTile('Last Changed', formatDate(equip.last_changed), 'gray')}
                      {metricTile('Useful Days', equip.useful_days || '—', 'gray')}
                    </>
                  )}
                </div>

                {/* Actions */}
                <div style={{
                  display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap',
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                  paddingTop: 10,
                }}>
                  <button
                    onClick={() => handleEditClick(equip)}
                    style={{
                      padding: '7px 14px', borderRadius: 6,
                      border: '1px solid rgba(255,255,255,0.15)',
                      background: 'transparent', color: '#e6edf3',
                      cursor: 'pointer', fontSize: 13, fontWeight: 500,
                    }}
                  >Edit</button>
                  <button
                    onClick={() => handleReceive(equip)}
                    style={{
                      padding: '7px 14px', borderRadius: 6, border: 'none',
                      background: '#3fb950', color: '#0d1117',
                      cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    }}
                  >Receive</button>
                  {equip.scheduled_replacement ? (
                    <button
                      onClick={() => handleChangeClick(equip)}
                      style={{
                        padding: '7px 14px', borderRadius: 6, border: 'none',
                        background: due ? '#dc3545' : '#3b82f6',
                        color: '#fff',
                        cursor: 'pointer', fontSize: 13, fontWeight: 600,
                      }}
                    >{due ? 'Change Now' : 'Change'}</button>
                  ) : (
                    <button
                      onClick={() => handleOpen(equip)}
                      style={{
                        padding: '7px 14px', borderRadius: 6, border: 'none',
                        background: '#6f42c1', color: '#fff',
                        cursor: 'pointer', fontSize: 13, fontWeight: 600,
                      }}
                    >Open</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      </div>

      {/* Edit Modal */}
      {editEquip && (
        <div
          onClick={() => setEditEquip(null)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1060,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#1a2332',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12, padding: 24,
              maxWidth: 440, width: '90%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
              color: '#e6edf3',
            }}
          >
            <h3 style={{
              margin: '0 0 16px 0', fontSize: 18, fontWeight: 700,
              paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.08)',
            }}>Edit Equipment</h3>
            <form onSubmit={handleEditSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Name</label>
                <input
                  value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Quantity</label>
                <input
                  type="number"
                  min={1}
                  value={editForm.quantity}
                  onChange={e => setEditForm(f => ({ ...f, quantity: e.target.value }))}
                  style={inputStyle}
                />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => setEditEquip(null)}
                  style={{
                    padding: '9px 18px', borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.15)',
                    background: 'transparent', color: '#e6edf3',
                    cursor: 'pointer', fontSize: 14, fontWeight: 500,
                  }}
                >Cancel</button>
                <button
                  type="submit"
                  disabled={editLoading}
                  style={{
                    padding: '9px 18px', borderRadius: 6, border: 'none',
                    background: '#3b82f6', color: '#fff',
                    cursor: editLoading ? 'not-allowed' : 'pointer',
                    fontSize: 14, fontWeight: 600,
                    opacity: editLoading ? 0.6 : 1,
                  }}
                >{editLoading ? 'Saving…' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Change Modal */}
      {showConfirm && (
        <div
          onClick={() => setShowConfirm(false)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1060,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#1a2332',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12, padding: 24,
              maxWidth: 420, width: '90%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
              color: '#e6edf3',
            }}
          >
            <h3 style={{
              margin: '0 0 12px 0', fontSize: 18, fontWeight: 700,
              paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.08)',
            }}>Confirm Change</h3>
            <p style={{ margin: '12px 0 20px 0', color: '#cbd5e0', fontSize: 14, lineHeight: 1.4 }}>
              Mark <strong style={{ color: '#e6edf3' }}>{selectedEquip?.name}</strong> as changed?
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowConfirm(false)}
                style={{
                  padding: '9px 18px', borderRadius: 6,
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: 'transparent', color: '#e6edf3',
                  cursor: 'pointer', fontSize: 14, fontWeight: 500,
                }}
              >Cancel</button>
              <button
                onClick={handleConfirmChange}
                style={{
                  padding: '9px 18px', borderRadius: 6, border: 'none',
                  background: '#3fb950', color: '#0d1117',
                  cursor: 'pointer', fontSize: 14, fontWeight: 600,
                }}
              >Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (noModal) {
    return (
      <div className="equipment-tracker-inner" style={{ height: '100%', width: '100%' }}>
        {renderContent()}
      </div>
    );
  }

  return (
    <ModalBase isOpen={isOpen} onClose={onClose} title={
      isMobile ? (
        <div style={{ display: 'flex', gap: 8, width: '100%', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
            <select
              value={tab === 'add' ? 'list' : tab}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'history') handleHistoryTab();
                else setTab(v);
              }}
              style={{
                width: '100%',
                padding: '12px 16px',
                fontSize: 15, fontWeight: 600,
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                backgroundColor: '#1a2332', color: '#fff',
                cursor: 'pointer', outline: 'none',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                WebkitAppearance: 'none', MozAppearance: 'none', appearance: 'none',
                backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'white\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3e%3cpolyline points=\'6 9 12 15 18 9\'%3e%3c/polyline%3e%3c/svg%3e")',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 12px center',
                backgroundSize: 20,
                paddingRight: dueCount > 0 && tab !== 'history' ? 76 : 40,
              }}
            >
              <option value="list" style={{ backgroundColor: '#1a2332', color: '#fff' }}>
                Equipment List{dueCount > 0 ? ` (${dueCount} due)` : ''}
              </option>
              <option value="history" style={{ backgroundColor: '#1a2332', color: '#fff' }}>History</option>
            </select>
            {dueCount > 0 && tab !== 'history' && (
              <span style={{
                position: 'absolute', right: 36, top: '50%', transform: 'translateY(-50%)',
                background: '#dc3545', color: '#fff',
                borderRadius: 12, padding: '2px 8px',
                fontSize: 11, fontWeight: 700,
                pointerEvents: 'none',
              }}>{dueCount}</span>
            )}
          </div>
          <button
            onClick={() => setTab('add')}
            style={{
              padding: '12px 18px', border: 'none', borderRadius: 8,
              background: tab === 'add' ? '#2d8f3f' : '#3fb950',
              color: '#0d1117',
              cursor: 'pointer', fontSize: 15, fontWeight: 700,
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              flexShrink: 0,
            }}
          >+ Add</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setTab('list')}
            style={{
              padding: '8px 16px', border: 'none', borderRadius: 6,
              backgroundColor: tab === 'list' ? '#3b82f6' : '#f8f9fa',
              color: tab === 'list' ? '#fff' : '#333',
              cursor: 'pointer', fontWeight: 500, fontSize: 14,
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            Equipment List
            {dueCount > 0 && (
              <span style={{
                backgroundColor: '#dc3545', color: '#fff',
                borderRadius: 12, padding: '2px 8px',
                fontSize: 12, fontWeight: 700,
              }}>{dueCount} To Do</span>
            )}
          </button>
          <button
            onClick={handleHistoryTab}
            style={{
              padding: '8px 16px', border: 'none', borderRadius: 6,
              backgroundColor: tab === 'history' ? '#3b82f6' : '#f8f9fa',
              color: tab === 'history' ? '#fff' : '#333',
              cursor: 'pointer', fontWeight: 500, fontSize: 14,
            }}
          >History</button>
          <button
            onClick={() => setTab('add')}
            style={{
              padding: '8px 16px', border: 'none', borderRadius: 6,
              backgroundColor: '#3fb950', color: '#0d1117',
              cursor: 'pointer', fontWeight: 600, fontSize: 14,
            }}
          >Add Equipment</button>
        </div>
      )
    }>
      {renderContent()}
    </ModalBase>
  );
}
