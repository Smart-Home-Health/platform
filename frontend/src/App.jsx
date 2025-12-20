import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";

import Layout from "./components/layout/Layout";
import FirstRunSetup from "./components/FirstRunSetup";
import LoginModal from "./components/LoginModal";

import Dashboard from "./pages/Dashboard";

// Admin (v1)
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminSchedule from "./pages/admin/AdminSchedule";
import AdminMedications from "./pages/admin/AdminMedications";
import AdminCareTasks from "./pages/admin/AdminCareTasks";
import AdminEquipment from "./pages/admin/AdminEquipment";
import AdminMonitoring from "./pages/admin/AdminMonitoring";
import AdminSettings from "./pages/admin/AdminSettings";
import AdminBusinesses from "./pages/admin/AdminBusinesses";
import AdminProviders from "./pages/admin/AdminProviders";

// Admin (v2)
import AdminDashboardV2 from "./pages/adminv2/AdminDashboard";

import "./App.css";

// Optional: gate routes that require auth
function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null; // AppShell already shows loading UI
  if (!user) return null;   // if you want, trigger modal here instead
  return children;
}

function AppShell() {
  const { isFirstRun, loading, showAuthModal } = useAuth();

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          fontSize: "18px",
          color: "#718096",
        }}
      >
        Loading...
      </div>
    );
  }

  return (
    <>
      {isFirstRun && <FirstRunSetup />}
      {showAuthModal && <LoginModal />}

      <Routes>
        {/* Admin V2 Routes - no Layout wrapper */}
        <Route
          path="/adminv2/*"
          element={
            <RequireAuth>
              <AdminDashboardV2 />
            </RequireAuth>
          }
        />

        {/* Everything else uses Layout */}
        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          {/* Main */}
          <Route path="/" element={<Dashboard />} />

          {/* Admin (v1) */}
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/schedule" element={<AdminSchedule />} />
          <Route path="/admin/medications" element={<AdminMedications />} />
          <Route path="/admin/care-tasks" element={<AdminCareTasks />} />
          <Route path="/admin/equipment" element={<AdminEquipment />} />
          <Route path="/admin/monitoring" element={<AdminMonitoring />} />
          <Route path="/admin/settings" element={<AdminSettings />} />
          <Route path="/admin/businesses" element={<AdminBusinesses />} />
          <Route path="/admin/providers" element={<AdminProviders />} />
        </Route>
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <AppShell />
      </Router>
    </AuthProvider>
  );
}
