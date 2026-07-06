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
// Supplies on hand: a plain-language view of what's in the house, driven by
// Equipment quantities that confirmed deliveries keep up to date.
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import { EquipmentIcon, AlertIcon, CheckIcon } from '../../components/Icons';
import { Alert } from '@/components/ui/alert';
import { shipmentService } from '../../services/shipments';
import './AdminV2.css';

const STATUS_META = {
  reorder: { label: 'Time to reorder', badge: 'admin-v2-badge-danger', order: 0 },
  low: { label: 'Running low', badge: 'admin-v2-badge-warning', order: 1 },
  ok: { label: 'Stocked', badge: 'admin-v2-badge-success', order: 2 },
};

const AdminV2Inventory = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    patients,
    selectedPatient: contextPatient,
    selectPatient: setContextPatient,
    loadingPatients,
  } = useAdminPatient();

  const selectedPatient = contextPatient;

  const [inventory, setInventory] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Patient context <-> URL sync (standard admin-v2 pattern)
  useEffect(() => {
    const patientId = searchParams.get('patient');
    if (patientId && patients.length > 0) {
      const patient = patients.find((p) => p.id === parseInt(patientId));
      if (patient && patient.id !== contextPatient?.id) {
        setContextPatient(patient);
      }
    }
  }, [searchParams, patients]);

  useEffect(() => {
    if (contextPatient && searchParams.get('patient') !== String(contextPatient.id)) {
      setSearchParams({ patient: contextPatient.id });
    }
  }, [contextPatient]);

  useEffect(() => {
    if (!selectedPatient) return;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await shipmentService.getInventory(selectedPatient.id);
        setInventory(data.inventory || []);
        setCounts(data.counts || {});
      } catch (err) {
        setError(err.message || 'Failed to load supplies');
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedPatient]);

  const sorted = [...inventory].sort(
    (a, b) => (STATUS_META[a.status]?.order ?? 3) - (STATUS_META[b.status]?.order ?? 3)
      || (a.name || '').localeCompare(b.name || '')
  );

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
            <div className="admin-v2-summary-stats">
              <div className="admin-v2-stat-card">
                <div className="admin-v2-stat-icon" style={{ background: 'rgba(248, 81, 73, 0.15)' }}>
                  <AlertIcon size={20} />
                </div>
                <div className="admin-v2-stat-info">
                  <h4>{counts.reorder || 0}</h4>
                  <p>Time to reorder</p>
                </div>
              </div>
              <div className="admin-v2-stat-card">
                <div className="admin-v2-stat-icon" style={{ background: 'rgba(187, 128, 9, 0.15)' }}>
                  <EquipmentIcon size={20} />
                </div>
                <div className="admin-v2-stat-info">
                  <h4>{counts.low || 0}</h4>
                  <p>Running low</p>
                </div>
              </div>
              <div className="admin-v2-stat-card">
                <div className="admin-v2-stat-icon" style={{ background: 'rgba(63, 185, 80, 0.15)' }}>
                  <CheckIcon size={20} />
                </div>
                <div className="admin-v2-stat-info">
                  <h4>{counts.ok || 0}</h4>
                  <p>Stocked</p>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="admin-v2-loading">Checking supplies...</div>
            ) : error ? (
              <div className="tw"><Alert variant="destructive">{error}</Alert></div>
            ) : sorted.length === 0 ? (
              <div className="admin-v2-empty-state">
                <EquipmentIcon size={48} />
                <h3>No supplies tracked yet</h3>
                <p className="admin-v2-text-muted">
                  Supplies show up here once equipment items are set up and deliveries are confirmed.
                </p>
              </div>
            ) : (
              <div className="admin-v2-table-container admin-v2-table-cards-wrap">
                <table className="admin-v2-table admin-v2-table-cards">
                  <thead>
                    <tr>
                      <th>Supply</th>
                      <th style={{ textAlign: 'center' }}>On hand</th>
                      <th style={{ textAlign: 'center' }}>Target</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((item) => {
                      const meta = STATUS_META[item.status] || STATUS_META.ok;
                      return (
                        <tr key={item.equipment_id}>
                          <td className="admin-v2-cell-name">
                            <strong>{item.name}</strong>
                            {item.item_number && (
                              <div className="admin-v2-text-muted">#{item.item_number}</div>
                            )}
                          </td>
                          <td data-label="On hand" style={{ textAlign: 'center' }}>
                            {item.quantity}
                            {item.unit_description && (
                              <div className="admin-v2-text-small">{item.unit_description}</div>
                            )}
                          </td>
                          <td data-label="Target" style={{ textAlign: 'center' }}>
                            {item.par_level ?? '-'}
                          </td>
                          <td data-label="Status">
                            <span className={`admin-v2-badge ${meta.badge}`}>{meta.label}</span>
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
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Inventory;
