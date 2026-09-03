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
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/layout/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import UserSelectionPage from './pages/UserSelectionPage';
import PasswordResetPage from './pages/PasswordResetPage';
import Dashboard from './pages/Dashboard';
import AdminV2Dashboard from './pages/admin-v2/AdminV2Dashboard';
import {
  AdminV2UserAccess, AdminV2UserActivity, AdminV2UserDetail, AdminV2UserEdit,
  AdminV2UserSecurity,
} from './pages/admin-v2/users';
import AdminV2RoleDetail from './pages/admin-v2/AdminV2RoleDetail';
import AdminV2Medications from './pages/admin-v2/AdminV2Medications';
import AdminV2MedicationsManage from './pages/admin-v2/AdminV2MedicationsManage';
import AdminV2MedicationsSchedule from './pages/admin-v2/AdminV2MedicationsSchedule';
import AdminV2CareTasks from './pages/admin-v2/AdminV2CareTasks';
import AdminV2CareTasksOverview from './pages/admin-v2/AdminV2CareTasksOverview';
import AdminV2CareTasksSchedule from './pages/admin-v2/AdminV2CareTasksSchedule';
import AdminV2EquipmentOverview from './pages/admin-v2/AdminV2EquipmentOverview';
import AdminV2EquipmentHistory from './pages/admin-v2/AdminV2EquipmentHistory';
import AdminV2Shipments from './pages/admin-v2/AdminV2Shipments';
import AdminV2ShipmentDetail from './pages/admin-v2/AdminV2ShipmentDetail';
import AdminV2ShipmentAlerts from './pages/admin-v2/AdminV2ShipmentAlerts';
import AdminV2Inventory from './pages/admin-v2/AdminV2Inventory';
import AdminV2InventorySetup from './pages/admin-v2/AdminV2InventorySetup';
import AdminV2Directory from './pages/admin-v2/directory/AdminV2Directory';
import {
  AdminV2CareProfileHub,
  AdminV2CareProfileEdit,
  AdminV2CareProfileFeatures,
  AdminV2CareProfileMeasurements,
  AdminV2CareProfileHardLimits,
  AdminV2CareProfileHomeAssistant,
  AdminV2CareProfileMqttTopics,
  AdminV2CareProfileContext,
} from './pages/admin-v2/care-profile';
import AdminV2Providers from './pages/admin-v2/AdminV2Providers';
import AdminV2Businesses from './pages/admin-v2/AdminV2Businesses';
import AdminV2Schedule from './pages/admin-v2/AdminV2Schedule';
import AdminV2ScheduleUndoLog from './pages/admin-v2/AdminV2ScheduleUndoLog';
import AdminV2Vitals from './pages/admin-v2/AdminV2Vitals';
import VitalsCapturePage from './pages/capture/VitalsCapturePage';
import AdminV2VitalsCapture from './pages/admin-v2/AdminV2VitalsCapture';
import AdminV2Symptoms from './pages/admin-v2/AdminV2Symptoms';
import AdminV2Diagnoses from './pages/admin-v2/AdminV2Diagnoses';
import AdminV2Implants from './pages/admin-v2/AdminV2Implants';
import AdminV2Nutrition from './pages/admin-v2/AdminV2Nutrition';
import AdminV2NutritionSchedule from './pages/admin-v2/AdminV2NutritionSchedule';
import AdminV2ProfileSummary from './pages/admin-v2/AdminV2ProfileSummary';
import AdminV2Monitoring from './pages/admin-v2/AdminV2Monitoring';
import AdminV2Messages from './pages/admin-v2/AdminV2Messages';
import AdminV2Reports from './pages/admin-v2/AdminV2Reports';
import AdminV2ReportsOvernight from './pages/admin-v2/AdminV2ReportsOvernight';
import AdminV2ReportsWeekly from './pages/admin-v2/AdminV2ReportsWeekly';
import AdminV2AccountSettings from './pages/admin-v2/AdminV2AccountSettings';
import AdminV2Backup from './pages/admin-v2/AdminV2Backup';
import AdminV2SystemHealth from './pages/admin-v2/AdminV2SystemHealth';
import AdminV2Security from './pages/admin-v2/AdminV2Security';
import AdminV2Environment from './pages/admin-v2/AdminV2Environment';
import AdminV2HomeAssistant from './pages/admin-v2/AdminV2HomeAssistant';
import AdminV2Connections from './pages/admin-v2/AdminV2Connections';
import AdminV2Mqtt from './pages/admin-v2/AdminV2Mqtt';
import { AdminV2SettingsGeneral } from './pages/admin-v2/settings';
import FirstRunSetup from './components/FirstRunSetup';
import { ActiveInputProvider } from './contexts/ActiveInputContext';
import { PinChallengeProvider } from './contexts/PinChallengeContext';
import { IdleLockProvider } from './contexts/IdleLockContext';
import { DashboardThemeProvider } from './contexts/DashboardThemeContext';
import VirtualKeyboard from './components/VirtualKeyboard/VirtualKeyboard';
import { useVirtualKeyboard } from './hooks/useVirtualKeyboard';
import "./App.css";

