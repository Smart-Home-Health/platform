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
import React, { useEffect, useState, useMemo, useRef } from "react";
import config from '../config';
import ModalBase from './ModalBase';
import SimpleEventChart from './SimpleEventChart';
import RecordVitalsForm from './vitals/RecordVitalsForm';
import { useAdminPatient } from '../contexts/AdminPatientContext';
import { formatVitalDisplayName } from '../utils/vitals';
import { Button } from '@/components/ui/button';
import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';
// Pull in admin styling so we can use .admin-v2-table on the history table.
import '../pages/admin-v2/AdminV2.css';

// Specialized chart component for bathroom history with multiple groups
const BathroomHistoryChart = ({ data, title }) => {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  useEffect(() => {
    if (!data || data.length === 0 || !chartRef.current) {
      return;
    }

    // Destroy existing chart
    if (chartInstance.current) {
      chartInstance.current.destroy();
      chartInstance.current = null;
    }

    const ctx = chartRef.current.getContext('2d');
    const css = (token, fb) => {
      const el = document.querySelector('.dashboard-wrapper') || document.documentElement;
      return getComputedStyle(el).getPropertyValue(token).trim() || fb;
    };

    chartInstance.current = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: data
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              color: css('--dash-text', '#e6edf3'),
              usePointStyle: true
            }
          },
          title: {
            display: true,
            text: title,
            color: css('--dash-text', '#e6edf3'),
            font: {
              size: 16
            }
          }
        },
        scales: {
          x: {
            type: 'time',
            time: {
              displayFormats: {
                day: 'MMM dd',
                hour: 'MMM dd HH:mm'
              },
              unit: 'day'
            },
            title: {
              display: true,
              text: 'Date',
              color: css('--dash-text-muted', '#8b949e')
            },
            ticks: {
              color: css('--dash-text-muted', '#8b949e'),
              maxTicksLimit: 8,
              maxRotation: 45,
              minRotation: 0
            },
            grid: {
              color: css('--dash-border', '#444')
            }
          },
          y: {
            type: 'category',
            labels: ['Extra Large', 'Large', 'Medium', 'Small', 'Smear'],
            title: {
              display: true,
              text: 'Size',
              color: css('--dash-text-muted', '#8b949e')
            },
            ticks: {
              color: css('--dash-text-muted', '#8b949e')
            },
            grid: {
              color: css('--dash-border', '#444')
            }
          }
        },
        interaction: {
          intersect: false,
          mode: 'nearest'
        }
      }
    });

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [data, title]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <canvas ref={chartRef} />
    </div>
  );
};

