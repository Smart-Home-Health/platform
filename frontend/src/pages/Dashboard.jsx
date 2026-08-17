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
import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import DynamicVitalsCard from "../components/DynamicVitalsCard";
import ModalBase from "../components/ModalBase";
import SettingsForm from "../components/SettingsForm";
import {
  SettingsIcon,
  MinimalistVentIcon,
  MinimalistPulseOxIcon,
  HistoryIcon,
  MedicationIcon,
  NutritionIcon,
  CareTasksIcon,
  MessagesIcon,
  CameraIcon
} from "../components/Icons";
import TopBar from "../components/dashboard/TopBar";
import { buildTopBarActions } from "../components/dashboard/topBarActions";
import StatTile from "../components/dashboard/StatTile";
import LiveCharts from "../components/dashboard/LiveCharts";
import StatusStrip from "../components/dashboard/StatusStrip";
import useLiveVitalsBuffer from "../hooks/useLiveVitalsBuffer";
import config from '../config';
import "../components/dashboard/live-dashboard.css";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import AlertsModal from "../components/AlertsModal";
import EquipmentModal from "../components/EquipmentModal";
import HistoryModal from "../components/HistoryModal";
import MedicationModal from "../components/MedicationModal";
import NutritionModal from "../components/NutritionModal";
import CareTaskModal from "../components/CareTaskModal";
import CameraLiveModal from "../components/CameraLiveModal";
import MessagesModal from "../components/MessagesModal";
import { formatVitalDisplayName } from "../utils/vitals";
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useAdminPatient } from '../contexts/AdminPatientContext';
import { usePinChallenge } from '../contexts/PinChallengeContext';
import { useDashboardTheme } from '../contexts/DashboardThemeContext';

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAuthenticated, readRestricted, unlockWithAccountPassword } = useAuth();
  const { patients, selectedPatient, selectPatient, loadingPatients } = useAdminPatient();
  const { requirePinAuth, pinChallengeOpen } = usePinChallenge();
  const { chartChrome } = useDashboardTheme();

  // Add mobile detection state
  const [isMobile, setIsMobile] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Add state for modal
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Account unlock (24h) state
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [unlockLoading, setUnlockLoading] = useState(false);
  const [forceRelock, setForceRelock] = useState(false);
  // Account-password prompt requested by an action (24h re-confirm lapsed).
  const [actionUnlockOpen, setActionUnlockOpen] = useState(false);
  // Only genuine no-read-access blocks VIEWING (the server returns no data in
  // that mode anyway). The 24h re-confirm (forceRelock) does NOT blank the
  // screen — it gates actions instead, so the live dashboard stays a visible
  // monitoring view and only prompts for the account password when the user
  // actually does something.
  const needsUnlock = !!readRestricted;
  const unlockModalOpen = needsUnlock || actionUnlockOpen;

  // Live chart buffer: server-side backfill + WS ticks, range tabs.
  const buffer = useLiveVitalsBuffer(selectedPatient?.id, !needsUnlock);
  // The mount-time WS closure reaches the current pushTick through a ref.
  const pushTickRef = useRef(buffer.pushTick);
  pushTickRef.current = buffer.pushTick;

  // Patient selection
  const [showPatientModal, setShowPatientModal] = useState(false);

  // Top-nav gating: after user selection, open requested modal
  const [pendingOpenModal, setPendingOpenModal] = useState(null);
  
  // Add state for notification counts
  const [pulseOxAlerts, setPulseOxAlerts] = useState(0);
  const [equipmentDueCount, setEquipmentDueCount] = useState(0);
  const [medicationDueCount, setMedicationDueCount] = useState(0);
  const [nutritionDueCount, setNutritionDueCount] = useState(0);
  const [careTaskDueCount, setCareTaskDueCount] = useState(0);

  const [sensorValues, setSensorValues] = useState({
    spo2: null,
    bpm: null,
    perfusion: null,
    skin_temp: null,
    body_temp: null
  });

  // WebSocket link state for the status strip. The pulse ox reports its own
  // disconnect in-band as spo2 === -1.
  const [wsStatus, setWsStatus] = useState('closed');
  const [sensorOffline, setSensorOffline] = useState(false);

  const [perfusionAsPercent, setPerfusionAsPercent] = useState(false);
  const [showStatistics, setShowStatistics] = useState(true);
  
  // Dynamic chart data from settings - these will contain the unified vitals data
  const [dashboardChart1, setDashboardChart1] = useState({ vital_type: 'blood_pressure', data: [] });
  const [dashboardChart2, setDashboardChart2] = useState({ vital_type: 'temperature', data: [] });

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
  const [isNutritionModalOpen, setIsNutritionModalOpen] = useState(false);
  const [isCareTaskModalOpen, setIsCareTaskModalOpen] = useState(false);
  const [isMessagesModalOpen, setIsMessagesModalOpen] = useState(false);
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [hasCamera, setHasCamera] = useState(false);
  const [isAlarmActive, setIsAlarmActive] = useState(false);
  const [isAlarmBlinking, setIsAlarmBlinking] = useState(false);
  const alarmBlinkInterval = useRef(null);

  // ------------------------------------------------------------
  // Unlock (account password) & Patient selection gating
  // ------------------------------------------------------------

  // On mobile, both the unlock modal and the PIN challenge modal fill the
  // viewport. Set a CSS variable that the modal CSS reads, so the modal
  // docks under a small banner showing the 3 large vital readings — vitals
  // must remain visible during any auth prompt.
  const authModalActive = unlockModalOpen || pinChallengeOpen;
  useEffect(() => {
    const root = document.documentElement;
    if (isMobile && authModalActive) {
      root.style.setProperty('--auth-banner-height', '96px');
    } else {
      root.style.setProperty('--auth-banner-height', '0px');
    }
    return () => root.style.setProperty('--auth-banner-height', '0px');
  }, [isMobile, authModalActive]);

  // The dashboard modals dock against the live board rather than covering it,
  // so the vitals stay readable while a panel is open. Publish the board's real
  // geometry as CSS variables (see .live-dash .dashboard-modal-overlay in
  // live-dashboard.css) — the left column is a grid `minmax(230px, 320px)`, so
  // there is no viewport-relative constant that stays correct at every width.
  const boardRef = useRef(null);
  useLayoutEffect(() => {
    const root = boardRef.current;
    if (!root) return undefined;

    const measure = () => {
      const topbar = root.querySelector('.ld-topbar');
      const main = root.querySelector('.ld-main');
      const tiles = root.querySelector('.ld-tiles');
      const strip = root.querySelector('.ld-strip');

      root.style.setProperty('--ld-topbar-h', `${Math.round(topbar?.offsetHeight ?? 60)}px`);
      root.style.setProperty('--ld-strip-h', `${Math.round(strip?.offsetHeight ?? 0)}px`);

      // Locked (unauthenticated) shows a single centred column, so there is
      // nothing to dock beside — let the unlock panel cover the whole board.
      if (!main || !tiles || main.classList.contains('locked')) {
        root.style.setProperty('--ld-panel-left', '0px');
        return;
      }
      const gap = parseFloat(getComputedStyle(main).columnGap) || 0;
      const left = tiles.getBoundingClientRect().right - root.getBoundingClientRect().left + gap;
      root.style.setProperty('--ld-panel-left', `${Math.round(left)}px`);
    };

    measure();
    const observer = new ResizeObserver(measure);
    [root, root.querySelector('.ld-topbar'), root.querySelector('.ld-tiles'), root.querySelector('.ld-strip')]
      .filter(Boolean)
      .forEach(el => observer.observe(el));
    return () => observer.disconnect();
    // Re-measure when the board's structure changes (lock state adds/removes
    // the charts and cards columns, which resizes the tiles column).
  }, [needsUnlock, isMobile]);

  // Enforce 24h unlock window (client-side)
  useEffect(() => {
    const raw = localStorage.getItem('dashboardUnlockedAt');
    if (!raw) return;
    const unlockedAt = Number(raw);
    if (!Number.isFinite(unlockedAt)) return;
    const ageMs = Date.now() - unlockedAt;
    const maxMs = 24 * 60 * 60 * 1000;
    if (ageMs >= maxMs) {
      setForceRelock(true);
    }
  }, []);

  // If we already have read access but no timestamp, set one so the 24h window applies
  useEffect(() => {
    if (readRestricted) return;
    if (localStorage.getItem('dashboardUnlockedAt')) return;
    localStorage.setItem('dashboardUnlockedAt', String(Date.now()));
  }, [readRestricted]);

  // URL -> patient selection sync
  useEffect(() => {
    const patientParam = searchParams.get('patient');
    if (!patientParam) return;
    if (loadingPatients || patients.length === 0) return;

    const desiredId = Number(patientParam);
    if (!Number.isFinite(desiredId)) return;
    if (selectedPatient?.id === desiredId) return;

    const found = patients.find(p => p.id === desiredId);
    if (found) {
      selectPatient(found);
      setShowPatientModal(false);
    }
  }, [searchParams, loadingPatients, patients, selectedPatient, selectPatient]);

  // If no patient selected, force patient picker (like Admin V2)
  useEffect(() => {
    if (loadingPatients) return;
    const patientParam = searchParams.get('patient');
    if (!patientParam && !selectedPatient) {
      setShowPatientModal(true);
    }
  }, [loadingPatients, selectedPatient, searchParams]);

  const handleSelectPatient = (patient) => {
    selectPatient(patient);
    setShowPatientModal(false);
    if (patient?.id) {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.set('patient', String(patient.id));
        return next;
      });
    }
  };

  // After returning from /select-user, open a pending modal (top-nav)
  useEffect(() => {
    const requested = location.state?.openLiveModal || null;
    if (!requested) return;
    if (!isAuthenticated) return;
    if (needsUnlock) return;
    setPendingOpenModal(requested);
    // Clear state so refresh doesn't re-open
    navigate(location.pathname + location.search, { replace: true, state: {} });
  }, [location.state, isAuthenticated, needsUnlock, navigate, location.pathname, location.search]);

  // Function to fetch chart data for a specific vital type.
  // Memoized so the `onSaved` callbacks handed to the (memoized) vitals cards
  // keep a stable identity across the dashboard's ~1 Hz re-renders.
  const fetchChartData = useCallback(async (vitalType, chartNumber) => {
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
      
      if (!selectedPatient?.id || needsUnlock) {
        if (chartNumber === 1) setDashboardChart1(prev => ({ ...prev, data: [] }));
        else setDashboardChart2(prev => ({ ...prev, data: [] }));
        return;
      }

      console.log(`Fetching chart data for ${vitalType} (Chart ${chartNumber})`);
      const response = await fetch(
        `${config.apiUrl}/api/vitals/patient/${selectedPatient.id}?vital_type=${encodeURIComponent(vitalType)}&limit=20`,
        { credentials: 'include' }
      );
      if (response.ok) {
        const raw = await response.json();
        const data = Array.isArray(raw) ? raw : [];
        console.log(`Received ${data.length} records for ${vitalType}`);

        const normalized = data.map((item) => {
          // Patient vitals endpoint groups multi-value vitals under item.values and uses item.timestamp
          if (vitalType === 'blood_pressure') {
            return {
              datetime: item.datetime || item.timestamp,
              systolic: item.systolic ?? item.values?.systolic,
              diastolic: item.diastolic ?? item.values?.diastolic,
              map: item.map ?? item.values?.map,
              value: item.value ?? item.values?.map ?? null,
              notes: item.notes
            };
          }
          if (vitalType === 'temperature') {
            return {
              datetime: item.datetime || item.timestamp,
              body: item.body ?? item.values?.body ?? item.values?.body_temp,
              skin: item.skin ?? item.values?.skin ?? item.values?.skin_temp,
              value: item.value ?? item.values?.body ?? item.values?.body_temp ?? null,
              notes: item.notes
            };
          }
          return {
            ...item,
            datetime: item.datetime || item.timestamp
          };
        });
        
        if (chartNumber === 1) {
          setDashboardChart1(prev => ({
            ...prev,
            data: normalized
          }));
        } else {
          setDashboardChart2(prev => ({
            ...prev,
            data: normalized
          }));
        }
      } else {
        console.error(`Failed to fetch chart data for ${vitalType}:`, response.statusText);
      }
    } catch (error) {
      console.error(`Error fetching chart data for ${vitalType}:`, error);
    }
  }, [selectedPatient?.id, needsUnlock]);

  // Load chart time range and perfusion display settings
  useEffect(() => {
    if (needsUnlock) return;
    if (!selectedPatient?.id) return;
    const loadSettings = async () => {
      try {
        console.log('Loading dashboard settings...');
        const response = await fetch(`${config.apiUrl}/api/settings`, { credentials: 'include' });
        if (response.ok) {
          const settings = await response.json();
          console.log('All settings loaded:', settings);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch helper is recreated each render; effect is keyed on unlock/patient change only
  }, [needsUnlock, selectedPatient?.id]);

  // Reload settings when settings modal is closed
  useEffect(() => {
    if (needsUnlock) return;
    if (!selectedPatient?.id) return;
    if (!isSettingsModalOpen) {
      const reloadSettings = async () => {
        try {
          const response = await fetch(`${config.apiUrl}/api/settings`, { credentials: 'include' });
          if (response.ok) {
            const settings = await response.json();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch helper is recreated each render; effect is keyed on modal close/unlock/patient change only
  }, [isSettingsModalOpen, needsUnlock, selectedPatient?.id]);

  // Account-scoped equipment due count (matches Equipment List API)
  // All dashboard "due" badges are scoped to the patient on screen via REST so
  // one patient's due items don't leak into another's view. (The WebSocket
  // state carries global counts that ignore the viewer's patient, so we don't
  // use those for the badges.) A ref keeps the current patient id reachable
  // from the mount-time WebSocket closure for live refreshes.
  const dueCountPatientRef = useRef(null);

  const fetchDueCount = (path, setter, pid) => {
    const patientId = pid ?? selectedPatient?.id;
    if (!patientId) { setter(0); return; }
    fetch(`${config.apiUrl}${path}?patient_id=${patientId}`, { credentials: 'include' })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (data != null && typeof data.count === 'number') setter(data.count); })
      .catch(() => {});
  };

  const fetchEquipmentDueCount = (pid) => fetchDueCount('/api/equipment/due/count', setEquipmentDueCount, pid);
  const fetchMedicationDueCount = (pid) => fetchDueCount('/api/medications/due/count', setMedicationDueCount, pid);
  const fetchCareTaskDueCount = (pid) => fetchDueCount('/api/schedule/care-tasks/due/count', setCareTaskDueCount, pid);
  const fetchNutritionDueCount = (pid) => fetchDueCount('/api/nutrition/due/count', setNutritionDueCount, pid);

  // Refetch every badge for a patient (defaults to the current selection).
  const refreshDueCounts = (pid) => {
    fetchEquipmentDueCount(pid);
    fetchMedicationDueCount(pid);
    fetchCareTaskDueCount(pid);
    fetchNutritionDueCount(pid);
  };

  useEffect(() => {
    dueCountPatientRef.current = selectedPatient?.id || null;
    refreshDueCounts();
    // The schedule-driven badges (meds, tasks, nutrition) tick over purely from
    // the passage of time as occurrences "age in" — their scheduled hour arrives
    // with no user action to fire a `due_counts_changed` event. Poll once a
    // minute so an open dashboard stays current. Event-driven refetches (a dose
    // logged / item marked done) still apply on top for instant updates.
    const interval = setInterval(() => refreshDueCounts(), 60000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch helper is recreated each render; effect is keyed on patient change only
  }, [selectedPatient?.id]);

  // Detect Frigate integration for the current patient so we can swap the
  // Messages icon for a live camera icon when one is configured.
  useEffect(() => {
    let cancelled = false;
    setHasCamera(false);
    if (!selectedPatient?.id || needsUnlock) return;
    (async () => {
      try {
        const res = await fetch(
          `${config.apiUrl}/api/integrations/patient/${selectedPatient.id}?include_disabled=false`,
          { credentials: 'include' }
        );
        if (!res.ok) return;
        const list = await res.json();
        if (cancelled) return;
        const frigate = (list || []).find(
          i => i.integration_slug === 'frigate' && i.is_enabled && i.settings?.camera
        );
        setHasCamera(!!frigate);
      } catch {
        // ignore - camera detection is non-critical
      }
    })();
    return () => { cancelled = true; };
  }, [selectedPatient?.id, needsUnlock]);

  const wsRef = useRef(null);
  useEffect(() => {
    let disposed = false;
    let ws = null;
    let retryTimer = null;
    let retryDelay = 1000;

    const handleMessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "sensor_update" && msg.state) {
        const alarmActive = !!msg.state.alarm;

        if (!prevAlarmActive.current && alarmActive) {
          setIsAlarmBlinking(true);
          setTimeout(() => setIsAlarmBlinking(false), 100);
        }
        setIsAlarmActive(alarmActive);
        prevAlarmActive.current = alarmActive;

        // The pulse ox reports its own disconnect in-band as -1 readings —
        // surface that as "sensor offline" instead of rendering -1.
        const offline = msg.state.spo2 === -1 || msg.state.bpm === -1;
        setSensorOffline(offline);
        const clean = (v) => (v === -1 || v == null ? null : v);

        setSensorValues({
          spo2: clean(msg.state.spo2),
          bpm: clean(msg.state.bpm),
          perfusion: offline ? null : msg.state.perfusion,
          skin_temp: msg.state.skin_temp,
          body_temp: msg.state.body_temp
        });

        pushTickRef.current({
          t: Date.now(),
          spo2: clean(msg.state.spo2),
          bpm: clean(msg.state.bpm),
          perfusion: offline ? null : msg.state.perfusion ?? null,
        });

        if (msg.state.alerts_count !== undefined) {
          setPulseOxAlerts(msg.state.alerts_count);
        }
        // NOTE: msg.state.dashboard_chart_1/2 are deliberately ignored — the
        // server builds them without a patient filter, so consuming them here
        // would leak other patients' vitals into the cards. The cards use the
        // patient-scoped REST fetch instead (fetchChartData).
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
      // A due item was marked done / logged / restocked anywhere. Refetch the
      // matching badge for the patient on screen. The badges are patient-scoped
      // via REST (see refreshDueCounts), so we use the ref — this closure is
      // created once at mount — and ignore the event's own patient_id, which may
      // differ from the viewer's selected patient.
      else if (msg.type === "due_counts_changed") {
        const pid = dueCountPatientRef.current;
        if (pid) {
          switch (msg.category) {
            case "medications": fetchMedicationDueCount(pid); break;
            case "care_tasks": fetchCareTaskDueCount(pid); break;
            case "nutrition": fetchNutritionDueCount(pid); break;
            case "equipment": fetchEquipmentDueCount(pid); break;
            default: break;
          }
        }
      }
    };

    // Reconnect with capped exponential backoff — a dropped socket used to be
    // permanent until reload. Alarm state carries across via prevAlarmActive;
    // request_state on (re)open resyncs immediately.
    const connect = () => {
      if (disposed) return;
      const url = config.wsUrl;
      console.log(`Connecting to WebSocket at: ${url}`);
      ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        retryDelay = 1000;
        setWsStatus('open');
        try { ws.send(JSON.stringify({ type: 'request_state' })); } catch { /* just wait for the next tick */ }
      };
      ws.onmessage = handleMessage;
      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
        if (disposed) return;
        setWsStatus('reconnecting');
        retryTimer = setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 30000);
      };
    };
    connect();

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (ws) ws.close();
      wsRef.current = null;
      setWsStatus('closed');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only WebSocket connection; adding the render-recreated helpers would tear down and reopen the live socket every render
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
    setIsNutritionModalOpen(false);
    setIsCareTaskModalOpen(false);
    setIsMessagesModalOpen(false);
    setIsCameraModalOpen(false);
    setIsMobileMenuOpen(false);
  };

  // Open a specific top-nav modal after user selection redirect
  useEffect(() => {
    if (!pendingOpenModal) return;
    if (needsUnlock) return;
    if (!isAuthenticated) return;

    closeAllModals();
    switch (pendingOpenModal) {
      case 'equipment':
        setIsVentModalOpen(true);
        break;
      case 'alerts':
        setIsPulseOxModalOpen(true);
        break;
      case 'medications':
        setIsMedicationModalOpen(true);
        break;
      case 'nutrition':
        setIsNutritionModalOpen(true);
        break;
      case 'careTasks':
        setIsCareTaskModalOpen(true);
        break;
      case 'history':
        setIsHistoryModalOpen(true);
        break;
      case 'messages':
        setIsMessagesModalOpen(true);
        break;
      case 'settings':
        setIsSettingsModalOpen(true);
        break;
      default:
        break;
    }

    setPendingOpenModal(null);
  }, [pendingOpenModal, isAuthenticated, needsUnlock]);

  // Async modal-open guard.
  //   - 24h account unlock must be valid (else show unlock modal).
  //   - User identity must be fresh within the 5-min idle window managed by
  //     PinChallengeContext. If stale, the global PIN challenge modal opens
  //     and this awaits its outcome. Cancel → caller bails.
  // Returns true when the caller may proceed to open its modal.
  const requireUnlockAndFreshUser = async () => {
    // Account password is required before acting when read access was never
    // granted (readRestricted) or the 24h re-confirm window has lapsed.
    if (readRestricted || forceRelock) {
      setActionUnlockOpen(true);
      setUnlockError('Enter account password to continue.');
      return false;
    }
    const ok = await requirePinAuth();
    if (!ok) return false;
    // Defensive fallback: if for some reason auth state still says no user
    // after the challenge resolved true, send to the legacy picker.
    if (!isAuthenticated) {
      navigate('/select-user', { state: { from: location }, replace: false });
      return false;
    }
    return true;
  };

  // Add handler functions
  const handleVentClick = async () => {
    if (isVentModalOpen) { setIsVentModalOpen(false); return; }
    if (!(await requireUnlockAndFreshUser())) return;
    closeAllModals();
    setIsVentModalOpen(true);
  };

  const handlePulseOxClick = async () => {
    if (isPulseOxModalOpen) { setIsPulseOxModalOpen(false); return; }
    if (!(await requireUnlockAndFreshUser())) return;
    closeAllModals();
    setIsPulseOxModalOpen(true);
  };

  const handleSettingsClick = async () => {
    if (isSettingsModalOpen) { setIsSettingsModalOpen(false); return; }
    if (!(await requireUnlockAndFreshUser())) return;
    closeAllModals();
    setIsSettingsModalOpen(true);
  };

  const handleHistoryClick = async () => {
    if (isHistoryModalOpen) { setIsHistoryModalOpen(false); return; }
    if (!(await requireUnlockAndFreshUser())) return;
    closeAllModals();
    setIsHistoryModalOpen(true);
  };

  const handleMessagesClick = async () => {
    if (isMessagesModalOpen) { setIsMessagesModalOpen(false); return; }
    if (!(await requireUnlockAndFreshUser())) return;
    closeAllModals();
    setIsMessagesModalOpen(true);
  };

  const handleCameraClick = async () => {
    if (isCameraModalOpen) { setIsCameraModalOpen(false); return; }
    if (!(await requireUnlockAndFreshUser())) return;
    closeAllModals();
    setIsCameraModalOpen(true);
  };

  const handleMedicationClick = async () => {
    if (isMedicationModalOpen) { setIsMedicationModalOpen(false); return; }
    if (!(await requireUnlockAndFreshUser())) return;
    closeAllModals();
    setIsMedicationModalOpen(true);
  };

  const handleCareTaskClick = async () => {
    if (isCareTaskModalOpen) { setIsCareTaskModalOpen(false); return; }
    if (!(await requireUnlockAndFreshUser())) return;
    closeAllModals();
    setIsCareTaskModalOpen(true);
  };

  const handleNutritionClick = async () => {
    if (isNutritionModalOpen) { setIsNutritionModalOpen(false); return; }
    if (!(await requireUnlockAndFreshUser())) return;
    closeAllModals();
    setIsNutritionModalOpen(true);
  };

  // Add this function to handle alert acknowledgment
  const handleAlertAcknowledged = () => {
    fetch(`${config.apiUrl}/api/monitoring/alerts/count`, { credentials: 'include' })
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

  const handleUnlockSubmit = async (e) => {
    e.preventDefault();
    setUnlockError('');
    setUnlockLoading(true);
    const result = await unlockWithAccountPassword(unlockPassword);
    setUnlockLoading(false);
    if (result.success) {
      localStorage.setItem('dashboardUnlockedAt', String(Date.now()));
      setForceRelock(false);
      setActionUnlockOpen(false);
      setUnlockPassword('');
      setUnlockError('');
    } else {
      setUnlockError(result.error || 'Invalid account password');
    }
  };

  // Tile AVG/MIN/MAX from the chart buffer (zeros excluded, matching the old
  // stat behavior).
  const tileStats = (pts, fmtAvg, fmtMinMax = fmtAvg) => {
    if (!showStatistics) return null;
    const clean = pts.filter(p => p.y !== 0);
    if (!clean.length) return { avg: '--', min: '--', max: '--' };
    return {
      avg: fmtAvg(calculateAvg(clean)),
      min: fmtMinMax(calculateMin(clean)),
      max: fmtMinMax(calculateMax(clean)),
    };
  };

  const reloadChart1 = useCallback(
    () => fetchChartData(dashboardChart1.vital_type, 1),
    [fetchChartData, dashboardChart1.vital_type]
  );
  const reloadChart2 = useCallback(
    () => fetchChartData(dashboardChart2.vital_type, 2),
    [fetchChartData, dashboardChart2.vital_type]
  );

  const topBarActions = buildTopBarActions({
    pulseOxAlerts, medicationDueCount, nutritionDueCount, careTaskDueCount, equipmentDueCount,
    hasCamera,
    modalOpen: {
      alerts: isPulseOxModalOpen, medications: isMedicationModalOpen, nutrition: isNutritionModalOpen,
      careTasks: isCareTaskModalOpen, equipment: isVentModalOpen, history: isHistoryModalOpen,
      camera: isCameraModalOpen, messages: isMessagesModalOpen,
    },
    handlers: {
      alerts: handlePulseOxClick, medications: handleMedicationClick, nutrition: handleNutritionClick,
      careTasks: handleCareTaskClick, equipment: handleVentClick, history: handleHistoryClick,
      camera: handleCameraClick, messages: handleMessagesClick,
    },
  });

  return (
    <div className="dashboard-wrapper force-dark live-dash" ref={boardRef}>
      <ModalBase
        isOpen={unlockModalOpen}
        onClose={() => { if (!needsUnlock) setActionUnlockOpen(false); }}
        title="Unlock"
      >
        <form onSubmit={handleUnlockSubmit} className="tw">
          <div className="flex flex-col gap-3">
            <p className="m-0 text-sm text-muted-foreground">
              {needsUnlock
                ? 'Enter the account unlock password to view dashboard data.'
                : 'Enter the account password to continue.'}
            </p>
            {unlockError && (
              <Alert variant="destructive">{unlockError}</Alert>
            )}
            <Input
              type="password"
              value={unlockPassword}
              onChange={(e) => setUnlockPassword(e.target.value)}
              placeholder="Account password"
              autoFocus
              disabled={unlockLoading}
            />
            <Button type="submit" className="w-full" disabled={unlockLoading || !unlockPassword}>
              {unlockLoading ? 'Unlocking…' : 'Unlock'}
            </Button>
          </div>
        </form>
      </ModalBase>

      <ModalBase
        isOpen={!unlockModalOpen && showPatientModal}
        onClose={() => { if (selectedPatient) setShowPatientModal(false); }}
        title="Select Patient"
      >
        {loadingPatients ? (
          <div>Loading patients…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {patients.filter(p => p.is_active).map((p) => (
              <button
                key={p.id}
                onClick={() => handleSelectPatient(p)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  padding: '0.75rem',
                  borderRadius: '10px',
                  border: '1px solid #30363d',
                  background: selectedPatient?.id === p.id ? 'rgba(88, 166, 255, 0.12)' : '#161b22',
                  color: '#f0f6fc',
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.first_name} {p.last_name}
                  </strong>
                  <span style={{ color: '#8b949e', fontSize: '0.85rem' }}>
                    {p.room || 'No room assigned'}
                  </span>
                </div>
                <span style={{ color: '#8b949e', whiteSpace: 'nowrap' }}>
                  #{p.id}
                </span>
              </button>
            ))}
            {patients.filter(p => p.is_active).length === 0 && (
              <div>No active patients found.</div>
            )}
          </div>
        )}
      </ModalBase>

      <TopBar
        isMobile={isMobile}
        isAlarmBlinking={isAlarmBlinking}
        isAlarmActive={isAlarmActive}
        patientName={selectedPatient ? [selectedPatient.first_name, selectedPatient.last_name].filter(Boolean).join(' ') : ''}
        onBrandClick={() => navigate('/care')}
        onPatientClick={() => setShowPatientModal(true)}
        actions={topBarActions}
        settingsActive={isSettingsModalOpen}
        onSettingsClick={handleSettingsClick}
        isMobileMenuOpen={isMobileMenuOpen}
        onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
      />

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

            <div className="mobile-menu-item" onClick={() => { handleNutritionClick(); setIsMobileMenuOpen(false); }}>
              <NutritionIcon />
              <span>Nutrition</span>
              {nutritionDueCount > 0 && <div className="mobile-badge">{nutritionDueCount}</div>}
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
            
            {hasCamera ? (
              <div className="mobile-menu-item" onClick={() => { handleCameraClick(); setIsMobileMenuOpen(false); }}>
                <CameraIcon />
                <span>Live Camera</span>
              </div>
            ) : (
              <div className="mobile-menu-item" onClick={() => { handleMessagesClick(); setIsMobileMenuOpen(false); }}>
                <MessagesIcon />
                <span>Messages</span>
              </div>
            )}
            
            <div className="mobile-menu-item" onClick={() => { handleSettingsClick(); setIsMobileMenuOpen(false); }}>
              <SettingsIcon />
              <span>Settings</span>
            </div>
          </div>
        </div>
      )}
      
      {/* Compact vitals banner shown only while an auth modal is up on
          mobile, so the 3 large readings stay visible above the modal. */}
      {isMobile && authModalActive && (
        <div className="mobile-auth-vitals-banner">
          <div className="bar-vital spo2">
            <span className="bar-label">SpO₂</span>
            <span className="bar-value">{sensorValues.spo2 ?? '--'}</span>
            <span className="bar-unit">%</span>
          </div>
          <div className="bar-vital bpm">
            <span className="bar-label">HR</span>
            <span className="bar-value">{sensorValues.bpm ?? '--'}</span>
            <span className="bar-unit">bpm</span>
          </div>
          <div className="bar-vital perfusion">
            <span className="bar-label">PI</span>
            <span className="bar-value">{sensorValues.perfusion ?? '--'}</span>
            <span className="bar-unit">{perfusionAsPercent ? '%' : 'PI'}</span>
          </div>
        </div>
      )}

      <div className={`ld-main${needsUnlock ? ' locked' : ''}`}>
        <div className="ld-tiles">
          {/* Sits in the same row as the chart toolbar so tiles align with
              their chart rows; also names the window the AVG/MIN/MAX cover. */}
          <div className="ld-tiles-head">
            <span className="ld-tiles-head-title">Live Vitals</span>
            {!needsUnlock && (
              <span className="ld-tiles-head-range">Stats · {buffer.rangeDef.label}</span>
            )}
          </div>
          <StatTile
            label="SpO₂"
            source="Pulse ox · live"
            value={sensorValues.spo2}
            unit="%"
            accent="#4da7bd"
            stats={tileStats(buffer.series.spo2, v => `${v.toFixed(1)}%`, v => `${v.toFixed(0)}%`)}
          />
          <StatTile
            label="Heart Rate"
            source="Pulse ox · live"
            value={sensorValues.bpm}
            unit="bpm"
            accent="#3fbf6a"
            stats={tileStats(buffer.series.bpm, v => v.toFixed(0))}
          />
          <StatTile
            label="Perfusion Index"
            source="PI · live"
            value={sensorValues.perfusion}
            unit={perfusionAsPercent ? '%' : 'PI'}
            accent="#f0a52e"
            stats={tileStats(buffer.series.perfusion, v => v.toFixed(1))}
          />
        </div>

        {!needsUnlock && (
          <LiveCharts
            range={buffer.range}
            setRange={buffer.setRange}
            rangeDef={buffer.rangeDef}
            series={buffer.series}
            streaming={buffer.streaming}
            chrome={chartChrome}
            perfusionAsPercent={perfusionAsPercent}
            now={buffer.now}
          />
        )}

        {!needsUnlock && (
          <div className="ld-cards">
            <DynamicVitalsCard
              vitalType={dashboardChart1.vital_type}
              data={dashboardChart1.data}
              title={formatVitalDisplayName(dashboardChart1.vital_type)}
              patientId={selectedPatient?.id}
              chrome={chartChrome}
              onSaved={reloadChart1}
            />
            <DynamicVitalsCard
              vitalType={dashboardChart2.vital_type}
              data={dashboardChart2.data}
              title={formatVitalDisplayName(dashboardChart2.vital_type)}
              patientId={selectedPatient?.id}
              chrome={chartChrome}
              onSaved={reloadChart2}
            />
          </div>
        )}
      </div>

      <StatusStrip
        wsStatus={wsStatus}
        lastTickAt={buffer.lastTickAt}
        sensorOffline={sensorOffline}
        patientId={selectedPatient?.id}
      />

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

      {/* Camera Modal (replaces Messages when patient has Frigate) */}
      {isCameraModalOpen && selectedPatient?.id && (
        <CameraLiveModal
          patientId={selectedPatient.id}
          patientName={[selectedPatient.first_name, selectedPatient.last_name].filter(Boolean).join(' ')}
          onClose={() => setIsCameraModalOpen(false)}
        />
      )}

      {/* Messages Modal */}
      {isMessagesModalOpen && (
        <MessagesModal onClose={() => setIsMessagesModalOpen(false)} />
      )}

      {/* Medication Modal */}
      {isMedicationModalOpen && (
        <MedicationModal onClose={() => setIsMedicationModalOpen(false)} />
      )}

      {/* Nutrition Modal */}
      {isNutritionModalOpen && (
        <NutritionModal onClose={() => setIsNutritionModalOpen(false)} />
      )}

      {/* Care Task Modal */}
      {isCareTaskModalOpen && (
        <CareTaskModal onClose={() => setIsCareTaskModalOpen(false)} />
      )}
    </div>
  );
}
