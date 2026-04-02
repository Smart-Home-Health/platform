import React, { useEffect, useState, useMemo, useRef } from "react";
import config from '../config';
import ModalBase from './ModalBase';
import SimpleEventChart from './SimpleEventChart';
import VitalsForm from './history/VitalsForm';
import { useAdminPatient } from '../contexts/AdminPatientContext';
import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';

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
              color: '#fff',
              usePointStyle: true
            }
          },
          title: {
            display: true,
            text: title,
            color: '#fff',
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
              color: '#ccc'
            },
            ticks: {
              color: '#ccc',
              maxTicksLimit: 8,
              maxRotation: 45,
              minRotation: 0
            },
            grid: {
              color: '#444'
            }
          },
          y: {
            type: 'category',
            labels: ['Extra Large', 'Large', 'Medium', 'Small', 'Smear'],
            title: {
              display: true,
              text: 'Size',
              color: '#ccc'
            },
            ticks: {
              color: '#ccc'
            },
            grid: {
              color: '#444'
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

  const handleVitalsSubmit = (vitalsData) => {
    // Handle vitals submission here
    console.log('Vitals data:', vitalsData);
    setShowAddVitals(false);
  };

  const handleCloseVitals = () => {
    setShowAddVitals(false);
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
      // For non-bathroom types, simple single dataset
      return [{
        label: selectedType,
        data: records.map(record => ({
          x: new Date(record.datetime),
          y: record.value
        })),
        borderColor: '#007bff',
        backgroundColor: '#007bff',
        fill: false
      }];
    }
  }, [records, selectedType]);

  return (
    <ModalBase isOpen={true} onClose={onClose} title={
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => {
                setActiveTab('graphs');
                setShowAddVitals(false);
              }}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: activeTab === 'graphs' ? '#007bff' : '#f8f9fa',
                color: activeTab === 'graphs' ? '#fff' : '#333',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '14px'
              }}
            >
              Graphs
            </button>
            {/* Placeholder for future tab */}
            <button
              onClick={() => {
                setActiveTab('reports');
                setShowAddVitals(false);
              }}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: activeTab === 'reports' ? '#007bff' : '#f8f9fa',
                color: activeTab === 'reports' ? '#fff' : '#333',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '14px'
              }}
            >
              Reports
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px', marginLeft: '24px' }}>
          <button
            onClick={() => setShowAddVitals(true)}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '6px',
              backgroundColor: '#28a745',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: '500',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            + Add Vitals
          </button>
        </div>
      </div>
    }>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {showAddVitals ? (
            <VitalsForm 
              onSave={handleVitalsSubmit}
              onClose={handleCloseVitals}
            />
          ) : (
            <>
              {activeTab === 'graphs' && (
            <div style={{ 
              backgroundColor: 'rgba(30,32,40,0.95)', 
              borderRadius: '12px', 
              padding: '16px',
              border: '1px solid #4a5568',
              height: '100%'
            }}>
              <div className="vital-type-buttons" style={{ 
                display: 'flex', 
                gap: '10px', 
                marginBottom: '20px',
                flexWrap: 'wrap'
              }}>
                {vitalTypes.map((type) => (
                  <button
                    key={type}
                    className={type === selectedType ? "active" : ""}
                    onClick={() => handleTypeSelect(type)}
                    style={{
                      padding: '8px 16px',
                      border: '1px solid #ccc',
                      borderRadius: '4px',
                      backgroundColor: type === selectedType ? '#007bff' : '#f8f9fa',
                      color: type === selectedType ? '#fff' : '#333',
                      cursor: 'pointer',
                      textTransform: 'capitalize'
                    }}
                  >
                    {type}
                  </button>
                ))}
              </div>
              {selectedType && (
                <>
                  <div className="chart-container" style={{ 
                    height: 300, 
                    margin: "20px 0",
                    background: "#161e2e",
                    borderRadius: "8px",
                    padding: "10px"
                  }}>
              {records.length > 0 ? (
                selectedType.toLowerCase().includes('bathroom') ? (
                  <BathroomHistoryChart data={chartData} title={`${selectedType} History`} />
                ) : (
                  <SimpleEventChart
                    title={`${selectedType} History`}
                    color="#007bff"
                    unit=""
                    data={chartData[0]?.data || []}
                  />
                )
              ) : (
                <div style={{ 
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  color: "#ccc"
                }}>
                  <p style={{ textAlign: "center", margin: 0 }}>
                    No data available to chart for <b>{selectedType}</b>
                  </p>
                </div>
              )}
            </div>
            <div className="history-table">
              {loading ? (
                <div style={{ 
                  textAlign: 'center', 
                  padding: '40px',
                  color: '#007bff' 
                }}>
                  <div style={{ fontSize: '16px' }}>Loading...</div>
                </div>
              ) : (
                <div style={{
                  backgroundColor: '#fff',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                }}>
                  <table style={{ 
                    width: '100%', 
                    borderCollapse: 'collapse',
                    backgroundColor: '#fff'
                  }}>
                    <thead>
                      <tr style={{ backgroundColor: '#007bff' }}>
                        <th style={{ 
                          padding: '16px', 
                          color: '#fff', 
                          textAlign: 'left',
                          fontWeight: '600',
                          fontSize: '14px'
                        }}>
                          Timestamp
                        </th>
                        <th style={{ 
                          padding: '16px', 
                          color: '#fff', 
                          textAlign: 'left',
                          fontWeight: '600',
                          fontSize: '14px'
                        }}>
                          Group
                        </th>
                        <th style={{ 
                          padding: '16px', 
                          color: '#fff', 
                          textAlign: 'left',
                          fontWeight: '600',
                          fontSize: '14px'
                        }}>
                          Value
                        </th>
                        <th style={{ 
                          padding: '16px', 
                          color: '#fff', 
                          textAlign: 'left',
                          fontWeight: '600',
                          fontSize: '14px'
                        }}>
                          Notes
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.length === 0 ? (
                        <tr>
                          <td colSpan={4} style={{ 
                            textAlign: "center", 
                            padding: '40px',
                            color: '#666',
                            backgroundColor: '#f8f9fa',
                            fontStyle: 'italic'
                          }}>
                            No data available for {selectedType}
                          </td>
                        </tr>
                      ) : (
                        records.map((rec, idx) => (
                          <tr 
                            key={idx} 
                            style={{ 
                              backgroundColor: idx % 2 === 0 ? '#fff' : '#f8f9fa',
                              borderBottom: '1px solid #e9ecef'
                            }}
                          >
                            <td style={{ 
                              padding: '12px 16px', 
                              color: '#333',
                              fontSize: '14px'
                            }}>
                              {new Date(rec.datetime).toLocaleString()}
                            </td>
                            <td style={{ 
                              padding: '12px 16px', 
                              color: '#666',
                              fontSize: '14px'
                            }}>
                              {getGroupDisplay(rec.vital_group)}
                            </td>
                            <td style={{ 
                              padding: '12px 16px', 
                              color: '#333',
                              fontSize: '14px',
                              fontWeight: '500'
                            }}>
                              {getBathroomSizeDisplay(rec.value, rec.vital_group)}
                            </td>
                            <td style={{ 
                              padding: '12px 16px', 
                              color: '#666',
                              fontSize: '14px',
                              fontStyle: rec.notes ? 'normal' : 'italic'
                            }}>
                              {rec.notes || "No notes"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="pagination-controls" style={{ 
                marginTop: 20,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '12px',
                padding: '16px',
                backgroundColor: '#fff',
                borderRadius: '8px',
                boxShadow: '0 1px 4px rgba(0,0,0,0.1)'
              }}>
                <button 
                  onClick={handlePrev} 
                  disabled={page === 1}
                  style={{
                    padding: '8px 16px',
                    border: 'none',
                    borderRadius: '6px',
                    backgroundColor: page === 1 ? '#e9ecef' : '#007bff',
                    color: page === 1 ? '#6c757d' : '#fff',
                    cursor: page === 1 ? 'not-allowed' : 'pointer',
                    fontWeight: '500',
                    fontSize: '14px',
                    transition: 'all 0.2s ease'
                  }}
                >
                  ← Previous
                </button>
                <span style={{ 
                  margin: "0 16px", 
                  fontWeight: '600',
                  color: '#333',
                  fontSize: '14px'
                }}>
                  Page {page} of {totalPages}
                </span>
                <button 
                  onClick={handleNext} 
                  disabled={page === totalPages}
                  style={{
                    padding: '8px 16px',
                    border: 'none',
                    borderRadius: '6px',
                    backgroundColor: page === totalPages ? '#e9ecef' : '#007bff',
                    color: page === totalPages ? '#6c757d' : '#fff',
                    cursor: page === totalPages ? 'not-allowed' : 'pointer',
                    fontWeight: '500',
                    fontSize: '14px',
                    transition: 'all 0.2s ease'
                  }}
                >
                  Next →
                  </button>
                </div>
              </div>
              </>
              )}
            </div>
          )}
          {activeTab === 'reports' && (
            <div style={{ 
              backgroundColor: 'rgba(30,32,40,0.95)', 
              borderRadius: '12px', 
              padding: '16px',
              border: '1px solid #4a5568',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <div style={{ textAlign: 'center', color: '#ccc' }}>
                <h3 style={{ color: '#fff', marginBottom: '16px' }}>Reports</h3>
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
