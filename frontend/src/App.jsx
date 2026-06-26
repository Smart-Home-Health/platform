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
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/layout/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import UserSelectionPage from './pages/UserSelectionPage';
import PasswordResetPage from './pages/PasswordResetPage';
import Dashboard from './pages/Dashboard';
import AdminV2Dashboard from './pages/admin-v2/AdminV2Dashboard';
import AdminV2Users from './pages/admin-v2/AdminV2Users';
import AdminV2UserDetail from './pages/admin-v2/AdminV2UserDetail';
import AdminV2Roles from './pages/admin-v2/AdminV2Roles';
import AdminV2RoleDetail from './pages/admin-v2/AdminV2RoleDetail';
import AdminV2Medications from './pages/admin-v2/AdminV2Medications';
import AdminV2MedicationsManage from './pages/admin-v2/AdminV2MedicationsManage';
import AdminV2MedicationsSchedule from './pages/admin-v2/AdminV2MedicationsSchedule';
import AdminV2MedicationsHistory from './pages/admin-v2/AdminV2MedicationsHistory';
import AdminV2CareTasks from './pages/admin-v2/AdminV2CareTasks';
import AdminV2CareTasksOverview from './pages/admin-v2/AdminV2CareTasksOverview';
import AdminV2CareTasksSchedule from './pages/admin-v2/AdminV2CareTasksSchedule';
import AdminV2CareTasksHistory from './pages/admin-v2/AdminV2CareTasksHistory';
import AdminV2Equipment from './pages/admin-v2/AdminV2Equipment';
import AdminV2EquipmentHistory from './pages/admin-v2/AdminV2EquipmentHistory';
import AdminV2Shipments from './pages/admin-v2/AdminV2Shipments';
import AdminV2ShipmentDetail from './pages/admin-v2/AdminV2ShipmentDetail';
import AdminV2ShipmentAlerts from './pages/admin-v2/AdminV2ShipmentAlerts';
import AdminV2Patients from './pages/admin-v2/AdminV2Patients';
import AdminV2PatientDetail from './pages/admin-v2/AdminV2PatientDetail';
import AdminV2Providers from './pages/admin-v2/AdminV2Providers';
import AdminV2Businesses from './pages/admin-v2/AdminV2Businesses';
import AdminV2Schedule from './pages/admin-v2/AdminV2Schedule';
import AdminV2ScheduleUndoLog from './pages/admin-v2/AdminV2ScheduleUndoLog';
import AdminV2Vitals from './pages/admin-v2/AdminV2Vitals';
import AdminV2Symptoms from './pages/admin-v2/AdminV2Symptoms';
import AdminV2Diagnoses from './pages/admin-v2/AdminV2Diagnoses';
import AdminV2Implants from './pages/admin-v2/AdminV2Implants';
import AdminV2Nutrition from './pages/admin-v2/AdminV2Nutrition';
import AdminV2ProfileSummary from './pages/admin-v2/AdminV2ProfileSummary';
import AdminV2Monitoring from './pages/admin-v2/AdminV2Monitoring';
import AdminV2Messages from './pages/admin-v2/AdminV2Messages';
import AdminV2Reports from './pages/admin-v2/AdminV2Reports';
import AdminV2ReportsOvernight from './pages/admin-v2/AdminV2ReportsOvernight';
import AdminV2ReportsWeekly from './pages/admin-v2/AdminV2ReportsWeekly';
import AdminV2AccountSettings from './pages/admin-v2/AdminV2AccountSettings';
import AdminV2Backup from './pages/admin-v2/AdminV2Backup';
import AdminV2SystemHealth from './pages/admin-v2/AdminV2SystemHealth';
import AdminV2Integrations from './pages/admin-v2/AdminV2Integrations';
import AdminV2Mqtt from './pages/admin-v2/AdminV2Mqtt';
import { AdminV2SettingsGeneral } from './pages/admin-v2/settings';
import FirstRunSetup from './components/FirstRunSetup';
import { ActiveInputProvider } from './contexts/ActiveInputContext';
import { PinChallengeProvider } from './contexts/PinChallengeContext';
import { IdleLockProvider } from './contexts/IdleLockContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { DashboardThemeProvider } from './contexts/DashboardThemeContext';
import VirtualKeyboard from './components/VirtualKeyboard/VirtualKeyboard';
import { useVirtualKeyboard } from './hooks/useVirtualKeyboard';
import "./App.css";

