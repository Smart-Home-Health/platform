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
import { useState, useEffect } from 'react';
import config from '../config';
import ModalBase from './ModalBase';
import EquipmentRestockGate from './EquipmentRestockGate';
import { formatDateOnly } from '../utils/timezone';
import { useAdminPatient } from '../contexts/AdminPatientContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';

export default function EquipmentModal({ isOpen, onClose, noModal, equipmentDueCount }) {
  const { selectedPatient } = useAdminPatient();
  const [tab, setTab] = useState('list');
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [selectedEquip, setSelectedEquip] = useState(null);
  const [restockInfo, setRestockInfo] = useState(null);
  const [historyTab, setHistoryTab] = useState({ filter: '', logs: [], loading: false, selectedEquipment: '' });
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

  const handleChangeClick = (equip) => {
    setSelectedEquip(equip);
    setShowConfirm(true);
  };

  // Core change request. A 409 out-of-stock opens the restock gate, which
  // retries this once the on-hand quantity has been updated.
  const doChange = async (equipId) => {
    const response = await fetch(`${config.apiUrl}/api/equipment/${equipId}/change`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ changed_at: new Date().toISOString() }),
    });
    if (response.ok) {
      setRestockInfo(null);
      setSelectedEquip(null);
      fetchEquipment();
    } else {
      const data = await response.json().catch(() => ({}));
      if (response.status === 409 && data.error === 'insufficient_quantity') {
        setRestockInfo(data);
      } else {
        alert('Failed to mark equipment as changed.');
      }
    }
  };

  const handleConfirmChange = () => {
    setShowConfirm(false);
    if (!selectedEquip) return;
    doChange(selectedEquip.id);
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
    return formatDateOnly(dateString) || '—';
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
          <div className="tw" style={{
            display: 'flex', alignItems: isMobile ? 'stretch' : 'center',
            flexDirection: isMobile ? 'column' : 'row',
            gap: isMobile ? 8 : 12,
            padding: '12px 14px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8,
          }}>
            <Label className="text-[#cbd5e0]">Equipment</Label>
            <Select
              value={historyTab.selectedEquipment || '__all__'}
              onValueChange={(v) => handleEquipmentHistoryFilter(v === '__all__' ? '' : v)}
            >
              <SelectTrigger className={isMobile ? 'w-full' : 'w-[280px]'}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Equipment (Last 20)</SelectItem>
                {equipment.map(equip => (
                  <SelectItem key={equip.id} value={String(equip.id)}>{equip.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                <div className="tw" style={{
                  display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap',
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                  paddingTop: 10,
                }}>
                  <Button size="sm" onClick={() => handleReceive(equip)}>Receive</Button>
                  {equip.scheduled_replacement ? (
                    due ? (
                      <Button size="sm" variant="destructive" onClick={() => handleChangeClick(equip)}>Change Now</Button>
                    ) : (
                      <Button size="sm" className="bg-[#3b82f6] text-white hover:bg-[#3b82f6]/90" onClick={() => handleChangeClick(equip)}>Change</Button>
                    )
                  ) : (
                    <Button size="sm" className="bg-[#6f42c1] text-white hover:bg-[#6f42c1]/90" onClick={() => handleOpen(equip)}>Open</Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      </div>

      {/* Confirm Change Modal */}
      <Dialog open={showConfirm} onOpenChange={(o) => { if (!o) setShowConfirm(false); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Confirm Change</DialogTitle>
            <DialogDescription>
              Mark <strong className="text-foreground">{selectedEquip?.name}</strong> as changed?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowConfirm(false)}>Cancel</Button>
            <Button onClick={handleConfirmChange}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EquipmentRestockGate
        info={restockInfo}
        onClose={() => setRestockInfo(null)}
        onUpdated={() => doChange(restockInfo.equipment_id)}
      />
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
        <div className="tw flex w-full items-center gap-2">
          <Select
            value={tab === 'history' ? 'history' : 'list'}
            onValueChange={(v) => { if (v === 'history') handleHistoryTab(); else setTab(v); }}
          >
            <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="list">Equipment List{dueCount > 0 ? ` (${dueCount} due)` : ''}</SelectItem>
              <SelectItem value="history">History</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="tw flex items-center gap-2">
          <Button size="sm" variant={tab === 'list' ? 'default' : 'secondary'} onClick={() => setTab('list')}>
            Equipment List
            {dueCount > 0 && <Badge variant="danger" className="ml-1.5">{dueCount} To Do</Badge>}
          </Button>
          <Button size="sm" variant={tab === 'history' ? 'default' : 'secondary'} onClick={handleHistoryTab}>History</Button>
        </div>
      )
    }>
      {renderContent()}
    </ModalBase>
  );
}