function AppContent() {
  const { isFirstRun, loading } = useAuth();
  const { showVKB } = useVirtualKeyboard();
  // Dev-only preview of the first-run screens (`/?firstRun=1`) — the real
  // gate is the backend's "no admin user yet"; this is stripped from prod.
  const devFirstRun = import.meta.env.DEV
    && typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).has('firstRun');

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '100vh',
        fontSize: '18px',
        color: 'var(--vc-text-secondary)',
        background: 'var(--vc-bg-base)'
      }}>
        Loading...
      </div>
    );
  }

  return (
    <ActiveInputProvider>
      <PinChallengeProvider>
      <Router basename={(typeof window !== 'undefined' && window.__BASE_PATH__) || undefined}>
        <IdleLockProvider>
        {(isFirstRun || devFirstRun) ? <FirstRunSetup /> : <Routes>
          {/* Public Routes */}
          <Route path="/" element={<Navigate to="/care" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/select-user" element={<UserSelectionPage />} />
          <Route path="/first-login" element={<PasswordResetPage />} />
          
          {/* Protected Routes - wrapped in Layout */}
          <Route path="/live" element={
            <ProtectedRoute requireFullAuth={false}>
              <Layout>
                <DashboardThemeProvider>
                  <Dashboard />
                </DashboardThemeProvider>
              </Layout>
            </ProtectedRoute>
          } />
          
          {/* Care Routes - Protected */}
          <Route path="/care" element={<ProtectedRoute><Layout><AdminV2Dashboard /></Layout></ProtectedRoute>} />
          {/* Users and roles moved into Configuration > Directory; the old
              paths stay bookmarkable. */}
          <Route path="/care/users" element={<Navigate to="/care/configuration/users" replace />} />
          <Route path="/care/users/add" element={<Navigate to="/care/configuration/users" replace />} />
          <Route path="/care/users/roles" element={<Navigate to="/care/configuration/users/roles" replace />} />
          <Route path="/care/medications" element={<ProtectedRoute><Layout><AdminV2Medications /></Layout></ProtectedRoute>} />
          <Route path="/care/medications/schedule" element={<ProtectedRoute><Layout><AdminV2MedicationsSchedule /></Layout></ProtectedRoute>} />
          <Route path="/care/medications/manage" element={<ProtectedRoute><Layout><AdminV2MedicationsManage /></Layout></ProtectedRoute>} />
          <Route path="/care/care-tasks" element={<ProtectedRoute><Layout><AdminV2CareTasksOverview /></Layout></ProtectedRoute>} />
          <Route path="/care/care-tasks/manage" element={<ProtectedRoute><Layout><AdminV2CareTasks /></Layout></ProtectedRoute>} />
          <Route path="/care/care-tasks/schedule" element={<ProtectedRoute><Layout><AdminV2CareTasksSchedule /></Layout></ProtectedRoute>} />
          {/* History is a modal on the Overview now; the old path lands there. */}
          <Route path="/care/care-tasks/history" element={<ProtectedRoute><Layout><AdminV2CareTasksOverview /></Layout></ProtectedRoute>} />
          <Route path="/care/equipment" element={<ProtectedRoute><Layout><AdminV2EquipmentOverview /></Layout></ProtectedRoute>} />
          {/* The catalogue merged into Supplies; the URL stays bookmarkable. */}
          <Route path="/care/equipment/manage" element={<Navigate to="/care/equipment/inventory" replace />} />
          <Route path="/care/equipment/history" element={<ProtectedRoute><Layout><AdminV2EquipmentHistory /></Layout></ProtectedRoute>} />
          <Route path="/care/equipment/shipments" element={<ProtectedRoute><Layout><AdminV2Shipments /></Layout></ProtectedRoute>} />
          <Route path="/care/equipment/shipments/:id" element={<ProtectedRoute><Layout><AdminV2ShipmentDetail /></Layout></ProtectedRoute>} />
          <Route path="/care/equipment/inventory" element={<ProtectedRoute><Layout><AdminV2Inventory /></Layout></ProtectedRoute>} />
          <Route path="/care/equipment/inventory/setup" element={<ProtectedRoute><Layout><AdminV2InventorySetup /></Layout></ProtectedRoute>} />
          <Route path="/care/equipment/alerts" element={<ProtectedRoute><Layout><AdminV2ShipmentAlerts /></Layout></ProtectedRoute>} />
          <Route path="/care/patients" element={<Navigate to="/care/configuration/patients" replace />} />
          <Route path="/care/providers" element={<ProtectedRoute><Layout><AdminV2Providers /></Layout></ProtectedRoute>} />
          <Route path="/care/businesses" element={<ProtectedRoute><Layout><AdminV2Businesses /></Layout></ProtectedRoute>} />
          <Route path="/care/schedule" element={<ProtectedRoute><Layout><AdminV2Schedule /></Layout></ProtectedRoute>} />
          <Route path="/care/schedule/undo-log" element={<ProtectedRoute><Layout><AdminV2ScheduleUndoLog /></Layout></ProtectedRoute>} />
            
          {/* Care Vitals Routes */}
          <Route path="/capture" element={<ProtectedRoute><Layout><VitalsCapturePage /></Layout></ProtectedRoute>} />
          {/* Recording vitals IS the capture experience, embedded in the admin
              shell here; AdminV2Vitals keeps history only. */}
          <Route path="/care/vitals" element={<ProtectedRoute><Layout><AdminV2VitalsCapture /></Layout></ProtectedRoute>} />
          <Route path="/care/vitals/history" element={<ProtectedRoute><Layout><AdminV2Vitals /></Layout></ProtectedRoute>} />
            
          {/* Care Symptoms Routes */}
          <Route path="/care/symptoms" element={<ProtectedRoute><Layout><AdminV2Symptoms /></Layout></ProtectedRoute>} />
          <Route path="/care/symptoms/active" element={<ProtectedRoute><Layout><AdminV2Symptoms /></Layout></ProtectedRoute>} />
          <Route path="/care/symptoms/history" element={<ProtectedRoute><Layout><AdminV2Symptoms /></Layout></ProtectedRoute>} />
            
          {/* Care Nutrition Routes */}
          <Route path="/care/nutrition" element={<ProtectedRoute><Layout><AdminV2Nutrition /></Layout></ProtectedRoute>} />
          <Route path="/care/nutrition/schedule" element={<ProtectedRoute><Layout><AdminV2NutritionSchedule /></Layout></ProtectedRoute>} />
          <Route path="/care/nutrition/intake" element={<ProtectedRoute><Layout><AdminV2Nutrition /></Layout></ProtectedRoute>} />
          <Route path="/care/nutrition/output" element={<ProtectedRoute><Layout><AdminV2Nutrition /></Layout></ProtectedRoute>} />
          <Route path="/care/nutrition/plan" element={<ProtectedRoute><Layout><AdminV2Nutrition /></Layout></ProtectedRoute>} />
          <Route path="/care/nutrition/items" element={<ProtectedRoute><Layout><AdminV2Nutrition /></Layout></ProtectedRoute>} />
          {/* Manage and Goals became one Plan view; the old paths still resolve. */}
          <Route path="/care/nutrition/schedules" element={<ProtectedRoute><Layout><AdminV2Nutrition /></Layout></ProtectedRoute>} />
          <Route path="/care/nutrition/goals" element={<ProtectedRoute><Layout><AdminV2Nutrition /></Layout></ProtectedRoute>} />
            
          {/* Care Profile Routes (Patient-specific) */}
          <Route path="/care/profile" element={<ProtectedRoute><Layout><AdminV2ProfileSummary /></Layout></ProtectedRoute>} />
          <Route path="/care/profile/providers" element={<ProtectedRoute><Layout><AdminV2Providers /></Layout></ProtectedRoute>} />
          <Route path="/care/profile/diagnoses" element={<ProtectedRoute><Layout><AdminV2Diagnoses /></Layout></ProtectedRoute>} />
          <Route path="/care/profile/implants" element={<ProtectedRoute><Layout><AdminV2Implants /></Layout></ProtectedRoute>} />
          <Route path="/care/profile/businesses" element={<ProtectedRoute><Layout><AdminV2Businesses /></Layout></ProtectedRoute>} />
          {/* Per-patient MQTT consolidated onto the patient settings page */}
          <Route path="/care/profile/connections" element={<ProtectedRoute><Layout><AdminV2Connections /></Layout></ProtectedRoute>} />
          <Route path="/care/profile/mqtt" element={<Navigate to="/care/configuration/patients" replace />} />
            
          {/* Care Monitoring Routes */}
          <Route path="/care/monitoring" element={<ProtectedRoute><Layout><AdminV2Monitoring /></Layout></ProtectedRoute>} />
          <Route path="/care/monitoring/history" element={<ProtectedRoute><Layout><AdminV2Monitoring /></Layout></ProtectedRoute>} />
          <Route path="/care/monitoring/timeline" element={<ProtectedRoute><Layout><AdminV2Monitoring /></Layout></ProtectedRoute>} />
          <Route path="/care/monitoring/ventilator" element={<ProtectedRoute><Layout><AdminV2Monitoring /></Layout></ProtectedRoute>} />
          <Route path="/care/monitoring/interactions" element={<ProtectedRoute><Layout><AdminV2Monitoring /></Layout></ProtectedRoute>} />
          <Route path="/care/monitoring/environment" element={<ProtectedRoute><Layout><AdminV2Monitoring /></Layout></ProtectedRoute>} />

          {/* Care Messages Routes */}
          <Route path="/care/messages" element={<ProtectedRoute><Layout><AdminV2Messages /></Layout></ProtectedRoute>} />

          {/* Care Reports Routes */}
          <Route path="/care/reports" element={<ProtectedRoute><Layout><AdminV2Reports /></Layout></ProtectedRoute>} />
          <Route path="/care/reports/day-over-day" element={<ProtectedRoute><Layout><AdminV2Reports /></Layout></ProtectedRoute>} />
          <Route path="/care/reports/overnight" element={<ProtectedRoute><Layout><AdminV2ReportsOvernight /></Layout></ProtectedRoute>} />
          <Route path="/care/reports/weekly" element={<ProtectedRoute><Layout><AdminV2ReportsWeekly /></Layout></ProtectedRoute>} />

          {/* Care Configuration Routes (System-wide) */}
          <Route path="/care/configuration" element={<ProtectedRoute><Layout><AdminV2SettingsGeneral /></Layout></ProtectedRoute>} />
          <Route path="/care/configuration/account" element={<ProtectedRoute><Layout><AdminV2AccountSettings /></Layout></ProtectedRoute>} />
          {/* Integrations moved under Profile as "Connections"; keep old URL working */}
          <Route path="/care/configuration/integrations" element={<Navigate to="/care/profile/connections" replace />} />
          <Route path="/care/configuration/patients" element={<ProtectedRoute><Layout><AdminV2Directory /></Layout></ProtectedRoute>} />
          <Route path="/care/configuration/patients/:patientId" element={<ProtectedRoute><Layout><AdminV2CareProfileHub /></Layout></ProtectedRoute>} />
          <Route path="/care/configuration/patients/:patientId/edit" element={<ProtectedRoute><Layout><AdminV2CareProfileEdit /></Layout></ProtectedRoute>} />
          <Route path="/care/configuration/patients/:patientId/features" element={<ProtectedRoute><Layout><AdminV2CareProfileFeatures /></Layout></ProtectedRoute>} />
          <Route path="/care/configuration/patients/:patientId/measurements" element={<ProtectedRoute><Layout><AdminV2CareProfileMeasurements /></Layout></ProtectedRoute>} />
          <Route path="/care/configuration/patients/:patientId/measurements/limits" element={<ProtectedRoute><Layout><AdminV2CareProfileHardLimits /></Layout></ProtectedRoute>} />
          <Route path="/care/configuration/patients/:patientId/home-assistant" element={<ProtectedRoute><Layout><AdminV2CareProfileHomeAssistant /></Layout></ProtectedRoute>} />
          <Route path="/care/configuration/patients/:patientId/home-assistant/topics" element={<ProtectedRoute><Layout><AdminV2CareProfileMqttTopics /></Layout></ProtectedRoute>} />
          <Route path="/care/configuration/patients/:patientId/context" element={<ProtectedRoute><Layout><AdminV2CareProfileContext /></Layout></ProtectedRoute>} />
          <Route path="/care/configuration/mqtt" element={<ProtectedRoute><Layout><AdminV2Mqtt /></Layout></ProtectedRoute>} />
          <Route path="/care/configuration/backup" element={<ProtectedRoute><Layout><AdminV2Backup /></Layout></ProtectedRoute>} />
          <Route path="/care/configuration/system-health" element={<ProtectedRoute><Layout><AdminV2SystemHealth /></Layout></ProtectedRoute>} />
          <Route path="/care/configuration/security" element={<ProtectedRoute><Layout><AdminV2Security /></Layout></ProtectedRoute>} />
          <Route path="/care/configuration/environment" element={<ProtectedRoute><Layout><AdminV2Environment /></Layout></ProtectedRoute>} />
          <Route path="/care/configuration/home-assistant" element={<ProtectedRoute><Layout><AdminV2HomeAssistant /></Layout></ProtectedRoute>} />
          <Route path="/care/configuration/users" element={<ProtectedRoute><Layout><AdminV2Directory /></Layout></ProtectedRoute>} />
          <Route path="/care/configuration/users/roles" element={<ProtectedRoute><Layout><AdminV2Directory /></Layout></ProtectedRoute>} />
          <Route path="/care/configuration/users/roles/:roleId" element={<ProtectedRoute><Layout><AdminV2RoleDetail /></Layout></ProtectedRoute>} />
          <Route path="/care/configuration/users/:userId" element={<ProtectedRoute><Layout><AdminV2UserDetail /></Layout></ProtectedRoute>} />
          <Route path="/care/configuration/users/:userId/edit" element={<ProtectedRoute><Layout><AdminV2UserEdit /></Layout></ProtectedRoute>} />
          <Route path="/care/configuration/users/:userId/access" element={<ProtectedRoute><Layout><AdminV2UserAccess /></Layout></ProtectedRoute>} />
          <Route path="/care/configuration/users/:userId/security" element={<ProtectedRoute><Layout><AdminV2UserSecurity /></Layout></ProtectedRoute>} />
          <Route path="/care/configuration/users/:userId/activity" element={<ProtectedRoute><Layout><AdminV2UserActivity /></Layout></ProtectedRoute>} />

          <Route path="/care/*" element={<ProtectedRoute><Layout><AdminV2Dashboard /></Layout></ProtectedRoute>} />
        </Routes>}
        </IdleLockProvider>
      </Router>
      <VirtualKeyboard show={showVKB} />
      </PinChallengeProvider>
    </ActiveInputProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
