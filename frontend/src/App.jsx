import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/layout/Layout';
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
import AdminV2MedicationsSchedule from './pages/admin-v2/AdminV2MedicationsSchedule';
import AdminV2MedicationsHistory from './pages/admin-v2/AdminV2MedicationsHistory';
import AdminV2CareTasks from './pages/admin-v2/AdminV2CareTasks';
import AdminV2CareTasksSchedule from './pages/admin-v2/AdminV2CareTasksSchedule';
import AdminV2CareTasksHistory from './pages/admin-v2/AdminV2CareTasksHistory';
import AdminV2Equipment from './pages/admin-v2/AdminV2Equipment';
import AdminV2EquipmentHistory from './pages/admin-v2/AdminV2EquipmentHistory';
import AdminV2Patients from './pages/admin-v2/AdminV2Patients';
import AdminV2Providers from './pages/admin-v2/AdminV2Providers';
import AdminV2Businesses from './pages/admin-v2/AdminV2Businesses';
import AdminV2Schedule from './pages/admin-v2/AdminV2Schedule';
import AdminV2Vitals from './pages/admin-v2/AdminV2Vitals';
import AdminV2Symptoms from './pages/admin-v2/AdminV2Symptoms';
import AdminV2Nutrition from './pages/admin-v2/AdminV2Nutrition';
import { AdminV2SettingsGeneral } from './pages/admin-v2/settings';
import FirstRunSetup from './components/FirstRunSetup';
import LoginModal from './components/LoginModal';
import "./App.css";

function AppContent() {
  const { isFirstRun, loading, user, showAuthModal } = useAuth();

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '100vh',
        fontSize: '18px',
        color: '#718096'
      }}>
        Loading...
      </div>
    );
  }

  return (
    <>
      <Router>
        {isFirstRun && <FirstRunSetup />}
        {showAuthModal && <LoginModal />}
        <Layout>
          <Routes>
            {/* Main Dashboard Route */}
            <Route path="/" element={<Dashboard />} />
            
            {/* Admin Routes */}
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/schedule" element={<AdminSchedule />} />
            <Route path="/admin/medications" element={<AdminMedications />} />
            <Route path="/admin/care-tasks" element={<AdminCareTasks />} />
            <Route path="/admin/equipment" element={<AdminEquipment />} />
            <Route path="/admin/monitoring" element={<AdminMonitoring />} />
            <Route path="/admin/settings" element={<AdminSettings />} />
            <Route path="/admin/businesses" element={<AdminBusinesses />} />
            <Route path="/admin/providers" element={<AdminProviders />} />
            
            {/* Admin V2 Routes */}
            <Route path="/admin-v2" element={<AdminV2Dashboard />} />
            <Route path="/admin-v2/users" element={<AdminV2Users />} />
            <Route path="/admin-v2/users/add" element={<AdminV2Users />} />
            <Route path="/admin-v2/users/roles" element={<AdminV2Roles />} />
            <Route path="/admin-v2/users/permissions" element={<AdminV2Permissions />} />
            <Route path="/admin-v2/medications" element={<AdminV2Medications />} />
            <Route path="/admin-v2/medications/schedule" element={<AdminV2MedicationsSchedule />} />
            <Route path="/admin-v2/medications/history" element={<AdminV2MedicationsHistory />} />
            <Route path="/admin-v2/care-tasks" element={<AdminV2CareTasks />} />
            <Route path="/admin-v2/care-tasks/schedule" element={<AdminV2CareTasksSchedule />} />
            <Route path="/admin-v2/care-tasks/history" element={<AdminV2CareTasksHistory />} />
            <Route path="/admin-v2/equipment" element={<AdminV2Equipment />} />
            <Route path="/admin-v2/equipment/history" element={<AdminV2EquipmentHistory />} />
            <Route path="/admin-v2/patients" element={<AdminV2Patients />} />
            <Route path="/admin-v2/providers" element={<AdminV2Providers />} />
            <Route path="/admin-v2/businesses" element={<AdminV2Businesses />} />
            <Route path="/admin-v2/schedule" element={<AdminV2Schedule />} />
            
            {/* Admin V2 Vitals Routes */}
            <Route path="/admin-v2/vitals" element={<AdminV2Vitals />} />
            <Route path="/admin-v2/vitals/history" element={<AdminV2Vitals />} />
            
            {/* Admin V2 Symptoms Routes */}
            <Route path="/admin-v2/symptoms" element={<AdminV2Symptoms />} />
            <Route path="/admin-v2/symptoms/active" element={<AdminV2Symptoms />} />
            <Route path="/admin-v2/symptoms/history" element={<AdminV2Symptoms />} />
            
            {/* Admin V2 Nutrition Routes */}
            <Route path="/admin-v2/nutrition" element={<AdminV2Nutrition />} />
            <Route path="/admin-v2/nutrition/intake" element={<AdminV2Nutrition />} />
            <Route path="/admin-v2/nutrition/output" element={<AdminV2Nutrition />} />
            <Route path="/admin-v2/nutrition/schedules" element={<AdminV2Nutrition />} />
            <Route path="/admin-v2/nutrition/goals" element={<AdminV2Nutrition />} />
            
            {/* Admin V2 Settings Routes */}
            <Route path="/admin-v2/settings" element={<AdminV2SettingsGeneral />} />
            <Route path="/admin-v2/settings/patients" element={<AdminV2Patients />} />
            <Route path="/admin-v2/settings/providers" element={<AdminV2Providers />} />
            <Route path="/admin-v2/settings/businesses" element={<AdminV2Businesses />} />
            <Route path="/admin-v2/settings/users" element={<AdminV2Users />} />
            <Route path="/admin-v2/settings/users/roles" element={<AdminV2Roles />} />
            <Route path="/admin-v2/settings/users/permissions" element={<AdminV2Permissions />} />
            
            <Route path="/admin-v2/*" element={<AdminV2Dashboard />} />
          </Routes>
        </Layout>
      </Router>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