const HistoryModal = ({ onClose }) => {
  const { selectedPatient } = useAdminPatient();
  const [vitalTypes, setVitalTypes] = useState([]);
  const [selectedType, setSelectedType] = useState(null);
  const [records, setRecords] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('graphs');
  const [showAddVitals, setShowAddVitals] = useState(false);

  const handleCloseVitals = () => setShowAddVitals(false);

  // After a successful save, refresh the currently-selected vital's history
  // so the new entry shows up in the table/chart without re-opening the modal.
  const refreshAfterSave = () => {
    if (!selectedType || !selectedPatient) return;
    fetch(
      `${config.apiUrl}/api/vitals/patient/${selectedPatient.id}?vital_type=${selectedType}&limit=${pageSize}`,
      { credentials: 'include' }
    )
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        const records = Array.isArray(data) ? data : (data.records || []);
        setRecords(records.map(r => ({
          datetime: r.datetime || r.timestamp,
          value: r.value, notes: r.notes, vital_group: r.vital_group, ...r,
        })));
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetch(`${config.apiUrl}/api/vitals/types`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => setVitalTypes(data))
      .catch(() => setVitalTypes([]));
  }, []);

  useEffect(() => {
    if (selectedType && selectedPatient) {
      setLoading(true);
      fetch(`${config.apiUrl}/api/vitals/patient/${selectedPatient.id}?vital_type=${selectedType}&limit=${pageSize}`, {
        credentials: 'include'
      })
        .then((res) => res.json())
        .then((data) => {
          // Patient vitals endpoint returns array directly
          const records = Array.isArray(data) ? data : (data.records || []);
          setRecords(records.map(r => ({
            datetime: r.datetime || r.timestamp,
            value: r.value,
            notes: r.notes,
            vital_group: r.vital_group,
            ...r
          })));
          setTotalPages(1);
          setLoading(false);
        })
        .catch(() => {
          setRecords([]);
          setTotalPages(1);
          setLoading(false);
        });
    }
  }, [selectedType, page, pageSize, selectedPatient?.id]);

  const handleTypeSelect = (type) => {
    setSelectedType(type);
    setPage(1);
  };

  const handlePrev = () => {
    if (page > 1) setPage(page - 1);
  };
  const handleNext = () => {
    if (page < totalPages) setPage(page + 1);
  };

  // Bathroom size mapping for display
  const getBathroomSizeDisplay = (value, vitalGroup) => {
    console.log('getBathroomSizeDisplay called with:', { value, vitalGroup, type: typeof value });
    
    // Check if this is a bathroom-related group (any bathroom type, not just 'bathroom')
    const bathroomGroups = ['bathroom', 'mix', 'wet', 'dry', 'solid', 'liquid'];
    const isBathroomGroup = vitalGroup && bathroomGroups.includes(vitalGroup.toLowerCase());
    
    if (isBathroomGroup && value !== null && value !== undefined && typeof value === 'number') {
      const sizeMap = {
        0: 'Smear',
        1: 'Small',
        2: 'Medium', 
        3: 'Large',
        4: 'Extra Large'
      };
      const result = sizeMap[value] || value;
      console.log('Mapping result:', result);
      return result;
    }
    return value;
  };

  // Group display formatting
  const getGroupDisplay = (vitalGroup) => {
    if (!vitalGroup) return '-';
    return vitalGroup.charAt(0).toUpperCase() + vitalGroup.slice(1);
  };

  // Type-aware value formatter for the table. Bathroom rows already had a
  // dedicated mapping; BP and temperature need to surface their multi-value
  // shape (systolic/diastolic/map; body/skin) instead of the empty `value`.
  const formatValueCell = (rec) => {
    if (selectedType === 'blood_pressure') {
      const s = rec.systolic ?? rec.value?.systolic;
      const d = rec.diastolic ?? rec.value?.diastolic;
      const m = rec.map ?? rec.value?.map;
      if (s != null && d != null) {
        return m != null ? `${s}/${d} (MAP ${m})` : `${s}/${d}`;
      }
      return m != null ? `MAP ${m}` : '-';
    }
    if (selectedType === 'temperature') {
      const body = rec.body ?? rec.value;
      const skin = rec.skin;
      if (body != null && skin != null) return `Body ${body}° · Skin ${skin}°`;
      if (body != null) return `${body}°`;
      return '-';
    }
    return getBathroomSizeDisplay(rec.value, rec.vital_group);
  };

  // Prepare chart data based on vital type
  const chartData = useMemo(() => {
    if (!records || records.length === 0) return [];
    
    // Check if this is a bathroom-related vital type
    const isBathroomType = selectedType && selectedType.toLowerCase().includes('bathroom');
    
    if (isBathroomType) {
      // For bathroom types, group by vital_group and create separate datasets
      const groupedData = {};
      const bathroomGroups = ['bathroom', 'mix', 'wet', 'dry', 'solid', 'liquid'];
      
      records.forEach(record => {
        const group = record.vital_group || 'unknown';
        if (!groupedData[group]) {
          groupedData[group] = [];
        }
        
        // Convert numeric bathroom values to English labels for Y-axis
        let yValue = record.value;
        if (typeof record.value === 'number' && bathroomGroups.includes(group.toLowerCase())) {
          const sizeMap = { 0: 'Smear', 1: 'Small', 2: 'Medium', 3: 'Large', 4: 'Extra Large' };
          yValue = sizeMap[record.value] || record.value;
        }
        
        groupedData[group].push({
          x: new Date(record.datetime),
          y: yValue
        });
      });
      
      // Convert to datasets with different colors for each group
      const colors = {
        'mix': '#8B4513',      // Brown
        'wet': '#4169E1',      // Royal Blue  
        'dry': '#DAA520',      // Goldenrod
        'solid': '#8B4513',    // Brown
        'liquid': '#4169E1',   // Royal Blue
        'bathroom': '#6B46C1', // Purple
        'unknown': '#6B7280'   // Gray
      };
      
      return Object.entries(groupedData).map(([group, data]) => ({
        label: getGroupDisplay(group),
        data: data,
        borderColor: colors[group.toLowerCase()] || '#6B7280',
        backgroundColor: colors[group.toLowerCase()] || '#6B7280',
        fill: false
      }));
    } else {
      // For non-bathroom types, simple single dataset. Multi-value vitals
      // (blood_pressure carries systolic/diastolic/map; temperature can
      // carry body/skin) flatten down to one scalar y for the line chart.
      const yFor = (r) => {
        if (selectedType === 'blood_pressure') {
          // Prefer stored MAP; otherwise compute from S/D.
          if (r.map != null) return r.map;
          if (r.systolic != null && r.diastolic != null) {
            return Math.round(r.diastolic + (r.systolic - r.diastolic) / 3);
          }
          if (r.value && typeof r.value === 'object') {
            return r.value.map ?? null;
          }
          return r.value ?? null;
        }
        if (selectedType === 'temperature') {
          return r.body ?? r.value ?? null;
        }
        return r.value ?? null;
      };

      return [{
        label: selectedType,
        data: records
          .map(record => ({ x: new Date(record.datetime), y: yFor(record) }))
          .filter(p => p.y != null && !Number.isNaN(p.y)),
        borderColor: '#58a6ff',
        backgroundColor: '#58a6ff',
        fill: false
      }];
    }
  }, [records, selectedType]);

  return (
    <ModalBase isOpen={true} onClose={onClose} title={
      <div className="tw flex w-full items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={activeTab === 'graphs' ? 'default' : 'secondary'}
            onClick={() => { setActiveTab('graphs'); setShowAddVitals(false); }}
          >Graphs</Button>
          <Button
            size="sm"
            variant={activeTab === 'reports' ? 'default' : 'secondary'}
            onClick={() => { setActiveTab('reports'); setShowAddVitals(false); }}
          >Reports</Button>
        </div>
        <Button size="sm" onClick={() => setShowAddVitals(true)}>+ Add Vitals</Button>
      </div>
    }>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {showAddVitals ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="tw" style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button variant="secondary" size="sm" onClick={handleCloseVitals}>← Back to History</Button>
              </div>
              <RecordVitalsForm
                patientId={selectedPatient?.id}
                onSaved={() => { refreshAfterSave(); }}
              />
            </div>
          ) : (
            <>
              {activeTab === 'graphs' && (
            <div style={{ 
              backgroundColor: 'var(--dash-surface)', 
              borderRadius: '12px', 
              padding: '16px',
              border: '1px solid var(--dash-border-strong)',
              height: '100%'
            }}>
              <div className="tw" style={{ marginBottom: '20px' }}>
                <div className="flex flex-wrap gap-2">
                  {vitalTypes.map((type) => (
                    <Button
                      key={type}
                      size="sm"
                      variant={type === selectedType ? 'default' : 'secondary'}
                      onClick={() => handleTypeSelect(type)}
                    >
                      {formatVitalDisplayName(type)}
                    </Button>
                  ))}
                </div>
              </div>
              {selectedType && (
                <>
                  <div className="chart-container" style={{ 
                    height: 300, 
                    margin: "20px 0",
                    background: "var(--dash-bg)",
                    borderRadius: "8px",
                    padding: "10px"
                  }}>
              {records.length > 0 ? (
                selectedType.toLowerCase().includes('bathroom') ? (
                  <BathroomHistoryChart data={chartData} title={`${formatVitalDisplayName(selectedType)} History`} />
                ) : (
                  <SimpleEventChart
                    title={`${formatVitalDisplayName(selectedType)} History`}
                    color="#58a6ff"
                    unit=""
                    data={chartData[0]?.data || []}
                    xType="time"
                  />
                )
              ) : (
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  color: "var(--dash-text-muted)"
                }}>
                  <p style={{ textAlign: "center", margin: 0 }}>
                    No data available to chart for <b>{formatVitalDisplayName(selectedType)}</b>
                  </p>
                </div>
              )}
            </div>
            <div className="history-table">
              {loading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--dash-text-muted)' }}>
                  <div style={{ fontSize: '16px' }}>Loading...</div>
                </div>
              ) : (
                <div className="admin-v2-table-container">
                  <table className="admin-v2-table">
                    <thead>
                      <tr>
                        <th>Timestamp</th>
                        <th>Group</th>
                        <th>Value</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.length === 0 ? (
                        <tr>
                          <td colSpan={4} style={{ textAlign: 'center', fontStyle: 'italic', color: 'var(--dash-text-muted)' }}>
                            No data available for {formatVitalDisplayName(selectedType)}
                          </td>
                        </tr>
                      ) : (
                        records.map((rec, idx) => (
                          <tr key={idx}>
                            <td>{new Date(rec.datetime).toLocaleString()}</td>
                            <td>{getGroupDisplay(rec.vital_group)}</td>
                            <td style={{ fontWeight: 500 }}>{formatValueCell(rec)}</td>
                            <td style={{ color: rec.notes ? 'var(--dash-text)' : 'var(--dash-text-dim)', fontStyle: rec.notes ? 'normal' : 'italic' }}>
                              {rec.notes || 'No notes'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="tw pagination-controls" style={{
                marginTop: 16,
                display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12,
                padding: 12,
              }}>
                <Button variant="secondary" size="sm" onClick={handlePrev} disabled={page === 1}>← Previous</Button>
                <span style={{ color: 'var(--dash-text-muted)', fontSize: 13, fontWeight: 500 }}>
                  Page {page} of {totalPages}
                </span>
                <Button variant="secondary" size="sm" onClick={handleNext} disabled={page === totalPages}>Next →</Button>
              </div>
            </div>
              </>
              )}
            </div>
          )}
          {activeTab === 'reports' && (
            <div style={{ 
              backgroundColor: 'var(--dash-surface)', 
              borderRadius: '12px', 
              padding: '16px',
              border: '1px solid var(--dash-border-strong)',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <div style={{ textAlign: 'center', color: 'var(--dash-text-muted)' }}>
                <h3 style={{ color: 'var(--dash-text)', marginBottom: '16px' }}>Reports</h3>
                <p>Reports functionality coming soon...</p>
              </div>
            </div>
          )}
            </>
          )}
        </div>
      </div>
    </ModalBase>
  );
};

export default HistoryModal;
