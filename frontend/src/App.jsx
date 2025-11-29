import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
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
import "./App.css";

export default function App() {
  return (
    <Router>
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
        </Routes>
      </Layout>
    </Router>
  );
}
