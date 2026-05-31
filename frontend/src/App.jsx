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
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminSchedule from './pages/admin/AdminSchedule';
import AdminMedications from './pages/admin/AdminMedications';
import AdminCareTasks from './pages/admin/AdminCareTasks';
import AdminEquipment from './pages/admin/AdminEquipment';
import AdminMonitoring from './pages/admin/AdminMonitoring';
import AdminSettings from './pages/admin/AdminSettings';
import AdminBusinesses from './pages/admin/AdminBusinesses';
import AdminProviders from './pages/admin/AdminProviders';
import AdminV2Dashboard from './pages/admin-v2/AdminV2Dashboard';
import AdminV2Users from './pages/admin-v2/AdminV2Users';
import AdminV2Roles from './pages/admin-v2/AdminV2Roles';
import AdminV2Permissions from './pages/admin-v2/AdminV2Permissions';
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
import AdminV2Providers from './pages/admin-v2/AdminV2Providers';
import AdminV2Businesses from './pages/admin-v2/AdminV2Businesses';
import AdminV2Schedule from './pages/admin-v2/AdminV2Schedule';
import AdminV2Vitals from './pages/admin-v2/AdminV2Vitals';
import AdminV2Symptoms from './pages/admin-v2/AdminV2Symptoms';
import AdminV2Diagnoses from './pages/admin-v2/AdminV2Diagnoses';
import AdminV2Implants from './pages/admin-v2/AdminV2Implants';
import AdminV2Nutrition from './pages/admin-v2/AdminV2Nutrition';
import AdminV2ProfileSummary from './pages/admin-v2/AdminV2ProfileSummary';
import AdminV2Monitoring from './pages/admin-v2/AdminV2Monitoring';
import AdminV2Reports from './pages/admin-v2/AdminV2Reports';
import AdminV2ReportsOvernight from './pages/admin-v2/AdminV2ReportsOvernight';
import AdminV2ReportsWeekly from './pages/admin-v2/AdminV2ReportsWeekly';
import AdminV2AccountSettings from './pages/admin-v2/AdminV2AccountSettings';
import AdminV2Backup from './pages/admin-v2/AdminV2Backup';
import AdminV2Integrations from './pages/admin-v2/AdminV2Integrations';
import AdminV2Mqtt from './pages/admin-v2/AdminV2Mqtt';
import AdminV2ProfileMqtt from './pages/admin-v2/AdminV2ProfileMqtt';
import { AdminV2SettingsGeneral } from './pages/admin-v2/settings';
import FirstRunSetup from './components/FirstRunSetup';
import { ActiveInputProvider } from './contexts/ActiveInputContext';
import { PinChallengeProvider } from './contexts/PinChallengeContext';
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
        color: '#718096',
        background: '#1a1f2e'
      }}>
        Loading...
      </div>
    );
  }

  return (
    <ActiveInputProvider>
      <PinChallengeProvider>
      <Router>
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
                <Dashboard />
              </Layout>
            </ProtectedRoute>
          } />
          
          {/* Admin Routes - Protected */}
          <Route path="/admin" element={<ProtectedRoute><Layout><AdminDashboard /></Layout></ProtectedRoute>} />
          <Route path="/admin/schedule" element={<ProtectedRoute><Layout><AdminSchedule /></Layout></ProtectedRoute>} />
          <Route path="/admin/medications" element={<ProtectedRoute><Layout><AdminMedications /></Layout></ProtectedRoute>} />
          <Route path="/admin/care-tasks" element={<ProtectedRoute><Layout><AdminCareTasks /></Layout></ProtectedRoute>} />
          <Route path="/admin/equipment" element={<ProtectedRoute><Layout><AdminEquipment /></Layout></ProtectedRoute>} />
          <Route path="/admin/monitoring" element={<ProtectedRoute><Layout><AdminMonitoring /></Layout></ProtectedRoute>} />
          <Route path="/admin/settings" element={<ProtectedRoute><Layout><AdminSettings /></Layout></ProtectedRoute>} />
          <Route path="/admin/businesses" element={<ProtectedRoute><Layout><AdminBusinesses /></Layout></ProtectedRoute>} />
          <Route path="/admin/providers" element={<ProtectedRoute><Layout><AdminProviders /></Layout></ProtectedRoute>} />
            
          {/* Care Routes - Protected */}
          <Route path="/care" element={<ProtectedRoute><Layout><AdminV2Dashboard /></Layout></ProtectedRoute>} />
          <Route path="/care/users" element={<ProtectedRoute><Layout><AdminV2Users /></Layout></ProtectedRoute>} />
          <Route path="/care/users/add" element={<ProtectedRoute><Layout><AdminV2Users /></Layout></ProtectedRoute>} />
          <Route path="/care/users/roles" element={<ProtectedRoute><Layout><AdminV2Roles /></Layout></ProtectedRoute>} />
          <Route path="/care/users/permissions" element={<ProtectedRoute><Layout><AdminV2Permissions /></Layout></ProtectedRoute>} />
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
          <Route path="/care/profile/mqtt" element={<ProtectedRoute><Layout><AdminV2ProfileMqtt /></Layout></ProtectedRoute>} />
            
          {/* Care Monitoring Routes */}
          <Route path="/care/monitoring" element={<ProtectedRoute><Layout><AdminV2Monitoring /></Layout></ProtectedRoute>} />
          <Route path="/care/monitoring/history" element={<ProtectedRoute><Layout><AdminV2Monitoring /></Layout></ProtectedRoute>} />
          <Route path="/care/monitoring/timeline" element={<ProtectedRoute><Layout><AdminV2Monitoring /></Layout></ProtectedRoute>} />
          <Route path="/care/monitoring/ventilator" element={<ProtectedRoute><Layout><AdminV2Monitoring /></Layout></ProtectedRoute>} />
          <Route path="/care/monitoring/interactions" element={<ProtectedRoute><Layout><AdminV2Monitoring /></Layout></ProtectedRoute>} />
          <Route path="/care/monitoring/settings" element={<ProtectedRoute><Layout><AdminV2Monitoring /></Layout></ProtectedRoute>} />

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
          <Route path="/care/configuration/mqtt" element={<ProtectedRoute><Layout><AdminV2Mqtt /></Layout></ProtectedRoute>} />
          <Route path="/care/configuration/backup" element={<ProtectedRoute><Layout><AdminV2Backup /></Layout></ProtectedRoute>} />
          <Route path="/care/configuration/users" element={<ProtectedRoute><Layout><AdminV2Users /></Layout></ProtectedRoute>} />
          <Route path="/care/configuration/users/roles" element={<ProtectedRoute><Layout><AdminV2Roles /></Layout></ProtectedRoute>} />
          <Route path="/care/configuration/users/permissions" element={<ProtectedRoute><Layout><AdminV2Permissions /></Layout></ProtectedRoute>} />
            
          <Route path="/care/*" element={<ProtectedRoute><Layout><AdminV2Dashboard /></Layout></ProtectedRoute>} />
        </Routes>}
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