function AppContent() {
  const { isFirstRun, loading } = useAuth();
  const { showVKB } = useVirtualKeyboard();

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '100vh',
        fontSize: '18px',
        color: 'var(--muted-foreground)',
        background: 'var(--background)'
      }}>
        Loading...
      </div>
    );
  }

  return (
    <ThemeProvider>
    <ActiveInputProvider>
      <PinChallengeProvider>
      <Router>
        <IdleLockProvider>
        {isFirstRun ? <FirstRunSetup /> : <Routes>
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
          <Route path="/care/users" element={<ProtectedRoute><Layout><AdminV2Users /></Layout></ProtectedRoute>} />
          <Route path="/care/users/add" element={<ProtectedRoute><Layout><AdminV2Users /></Layout></ProtectedRoute>} />
          <Route path="/care/users/roles" element={<ProtectedRoute><Layout><AdminV2Roles /></Layout></ProtectedRoute>} />
          <Route path="/care/medications" element={<ProtectedRoute><Layout><AdminV2Medications /></Layout></ProtectedRoute>} />
          <Route path="/care/medications/schedule" element={<ProtectedRoute><Layout><AdminV2MedicationsSchedule /></Layout></ProtectedRoute>} />
          <Route path="/care/medications/history" element={<ProtectedRoute><Layout><AdminV2MedicationsHistory /></Layout></ProtectedRoute>} />
          <Route path="/care/medications/manage" element={<ProtectedRoute><Layout><AdminV2MedicationsManage /></Layout></ProtectedRoute>} />
          <Route path="/care/care-tasks" element={<ProtectedRoute><Layout><AdminV2CareTasksOverview /></Layout></ProtectedRoute>} />
          <Route path="/care/care-tasks/manage" element={<ProtectedRoute><Layout><AdminV2CareTasks /></Layout></ProtectedRoute>} />
          <Route path="/care/care-tasks/schedule" element={<ProtectedRoute><Layout><AdminV2CareTasksSchedule /></Layout></ProtectedRoute>} />
          <Route path="/care/care-tasks/history" element={<ProtectedRoute><Layout><AdminV2CareTasksHistory /></Layout></ProtectedRoute>} />
          <Route path="/care/equipment" element={<ProtectedRoute><Layout><AdminV2Equipment /></Layout></ProtectedRoute>} />
          <Route path="/care/equipment/history" element={<ProtectedRoute><Layout><AdminV2EquipmentHistory /></Layout></ProtectedRoute>} />
          <Route path="/care/equipment/shipments" element={<ProtectedRoute><Layout><AdminV2Shipments /></Layout></ProtectedRoute>} />
          <Route path="/care/equipment/shipments/:id" element={<ProtectedRoute><Layout><AdminV2ShipmentDetail /></Layout></ProtectedRoute>} />
          <Route path="/care/equipment/alerts" element={<ProtectedRoute><Layout><AdminV2ShipmentAlerts /></Layout></ProtectedRoute>} />
          <Route path="/care/patients" element={<ProtectedRoute><Layout><AdminV2Patients /></Layout></ProtectedRoute>} />
          <Route path="/care/providers" element={<ProtectedRoute><Layout><AdminV2Providers /></Layout></ProtectedRoute>} />
          <Route path="/care/businesses" element={<ProtectedRoute><Layout><AdminV2Businesses /></Layout></ProtectedRoute>} />
          <Route path="/care/schedule" element={<ProtectedRoute><Layout><AdminV2Schedule /></Layout></ProtectedRoute>} />
          <Route path="/care/schedule/undo-log" element={<ProtectedRoute><Layout><AdminV2ScheduleUndoLog /></Layout></ProtectedRoute>} />
            
          {/* Care Vitals Routes */}
          <Route path="/care/vitals" element={<ProtectedRoute><Layout><AdminV2Vitals /></Layout></ProtectedRoute>} />
          <Route path="/care/vitals/history" element={<ProtectedRoute><Layout><AdminV2Vitals /></Layout></ProtectedRoute>} />
            
          {/* Care Symptoms Routes */}
          <Route path="/care/symptoms" element={<ProtectedRoute><Layout><AdminV2Symptoms /></Layout></ProtectedRoute>} />
          <Route path="/care/symptoms/active" element={<ProtectedRoute><Layout><AdminV2Symptoms /></Layout></ProtectedRoute>} />
          <Route path="/care/symptoms/history" element={<ProtectedRoute><Layout><AdminV2Symptoms /></Layout></ProtectedRoute>} />
            
          {/* Care Nutrition Routes */}
          <Route path="/care/nutrition" element={<ProtectedRoute><Layout><AdminV2Nutrition /></Layout></ProtectedRoute>} />
          <Route path="/care/nutrition/intake" element={<ProtectedRoute><Layout><AdminV2Nutrition /></Layout></ProtectedRoute>} />
          <Route path="/care/nutrition/output" element={<ProtectedRoute><Layout><AdminV2Nutrition /></Layout></ProtectedRoute>} />
          <Route path="/care/nutrition/schedules" element={<ProtectedRoute><Layout><AdminV2Nutrition /></Layout></ProtectedRoute>} />
          <Route path="/care/nutrition/goals" element={<ProtectedRoute><Layout><AdminV2Nutrition /></Layout></ProtectedRoute>} />
            
          {/* Care Profile Routes (Patient-specific) */}
          <Route path="/care/profile" element={<ProtectedRoute><Layout><AdminV2ProfileSummary /></Layout></ProtectedRoute>} />
          <Route path="/care/profile/providers" element={<ProtectedRoute><Layout><AdminV2Providers /></Layout></ProtectedRoute>} />
          <Route path="/care/profile/diagnoses" element={<ProtectedRoute><Layout><AdminV2Diagnoses /></Layout></ProtectedRoute>} />
          <Route path="/care/profile/implants" element={<ProtectedRoute><Layout><AdminV2Implants /></Layout></ProtectedRoute>} />
          <Route path="/care/profile/businesses" element={<ProtectedRoute><Layout><AdminV2Businesses /></Layout></ProtectedRoute>} />
          {/* Per-patient MQTT consolidated onto the patient settings page */}
          <Route path="/care/profile/mqtt" element={<Navigate to="/care/configuration/patients" replace />} />
            
          {/* Care Monitoring Routes */}
          <Route path="/care/monitoring" element={<ProtectedRoute><Layout><AdminV2Monitoring /></Layout></ProtectedRoute>} />
          <Route path="/care/monitoring/history" element={<ProtectedRoute><Layout><AdminV2Monitoring /></Layout></ProtectedRoute>} />
          <Route path="/care/monitoring/timeline" element={<ProtectedRoute><Layout><AdminV2Monitoring /></Layout></ProtectedRoute>} />
          <Route path="/care/monitoring/ventilator" element={<ProtectedRoute><Layout><AdminV2Monitoring /></Layout></ProtectedRoute>} />
          <Route path="/care/monitoring/interactions" element={<ProtectedRoute><Layout><AdminV2Monitoring /></Layout></ProtectedRoute>} />

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
          <Route path="/care/configuration/integrations" element={<ProtectedRoute><Layout><AdminV2Integrations /></Layout></ProtectedRoute>} />
          <Route path="/care/configuration/patients" element={<ProtectedRoute><Layout><AdminV2Patients /></Layout></ProtectedRoute>} />
          <Route path="/care/configuration/patients/:patientId" element={<ProtectedRoute><Layout><AdminV2PatientDetail /></Layout></ProtectedRoute>} />
          <Route path="/care/configuration/mqtt" element={<ProtectedRoute><Layout><AdminV2Mqtt /></Layout></ProtectedRoute>} />
          <Route path="/care/configuration/backup" element={<ProtectedRoute><Layout><AdminV2Backup /></Layout></ProtectedRoute>} />
          <Route path="/care/configuration/system-health" element={<ProtectedRoute><Layout><AdminV2SystemHealth /></Layout></ProtectedRoute>} />
          <Route path="/care/configuration/users" element={<ProtectedRoute><Layout><AdminV2Users /></Layout></ProtectedRoute>} />
          <Route path="/care/configuration/users/roles" element={<ProtectedRoute><Layout><AdminV2Roles /></Layout></ProtectedRoute>} />
          <Route path="/care/configuration/users/roles/:roleId" element={<ProtectedRoute><Layout><AdminV2RoleDetail /></Layout></ProtectedRoute>} />
          <Route path="/care/configuration/users/:userId" element={<ProtectedRoute><Layout><AdminV2UserDetail /></Layout></ProtectedRoute>} />

          <Route path="/care/*" element={<ProtectedRoute><Layout><AdminV2Dashboard /></Layout></ProtectedRoute>} />
        </Routes>}
        </IdleLockProvider>
      </Router>
      <VirtualKeyboard show={showVKB} />
      </PinChallengeProvider>
    </ActiveInputProvider>
    </ThemeProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
