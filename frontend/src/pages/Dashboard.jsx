import { useState, useEffect, useRef } from "react";
import ChartBlock from "../components/ChartBlock";
import ClockCard from "../components/ClockCard";
import DynamicVitalsCard from "../components/DynamicVitalsCard";
import ModalBase from "../components/ModalBase";
import SettingsForm from "../components/SettingsForm";
import { 
  SettingsIcon, 
  MinimalistVentIcon, 
  MinimalistPulseOxIcon, 
  HistoryIcon,
  MedicationIcon,
  CareTasksIcon,
  MessagesIcon
} from "../components/Icons";
import logoImage from '../assets/logo2.png';
import config from '../config';
import AlertsModal from "../components/AlertsModal";
import EquipmentModal from "../components/EquipmentModal";
import HistoryModal from "../components/HistoryModal";
import MedicationModal from "../components/MedicationModal";
import CareTaskModal from "../components/CareTaskModal";
import { Link } from 'react-router-dom';

export default function Dashboard() {
  // Add mobile detection state
  const [isMobile, setIsMobile] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Add state for modal
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  
  // Add state for notification counts
  const [ventNotifications, setVentNotifications] = useState(2);
  const [pulseOxNotifications, setPulseOxNotifications] = useState(3);
  const [pulseOxAlerts, setPulseOxAlerts] = useState(0);
  const [equipmentDueCount, setEquipmentDueCount] = useState(0);
  const [medicationDueCount, setMedicationDueCount] = useState(0);
  const [careTaskDueCount, setCareTaskDueCount] = useState(0);

  const [sensorValues, setSensorValues] = useState({
    spo2: null,
    bpm: null,
    perfusion: null,
    skin_temp: null,
    body_temp: null
  });

  const [datasets, setDatasets] = useState({
    spo2: [],
    bpm: [],
    perfusion: []
  });

  const [chartTimeRange, setChartTimeRange] = useState('5m');
  const [perfusionAsPercent, setPerfusionAsPercent] = useState(false);
  const [showStatistics, setShowStatistics] = useState(true);
  
  // Dynamic chart data from settings - these will contain the unified vitals data
  const [dashboardChart1, setDashboardChart1] = useState({ vital_type: 'blood_pressure', data: [] });
  const [dashboardChart2, setDashboardChart2] = useState({ vital_type: 'temperature', data: [] });

  const initialDataReceived = useRef(false);
  const prevAlarmActive = useRef(false);

  // Mobile detection effect
  useEffect(() => {
    const checkMobile = () => {
      const isMobileDevice = window.innerWidth <= 768;
      setIsMobile(isMobileDevice);
      console.log('Mobile check:', window.innerWidth, 'isMobile:', isMobileDevice);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // State for modals
  const [isVentModalOpen, setIsVentModalOpen] = useState(false);
  const [isPulseOxModalOpen, setIsPulseOxModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isMedicationModalOpen, setIsMedicationModalOpen] = useState(false);
  const [isCareTaskModalOpen, setIsCareTaskModalOpen] = useState(false);
  const [isMessagesModalOpen, setIsMessagesModalOpen] = useState(false);
  const [isAlarmActive, setIsAlarmActive] = useState(false);
  const [isAlarmBlinking, setIsAlarmBlinking] = useState(false);
  const alarmBlinkInterval = useRef(null);

  // Function to fetch chart data for a specific vital type
  const fetchChartData = async (vitalType, chartNumber) => {
    try {
      // Skip fetching data for nutrition - it has its own real-time data source
      if (vitalType === 'nutrition') {
        console.log(`Skipping fetch for nutrition (uses dedicated endpoint)`);
        if (chartNumber === 1) {
          setDashboardChart1(prev => ({ ...prev, data: [] }));
        } else {
          setDashboardChart2(prev => ({ ...prev, data: [] }));
        }
        return;
      }
      
      console.log(`Fetching chart data for ${vitalType} (Chart ${chartNumber})`);
      const response = await fetch(`${config.apiUrl}/api/vitals/${vitalType}?limit=20`);
      if (response.ok) {
        const data = await response.json();
        console.log(`Received ${data.length} records for ${vitalType}`);
        
        if (chartNumber === 1) {
          setDashboardChart1(prev => ({
            ...prev,
            data: data
          }));
        } else {
          setDashboardChart2(prev => ({
            ...prev,
            data: data
          }));
        }
      } else {
        console.error(`Failed to fetch chart data for ${vitalType}:`, response.statusText);
      }
    } catch (error) {
      console.error(`Error fetching chart data for ${vitalType}:`, error);
    }
  };

  // Helper function to format vital display names
  const formatVitalDisplayName = (vital) => {
    const displayNames = {
      'blood_pressure': 'Blood Pressure',
      'temperature': 'Temperature',
      'bathroom': 'Bathroom',
      'weight': 'Weight',
      'calories': 'Calories',
      'water': 'Water Intake',
      'nutrition': 'Nutrition'
    };
    
    return displayNames[vital] || vital.charAt(0).toUpperCase() + vital.slice(1);
  };

  // Load chart time range and perfusion display settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        console.log('Loading dashboard settings...');
        const response = await fetch(`${config.apiUrl}/api/settings`);
        if (response.ok) {
          const settings = await response.json();
          console.log('All settings loaded:', settings);
          if (settings.chart_time_range) {
            console.log('Found chart_time_range setting:', settings.chart_time_range);
            setChartTimeRange(settings.chart_time_range);
          }
          if (settings.perfusion_as_percent !== undefined) {
            let perfusionValue = settings.perfusion_as_percent;
            if (perfusionValue === "True" || perfusionValue === "true") perfusionValue = true;
            if (perfusionValue === "False" || perfusionValue === "false") perfusionValue = false;
            setPerfusionAsPercent(perfusionValue);
          }
          if (settings.show_statistics !== undefined) {
            let statisticsValue = settings.show_statistics;
            if (statisticsValue === "True" || statisticsValue === "true") statisticsValue = true;
            if (statisticsValue === "False" || statisticsValue === "false") statisticsValue = false;
            setShowStatistics(statisticsValue);
          }
          
          // Update dashboard chart vital types from settings
          if (settings.dashboard_chart_1_vital) {
            setDashboardChart1(prev => ({
              ...prev,
              vital_type: settings.dashboard_chart_1_vital,
              data: [] // Clear existing data when vital type changes
            }));
            // Fetch new data for chart 1
            fetchChartData(settings.dashboard_chart_1_vital, 1);
          } else {
            // Load default chart 1 data if no setting exists
            fetchChartData('blood_pressure', 1);
          }
          
          if (settings.dashboard_chart_2_vital) {
            setDashboardChart2(prev => ({
              ...prev,
              vital_type: settings.dashboard_chart_2_vital,
              data: [] // Clear existing data when vital type changes
            }));
            // Fetch new data for chart 2
            fetchChartData(settings.dashboard_chart_2_vital, 2);
          } else {
            // Load default chart 2 data if no setting exists
            fetchChartData('temperature', 2);
          }
        }
      } catch (err) {
        console.error('Error loading settings:', err);
      }
    };
    loadSettings();
  }, []);

  // Reload settings when settings modal is closed
  useEffect(() => {
    if (!isSettingsModalOpen) {
      const reloadSettings = async () => {
        try {
          const response = await fetch(`${config.apiUrl}/api/settings`);
          if (response.ok) {
            const settings = await response.json();
            if (settings.chart_time_range) {
              setChartTimeRange(settings.chart_time_range);
            }
            if (settings.perfusion_as_percent !== undefined) {
              let perfusionValue = settings.perfusion_as_percent;
              if (perfusionValue === "True" || perfusionValue === "true") perfusionValue = true;
              if (perfusionValue === "False" || perfusionValue === "false") perfusionValue = false;
              setPerfusionAsPercent(perfusionValue);
            }
            if (settings.show_statistics !== undefined) {
              let statisticsValue = settings.show_statistics;
              if (statisticsValue === "True" || statisticsValue === "true") statisticsValue = true;
              if (statisticsValue === "False" || statisticsValue === "false") statisticsValue = false;
              setShowStatistics(statisticsValue);
            }
            
            // Update dashboard chart vital types from settings
            if (settings.dashboard_chart_1_vital) {
              setDashboardChart1(prev => ({
                ...prev,
                vital_type: settings.dashboard_chart_1_vital,
                data: [] // Clear existing data when vital type changes
              }));
              // Fetch new data for chart 1
              fetchChartData(settings.dashboard_chart_1_vital, 1);
            }
            
            if (settings.dashboard_chart_2_vital) {
              setDashboardChart2(prev => ({
                ...prev,
                vital_type: settings.dashboard_chart_2_vital,
                data: [] // Clear existing data when vital type changes
              }));
              // Fetch new data for chart 2
              fetchChartData(settings.dashboard_chart_2_vital, 2);
            }
          }
        } catch (err) {
          console.error('Error reloading settings:', err);
        }
      };
      reloadSettings();
    }
  }, [isSettingsModalOpen]);

  // Convert time range to data points
  const getMaxDataPoints = () => {
    switch (chartTimeRange) {
      case '1m': return 60;
      case '3m': return 180;
      case '5m': return 300;
      case '10m': return 600;
      case '30m': return 1800;
      case '1h': return 3600;
      default: return 300;
    }
  };

  // Account-scoped equipment due count (matches Equipment List API)
  const fetchEquipmentDueCount = () => {
    fetch(`${config.apiUrl}/api/equipment/due/count`, { credentials: 'include' })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (data != null && typeof data.count === 'number') setEquipmentDueCount(data.count); })
      .catch(() => {});
  };

  useEffect(() => {
    fetchEquipmentDueCount();
  }, []);

  useEffect(() => {
    console.log(`Connecting to WebSocket at: ${config.wsUrl}`);
    const ws = new WebSocket(config.wsUrl);

    ws.onopen = () => console.log("WebSocket connected");

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "sensor_update" && msg.state) {
        const alarmActive = !!msg.state.alarm;

        if (!prevAlarmActive.current && alarmActive) {
          setIsAlarmBlinking(true);
          setTimeout(() => setIsAlarmBlinking(false), 100);
        }
        setIsAlarmActive(alarmActive);
        prevAlarmActive.current = alarmActive;

        setSensorValues({
          spo2: msg.state.spo2,
          bpm: msg.state.bpm,
          perfusion: msg.state.perfusion,
          skin_temp: msg.state.skin_temp,
          body_temp: msg.state.body_temp
        });

        const now = Date.now();

        setDatasets(prev => {
          const newState = { ...prev };
          let hasValidUpdate = false;
          const maxDataPoints = getMaxDataPoints();

          if (msg.state.spo2 !== null && msg.state.spo2 !== undefined) {
            newState.spo2 = [...prev.spo2, { x: now, y: msg.state.spo2 }].slice(-maxDataPoints);
            hasValidUpdate = true;
          }

          if (msg.state.bpm !== null && msg.state.bpm !== undefined) {
            newState.bpm = [...prev.bpm, { x: now, y: msg.state.bpm }].slice(-maxDataPoints);
            hasValidUpdate = true;
          }

          if (msg.state.perfusion !== null && msg.state.perfusion !== undefined) {
            newState.perfusion = [...prev.perfusion, { x: now, y: msg.state.perfusion }].slice(-maxDataPoints);
            hasValidUpdate = true;
          }

          return newState;
        });

        if (msg.state.alerts_count !== undefined) {
          setPulseOxAlerts(msg.state.alerts_count);
        }
        
        if (msg.state.vent_notifications !== undefined) {
          setVentNotifications(msg.state.vent_notifications);
        }
        
        // Equipment due count: use account-scoped API (fetched on mount); WebSocket count is global so we don't use it for badge
        // equipment_due_count: badge uses account-scoped API (see fetchEquipmentDueCount); skip WebSocket global count
        if (msg.state.medications !== undefined) {
          setMedicationDueCount(msg.state.medications);
        }
        
        if (msg.state.care_tasks !== undefined) {
          setCareTaskDueCount(msg.state.care_tasks);
        }
        
        if (msg.state.dashboard_chart_1) {
          setDashboardChart1(msg.state.dashboard_chart_1);
        }
        
        if (msg.state.dashboard_chart_2) {
          setDashboardChart2(msg.state.dashboard_chart_2);
        }
      }
      
      else if (msg.type === "alarm_update") {
        const alarmActive = !!(msg.alarm1 || msg.alarm2);
        setIsAlarmActive(alarmActive);
        prevAlarmActive.current = alarmActive;
      }
      else if (msg.type === "alert_acknowledged") {
        if (msg.alerts_count !== undefined) {
          setPulseOxAlerts(msg.alerts_count);
        }
      }
    };

    ws.onclose = () => console.log("WebSocket disconnected");

    return () => ws.close();
  }, []);

  const calculateAvg = (data) => {
    if (data.length === 0) return 0;
    return data.reduce((sum, item) => sum + item.y, 0) / data.length;
  };

  const calculateMin = (data) => {
    if (data.length === 0) return 0;
    return Math.min(...data.map(item => item.y));
  };

  const calculateMax = (data) => {
    if (data.length === 0) return 0;
    return Math.max(...data.map(item => item.y));
  };

  // Continuous blinking effect for alarm
  useEffect(() => {
    if (isAlarmActive) {
      if (!alarmBlinkInterval.current) {
        alarmBlinkInterval.current = setInterval(() => {
          setIsAlarmBlinking(prev => !prev);
        }, 500);
      }
    } else {
      if (alarmBlinkInterval.current) {
        clearInterval(alarmBlinkInterval.current);
        alarmBlinkInterval.current = null;
      }
      setIsAlarmBlinking(false);
    }
    
    return () => {
      if (alarmBlinkInterval.current) {
        clearInterval(alarmBlinkInterval.current);
        alarmBlinkInterval.current = null;
      }
      setIsAlarmBlinking(false);
    };
  }, [isAlarmActive]);

  // Close all modals function for reuse
  const closeAllModals = () => {
    setIsVentModalOpen(false);
    setIsPulseOxModalOpen(false);
    setIsSettingsModalOpen(false);
    setIsHistoryModalOpen(false);
    setIsMedicationModalOpen(false);
    setIsCareTaskModalOpen(false);
    setIsMessagesModalOpen(false);
    setIsMobileMenuOpen(false);
  };

  // Add handler functions
  const handleVentClick = () => {
    if (isVentModalOpen) {
      setIsVentModalOpen(false);
    } else {
      closeAllModals();
      setIsVentModalOpen(true);
    }
  };

  const handlePulseOxClick = () => {
    if (isPulseOxModalOpen) {
      setIsPulseOxModalOpen(false);
    } else {
      closeAllModals();
      setIsPulseOxModalOpen(true);
    }
  };

  const handleSettingsClick = () => {
    if (isSettingsModalOpen) {
      setIsSettingsModalOpen(false);
    } else {
      closeAllModals();
      setIsSettingsModalOpen(true);
    }
  };

  const handleHistoryClick = () => {
    if (isHistoryModalOpen) {
      setIsHistoryModalOpen(false);
    } else {
      closeAllModals();
      setIsHistoryModalOpen(true);
    }
  };

  const handleMessagesClick = () => {
    if (isMessagesModalOpen) {
      setIsMessagesModalOpen(false);
    } else {
      closeAllModals();
      setIsMessagesModalOpen(true);
    }
  };

  const handleMedicationClick = () => {
    if (isMedicationModalOpen) {
      setIsMedicationModalOpen(false);
    } else {
      closeAllModals();
      setIsMedicationModalOpen(true);
    }
  };

  const handleCareTaskClick = () => {
    if (isCareTaskModalOpen) {
      setIsCareTaskModalOpen(false);
    } else {
      closeAllModals();
      setIsCareTaskModalOpen(true);
    }
  };

  // Add this function to handle alert acknowledgment
  const handleAlertAcknowledged = (alertId) => {
    fetch(`${config.apiUrl}/api/monitoring/alerts/count`)
      .then(response => response.json())
      .then(data => {
        if (data && data.count !== undefined) {
          setPulseOxAlerts(data.count);
        }
      })
      .catch(err => console.error('Error fetching updated alert count:', err));
  };

  // Track if alerts viewed POST has been sent for this open
  const [alertsViewedSent, setAlertsViewedSent] = useState(false);

  useEffect(() => {
    if (isPulseOxModalOpen && !alertsViewedSent) {
      setAlertsViewedSent(true);
    }
    if (!isPulseOxModalOpen) {
      setAlertsViewedSent(false);
    }
  }, [isPulseOxModalOpen, alertsViewedSent]);

  return (
    <div className="dashboard-wrapper">
      <div className={`header-section${isAlarmBlinking ? ' alarm-blink' : ''}${isAlarmActive ? ' alarm-active' : ''}`}>
        {isMobile ? (
          // Mobile Header
          <>
            <div className="mobile-logo-container">
              <img src={logoImage} alt="Logo" className="header-logo" />
              <div className="logo-text">Smart Home Health</div>
            </div>
            
            <button 
              className="mobile-menu-button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Menu"
            >
              <div className={`hamburger ${isMobileMenuOpen ? 'open' : ''}`}>
                <span></span>
                <span></span>
                <span></span>
              </div>
            </button>
          </>
        ) : (
          // Desktop Header
          <>
            <div className="logo-container">
              <img src={logoImage} alt="Logo" className="header-logo" />
              <div className="logo-text">Smart Home Health</div>
            </div>
            
            <div className="menu-container">
              <div className="icon-wrapper">
                <button 
                  className={`menu-button ${isPulseOxModalOpen ? 'active' : ''}`}
                  onClick={handlePulseOxClick}
                  aria-label="Alerts"
                >
                  <MinimalistPulseOxIcon />
                  {pulseOxAlerts > 0 && <div className="badge">{pulseOxAlerts}</div>}
                </button>
              </div>
              
              <div className="icon-wrapper">
                <button 
                  className={`menu-button ${isMedicationModalOpen ? 'active' : ''}`}
                  onClick={handleMedicationClick}
                  aria-label="Medication Tracker"
                >
                  <MedicationIcon />
                  {medicationDueCount > 0 && <div className="badge">{medicationDueCount}</div>}
                </button>
              </div>
              
              <div className="icon-wrapper">
                <button 
                  className={`menu-button ${isCareTaskModalOpen ? 'active' : ''}`}
                  onClick={handleCareTaskClick}
                  aria-label="Care Tasks"
                >
                  <CareTasksIcon />
                  {careTaskDueCount > 0 && <div className="badge">{careTaskDueCount}</div>}
                </button>
              </div>
              
              <div className="icon-wrapper">
                <button 
                  className={`menu-button ${isVentModalOpen ? 'active' : ''}`}
                  onClick={handleVentClick}
                  aria-label="Ventilator"
                >
                  <MinimalistVentIcon />
                  {equipmentDueCount > 0 && <div className="badge">{equipmentDueCount}</div>}
                </button>
              </div>
              
              <div className="icon-wrapper">
                <button 
                  className={`menu-button ${isHistoryModalOpen ? 'active' : ''}`}
                  onClick={handleHistoryClick}
                  aria-label="History"
                >
                  <HistoryIcon />
                </button>
              </div>

              <div className="icon-wrapper">
                <button 
                  className={`menu-button ${isMessagesModalOpen ? 'active' : ''}`}
                  onClick={handleMessagesClick}
                  aria-label="Messages"
                >
                  <MessagesIcon />
                </button>
              </div>

              <div className="icon-wrapper">
                <button 
                  className={`menu-button ${isSettingsModalOpen ? 'active' : ''}`}
                  onClick={handleSettingsClick}
                  aria-label="Settings"
                >
                  <SettingsIcon />
                </button>
              </div>
            </div>
            
            <div className="datetime-container">
              <ClockCard />
            </div>
          </>
        )}
      </div>

      {/* Mobile Menu Overlay */}
      {isMobile && isMobileMenuOpen && (
        <div className="mobile-menu-overlay" onClick={() => setIsMobileMenuOpen(false)}>
          <div className="mobile-menu" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-menu-item" onClick={() => { handlePulseOxClick(); setIsMobileMenuOpen(false); }}>
              <MinimalistPulseOxIcon />
              <span>Alerts</span>
              {pulseOxAlerts > 0 && <div className="mobile-badge">{pulseOxAlerts}</div>}
            </div>
            
            <div className="mobile-menu-item" onClick={() => { handleMedicationClick(); setIsMobileMenuOpen(false); }}>
              <MedicationIcon />
              <span>Medications</span>
              {medicationDueCount > 0 && <div className="mobile-badge">{medicationDueCount}</div>}
            </div>
            
            <div className="mobile-menu-item" onClick={() => { handleCareTaskClick(); setIsMobileMenuOpen(false); }}>
              <CareTasksIcon />
              <span>Care Tasks</span>
              {careTaskDueCount > 0 && <div className="mobile-badge">{careTaskDueCount}</div>}
            </div>
            
            <div className="mobile-menu-item" onClick={() => { handleVentClick(); setIsMobileMenuOpen(false); }}>
              <MinimalistVentIcon />
              <span>Equipment</span>
              {equipmentDueCount > 0 && <div className="mobile-badge">{equipmentDueCount}</div>}
            </div>
            
            <div className="mobile-menu-item" onClick={() => { handleHistoryClick(); setIsMobileMenuOpen(false); }}>
              <HistoryIcon />
              <span>History</span>
            </div>
            
            <div className="mobile-menu-item" onClick={() => { handleMessagesClick(); setIsMobileMenuOpen(false); }}>
              <MessagesIcon />
              <span>Messages</span>
            </div>
            
            <div className="mobile-menu-item" onClick={() => { handleSettingsClick(); setIsMobileMenuOpen(false); }}>
              <SettingsIcon />
              <span>Settings</span>
            </div>
            
            <Link 
              to="/admin"
              className="mobile-menu-item admin-link"
              onClick={() => setIsMobileMenuOpen(false)}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <span style={{ fontSize: '20px' }}>⚙️</span>
              <span>Admin</span>
            </Link>
          </div>
        </div>
      )}
      
      <div className={`dashboard-container ${isMobile ? 'mobile' : ''}`}>
        {isMobile ? (
          // Mobile Layout - Only show the three value cards
          <div className="mobile-values-container">
            <div className="value-display spo2">
              <h3 className="value-title">SpO₂</h3>
              <div className="value-content">
                <div className="value">{sensorValues.spo2 ?? "--"}</div>
                <div className="unit">%</div>
              </div>
              {showStatistics && (
                <div className="value-stats">
                  {datasets.spo2.length > 0 ? (
                    <>
                      <span>
                        Avg: {calculateAvg(datasets.spo2.filter(item => item.y !== 0)).toFixed(1)}%
                      </span>
                      <span>
                        Min: {calculateMin(datasets.spo2.filter(item => item.y !== 0)).toFixed(0)}%
                      </span>
                      <span>
                        Max: {calculateMax(datasets.spo2.filter(item => item.y !== 0)).toFixed(0)}%
                      </span>
                    </>
                  ) : (
                    <span>No data available</span>
                  )}
                </div>
              )}
            </div>
            
            <div className="value-display bpm">
              <h3 className="value-title">Heart Rate</h3>
              <div className="value-content">
                <div className="value">{sensorValues.bpm ?? "--"}</div>
                <div className="unit">BPM</div>
              </div>
              {showStatistics && (
                <div className="value-stats">
                  {datasets.bpm.length > 0 ? (
                    <>
                      <span>
                        Avg: {calculateAvg(datasets.bpm.filter(item => item.y !== 0)).toFixed(0)}
                      </span>
                      <span>
                        Min: {calculateMin(datasets.bpm.filter(item => item.y !== 0)).toFixed(0)}
                      </span>
                      <span>
                        Max: {calculateMax(datasets.bpm.filter(item => item.y !== 0)).toFixed(0)}
                      </span>
                    </>
                  ) : (
                    <span>No data available</span>
                  )}
                </div>
              )}
            </div>
            
            <div className="value-display perfusion">
              <h3 className="value-title">Perfusion</h3>
              <div className="value-content">
                <div className="value">{sensorValues.perfusion ?? "--"}</div>
                <div className="unit">{perfusionAsPercent ? "%" : "PI"}</div>
              </div>
              {showStatistics && (
                <div className="value-stats">
                  {datasets.perfusion.length > 0 ? (
                    <>
                      <span>
                        Avg: {calculateAvg(datasets.perfusion.filter(item => item.y !== 0)).toFixed(1)}
                      </span>
                      <span>
                        Min: {calculateMin(datasets.perfusion.filter(item => item.y !== 0)).toFixed(1)}
                      </span>
                      <span>
                        Max: {calculateMax(datasets.perfusion.filter(item => item.y !== 0)).toFixed(1)}
                      </span>
                    </>
                  ) : (
                    <span>No data available</span>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          // Desktop Layout - Full layout with charts
          <>
            <div className="values-column">
              <div className="value-display spo2">
                <h3 className="value-title">SpO₂</h3>
                <div className="value-content">
                  <div className="value">{sensorValues.spo2 ?? "--"}</div>
                  <div className="unit">%</div>
                </div>
                {showStatistics && (
                  <div className="value-stats">
                    {datasets.spo2.length > 0 ? (
                      <>
                        <span>
                          Avg: {calculateAvg(datasets.spo2.filter(item => item.y !== 0)).toFixed(1)}%
                        </span>
                        <span>
                          Min: {calculateMin(datasets.spo2.filter(item => item.y !== 0)).toFixed(0)}%
                        </span>
                        <span>
                          Max: {calculateMax(datasets.spo2.filter(item => item.y !== 0)).toFixed(0)}%
                        </span>
                      </>
                    ) : (
                      <span>No data available</span>
                    )}
                  </div>
                )}
              </div>
              
              <div className="value-display bpm">
                <h3 className="value-title">Heart Rate</h3>
                <div className="value-content">
                  <div className="value">{sensorValues.bpm ?? "--"}</div>
                  <div className="unit">BPM</div>
                </div>
                {showStatistics && (
                  <div className="value-stats">
                    {datasets.bpm.length > 0 ? (
                      <>
                        <span>
                          Avg: {calculateAvg(datasets.bpm.filter(item => item.y !== 0)).toFixed(0)}
                        </span>
                        <span>
                          Min: {calculateMin(datasets.bpm.filter(item => item.y !== 0)).toFixed(0)}
                        </span>
                        <span>
                          Max: {calculateMax(datasets.bpm.filter(item => item.y !== 0)).toFixed(0)}
                        </span>
                      </>
                    ) : (
                      <span>No data available</span>
                    )}
                  </div>
                )}
              </div>
              
              <div className="value-display perfusion">
                <h3 className="value-title">Perfusion</h3>
                <div className="value-content">
                  <div className="value">{sensorValues.perfusion ?? "--"}</div>
                  <div className="unit">{perfusionAsPercent ? "%" : "PI"}</div>
                </div>
                {showStatistics && (
                  <div className="value-stats">
                    {datasets.perfusion.length > 0 ? (
                      <>
                        <span>
                          Avg: {calculateAvg(datasets.perfusion.filter(item => item.y !== 0)).toFixed(1)}
                        </span>
                        <span>
                          Min: {calculateMin(datasets.perfusion.filter(item => item.y !== 0)).toFixed(1)}
                        </span>
                        <span>
                          Max: {calculateMax(datasets.perfusion.filter(item => item.y !== 0)).toFixed(1)}
                        </span>
                      </>
                    ) : (
                      <span>No data available</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="charts-column">
              <div className="chart-block">
                <div className="chart-inner">
                  <ChartBlock
                    title="SpO₂ Monitor"
                    yLabel="SpO2"
                    yMin={40}
                    yMax={100}
                    color="blue"
                    dataset={datasets.spo2}
                    showXaxis={false}
                    showYaxis={true}
                  />
                </div>
              </div>

              <div className="chart-block">
                <div className="chart-inner">
                  <ChartBlock
                    title="BPM"
                    yLabel="BPM"
                    yMin={40}
                    yMax={160}
                    color="green"
                    dataset={datasets.bpm}
                    showXaxis={false}
                    showYaxis={true}
                  />
                </div>
              </div>

              <div className="chart-block">
                <div className="chart-inner">
                  <ChartBlock
                    title="Perfusion Monitor"
                    yLabel={perfusionAsPercent ? "PAI (%)" : "PAI (PI)"}
                    yMin={40}
                    yMax={160}
                    color="orange"
                    dataset={datasets.perfusion}
                    showXaxis={true}
                    showYaxis={true}
                  />
                </div>
              </div>
            </div>

            <div className="right-column">
              <div className="dynamic-chart-container">
                <DynamicVitalsCard 
                  vitalType={dashboardChart1.vital_type}
                  data={dashboardChart1.data}
                  title={`Chart 1: ${formatVitalDisplayName(dashboardChart1.vital_type)} History`}
                />
              </div>

              <div className="dynamic-chart-container">
                <DynamicVitalsCard 
                  vitalType={dashboardChart2.vital_type}
                  data={dashboardChart2.data}
                  title={`Chart 2: ${formatVitalDisplayName(dashboardChart2.vital_type)} History`}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Settings Modal */}
      {isSettingsModalOpen && (
        <SettingsForm onClose={() => setIsSettingsModalOpen(false)} />
      )}

      {/* Equipment Modal */}
      {isVentModalOpen && (
        <EquipmentModal 
          isOpen={isVentModalOpen} 
          onClose={() => { setIsVentModalOpen(false); fetchEquipmentDueCount(); }} 
          equipmentDueCount={equipmentDueCount} 
        />
      )}

      {/* Alerts Modal */}
      {isPulseOxModalOpen && (
        <AlertsModal
          isOpen={isPulseOxModalOpen}
          onClose={() => setIsPulseOxModalOpen(false)}
          alertsCount={pulseOxAlerts}
          onAlertAcknowledged={handleAlertAcknowledged}
        />
      )}

      {/* History Modal */}
      {isHistoryModalOpen && (
        <HistoryModal onClose={() => setIsHistoryModalOpen(false)} />
      )}

      {/* Messages Modal */}
      {isMessagesModalOpen && (
        <ModalBase
          isOpen={isMessagesModalOpen}
          onClose={() => setIsMessagesModalOpen(false)}
          title="Messages"
        >
          <div style={{
            backgroundColor: 'rgba(30,32,40,0.95)',
            borderRadius: '12px',
            padding: '40px',
            border: '1px solid #4a5568',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <div style={{ textAlign: 'center', color: '#ccc' }}>
              <h3 style={{ color: '#fff', marginBottom: '16px' }}>Messages</h3>
              <p>Messaging functionality coming soon...</p>
            </div>
          </div>
        </ModalBase>
      )}

      {/* Medication Modal */}
      {isMedicationModalOpen && (
        <MedicationModal onClose={() => setIsMedicationModalOpen(false)} />
      )}

      {/* Care Task Modal */}
      {isCareTaskModalOpen && (
        <CareTaskModal onClose={() => setIsCareTaskModalOpen(false)} />
      )}
    </div>
  );
}
