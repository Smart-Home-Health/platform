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
import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from "react";
import DynamicVitalsCard from "../components/DynamicVitalsCard";
import ModalBase from "../components/ModalBase";
import SettingsForm from "../components/SettingsForm";
import TopBar from "../components/dashboard/TopBar";
import CaptureVitalsModal from "../components/dashboard/CaptureVitalsModal";
import DashboardNavDrawer from "../components/dashboard/DashboardNavDrawer";
import { ModalDockProvider } from "../contexts/ModalDockContext";
import { buildTopBarActions } from "../components/dashboard/topBarActions";
import StatTile from "../components/dashboard/StatTile";
import LiveCharts from "../components/dashboard/LiveCharts";
import StatusStrip from "../components/dashboard/StatusStrip";
import ChartBlock from "../components/ChartBlock";
import useLiveVitalsBuffer, { CHART_RANGES } from "../hooks/useLiveVitalsBuffer";
import config from '../config';
import "../components/dashboard/live-dashboard.css";
import "../components/dashboard/dock-panel.css";
import '../components/vc/entity-card.css';
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
  // Which phone tiles are showing their trace instead of just the number.
  const [flippedTiles, setFlippedTiles] = useState({});
  const toggleTile = (key) => setFlippedTiles(f => ({ ...f, [key]: !f[key] }));

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

  // Sparkline for a flipped phone tile: the same ChartBlock the desktop column
  // uses, with its axes off so the trace reads against the ghosted value.
  const tileChart = (dataset, color) => (
    <ChartBlock
      dataset={dataset}
      color={color}
      showXaxis={false}
      showYaxis={false}
      showTooltip={false}
      transparent
      chrome={chartChrome}
      windowMs={buffer.rangeDef.minutes * 60 * 1000}
      now={buffer.now}
    />
  );
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
  const [isCaptureModalOpen, setIsCaptureModalOpen] = useState(false);
  const [hasCamera, setHasCamera] = useState(false);
  // Docked panels open on the narrow stop (over the cards column) and expand
  // over the charts on request; every open starts narrow again.
  const [panelExpanded, setPanelExpanded] = useState(false);
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

  // Menus open as a panel docked into the board, not a slab over it, so the
  // vitals stay readable. Two stops: narrow sits exactly on the cards column,
  // expanded also takes the charts. Both are measured rather than written as
  // vw constants — the columns are a grid (`minmax(230px, 320px)` /
  // `minmax(300px, 400px)`), so no viewport fraction is right at every width.
  // Consumed by .live-dash .mb-overlay in live-dashboard.css.
  //
  // Written to <html>, not to the board element: the capture panel's entry
  // sheet portals to <body>, outside the board, and still has to line up with
  // the panel. The board fills the viewport, so its offsets are the viewport's.
  const boardRef = useRef(null);
  useLayoutEffect(() => {
    const root = boardRef.current;
    if (!root) return undefined;
    const target = document.documentElement;

    const measure = () => {
      const topbar = root.querySelector('.ld-topbar');
      const main = root.querySelector('.ld-main');
      const charts = root.querySelector('.ld-charts');
      const cards = root.querySelector('.ld-cards');
      const strip = root.querySelector('.ld-strip');
      const set = (name, px) => target.style.setProperty(name, `${Math.round(px)}px`);
      const board = root.getBoundingClientRect();

      // Locked (a single centred tiles column) and any state without the
      // charts/cards columns: dock to the right of the tiles rather than over
      // them. An auth prompt gates *actions*, not the reading of vitals — the
      // pulse ox keeps streaming while the board is locked, so covering the
      // tiles would hide live values that are there to be seen.
      if (!main || !charts || !cards) {
        const tiles = root.querySelector('.ld-tiles');
        const gap = main ? parseFloat(getComputedStyle(main).columnGap) || 0 : 0;
        const left = tiles ? tiles.getBoundingClientRect().right - board.left + gap : 0;
        set('--ld-panel-top', topbar?.offsetHeight ?? 60);
        set('--ld-panel-bottom', strip?.offsetHeight ?? 0);
        set('--ld-panel-left', left);
        set('--ld-panel-left-wide', left);
        set('--ld-panel-right', 0);
        return;
      }

      const chartsBox = charts.getBoundingClientRect();
      const cardsBox = cards.getBoundingClientRect();
      // Anchor to the grid's content box so the panel sits inside the board's
      // padding like the cards it replaces, rather than bleeding to the edge.
      set('--ld-panel-top', chartsBox.top - board.top);
      set('--ld-panel-bottom', board.bottom - chartsBox.bottom);
      set('--ld-panel-right', board.right - cardsBox.right);
      set('--ld-panel-left', cardsBox.left - board.left);
      set('--ld-panel-left-wide', chartsBox.left - board.left);
    };

    measure();
    const observer = new ResizeObserver(measure);
    ['.ld-topbar', '.ld-tiles', '.ld-charts', '.ld-cards', '.ld-strip']
      .map(sel => root.querySelector(sel))
      .concat(root)
      .filter(Boolean)
      .forEach(el => observer.observe(el));
    return () => {
      observer.disconnect();
      ['--ld-panel-top', '--ld-panel-bottom', '--ld-panel-left',
        '--ld-panel-left-wide', '--ld-panel-right']
        .forEach(name => target.style.removeProperty(name));
    };
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

  // Detect Frigate integration for the current patient: the Live Camera action
  // appears only when a camera is actually configured. (It used to take the
  // Messages slot rather than add one, which hid the messages list entirely.)
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
    setIsCaptureModalOpen(false);
    setIsMobileMenuOpen(false);
    // Each panel opens at the narrow stop; expanding is a per-visit choice.
    setPanelExpanded(false);
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

  const handleCaptureClick = async () => {
    if (isCaptureModalOpen) { setIsCaptureModalOpen(false); return; }
    if (!(await requireUnlockAndFreshUser())) return;
    closeAllModals();
    setIsCaptureModalOpen(true);
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
      camera: isCameraModalOpen, messages: isMessagesModalOpen, capture: isCaptureModalOpen,
    },
    handlers: {
      alerts: handlePulseOxClick, medications: handleMedicationClick, nutrition: handleNutritionClick,
      careTasks: handleCareTaskClick, equipment: handleVentClick, history: handleHistoryClick,
      camera: handleCameraClick, messages: handleMessagesClick, capture: handleCaptureClick,
    },
  });

  // Panels dock into the board on desktop; mobile keeps the full-screen sheet.
  const modalDock = useMemo(() => ({
    docked: !isMobile,
    expanded: panelExpanded,
    toggleExpand: () => setPanelExpanded(v => !v),
    setExpanded: setPanelExpanded,
  }), [isMobile, panelExpanded]);

  return (
    <ModalDockProvider value={modalDock}>
    <div className="dashboard-wrapper force-dark live-dash" ref={boardRef}>
      {/* Auth gates take the whole board rather than docking beside it — an
          unlock prompt is not something to work alongside. */}
      <ModalBase
        isOpen={unlockModalOpen}
        onClose={() => { if (!needsUnlock) setActionUnlockOpen(false); }}
        title="Unlock"
        dock={false}
        dismissible={false}
      >
        <form onSubmit={handleUnlockSubmit} className="em-inline">
          <div className="em-form">
            <p className="em-hint">
              {needsUnlock
                ? 'Enter the account unlock password to view dashboard data.'
                : 'Enter the account password to continue.'}
            </p>
            {unlockError && (
              <div className="em-error" role="alert">{unlockError}</div>
            )}
            <input
              className="em-input"
              type="password"
              aria-label="Account password"
              value={unlockPassword}
              onChange={(e) => setUnlockPassword(e.target.value)}
              placeholder="Account password"
              autoFocus
              disabled={unlockLoading}
            />
            <button
              type="submit"
              className="em-submit"
              style={{ width: '100%' }}
              disabled={unlockLoading || !unlockPassword}
            >
              {unlockLoading ? 'Unlocking…' : 'Unlock'}
            </button>
          </div>
        </form>
      </ModalBase>

      <ModalBase
        isOpen={!unlockModalOpen && showPatientModal}
        onClose={() => { if (selectedPatient) setShowPatientModal(false); }}
        title="Select Patient"
        dock={false}
        dismissible={false}
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

      {/* Phone navigation. Rendered from the same action list as the top bar
          (see DashboardNavDrawer) rather than a hand-written copy of it. */}
      <DashboardNavDrawer
        open={isMobile && isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        actions={topBarActions}
        patientName={selectedPatient
          ? [selectedPatient.first_name, selectedPatient.last_name].filter(Boolean).join(' ')
          : null}
        onSettings={handleSettingsClick}
      />

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
            {!needsUnlock && (isMobile ? (
              /* The chart toolbar carried the range tabs, and phones no longer
                 render it — but the range still drives AVG/MIN/MAX and every
                 flipped trace, so it moves here rather than disappearing. */
              <div className="ld-range-tabs compact" role="tablist" aria-label="Chart time range">
                {CHART_RANGES.map(r => (
                  <button
                    key={r.key}
                    type="button"
                    role="tab"
                    aria-selected={buffer.range === r.key}
                    className={`ld-range-tab${buffer.range === r.key ? ' active' : ''}`}
                    onClick={() => buffer.setRange(r.key)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            ) : (
              <span className="ld-tiles-head-range">Stats · {buffer.rangeDef.label}</span>
            ))}
          </div>
          <StatTile
            label="SpO₂"
            source="Pulse ox · live"
            value={sensorValues.spo2}
            unit="%"
            accent="#4da7bd"
            stats={tileStats(buffer.series.spo2, v => `${v.toFixed(1)}%`, v => `${v.toFixed(0)}%`)}
            chart={isMobile && !needsUnlock ? tileChart(buffer.series.spo2, 'blue') : null}
            flipped={!!flippedTiles.spo2}
            onFlip={isMobile && !needsUnlock ? () => toggleTile('spo2') : null}
          />
          <StatTile
            label="Heart Rate"
            source="Pulse ox · live"
            value={sensorValues.bpm}
            unit="bpm"
            accent="#3fbf6a"
            stats={tileStats(buffer.series.bpm, v => v.toFixed(0))}
            chart={isMobile && !needsUnlock ? tileChart(buffer.series.bpm, 'green') : null}
            flipped={!!flippedTiles.bpm}
            onFlip={isMobile && !needsUnlock ? () => toggleTile('bpm') : null}
          />
          <StatTile
            label="Perfusion Index"
            source="PI · live"
            value={sensorValues.perfusion}
            unit={perfusionAsPercent ? '%' : 'PI'}
            accent="#f0a52e"
            stats={tileStats(buffer.series.perfusion, v => v.toFixed(1))}
            chart={isMobile && !needsUnlock ? tileChart(buffer.series.perfusion, 'orange') : null}
            flipped={!!flippedTiles.perfusion}
            onFlip={isMobile && !needsUnlock ? () => toggleTile('perfusion') : null}
          />
        </div>

        {/* Phones show the three tiles and nothing else: each tile is its own
            chart now, and the mini cards do not survive the narrow column. Not
            rendered rather than hidden, so a phone never pays to lay out four
            recharts trees it will not show. */}
        {!needsUnlock && !isMobile && (
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

        {!needsUnlock && !isMobile && (
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

      {/* Portal target for screen-level auth prompts. Inside `.live-dash` so
          they inherit the board's dark tokens and its measured panel geometry
          instead of landing on <body> in the app's default palette. */}
      <div id="ld-auth-slot" />

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

      {/* Capture Vitals — the live SpO2/HR are offered as a connected
          snapshot, so they are read straight off the board's sensor state. */}
      {isCaptureModalOpen && selectedPatient?.id && (
        <CaptureVitalsModal
          patient={selectedPatient}
          sensorValues={sensorValues}
          streaming={buffer.streaming.status === 'streaming'}
          onClose={() => setIsCaptureModalOpen(false)}
          onSaved={() => { reloadChart1(); reloadChart2(); }}
        />
      )}
    </div>
    </ModalDockProvider>
  );
}
