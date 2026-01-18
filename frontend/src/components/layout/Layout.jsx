import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import logoImage from '../../assets/logo2.png';
import { AdminPatientProvider, useAdminPatient } from '../../contexts/AdminPatientContext';
import PatientSelector from '../admin/PatientSelector';
import './Layout.css';

const AdminNav = () => {
  const location = useLocation();
  const { selectedPatientId, setPatientId } = useAdminPatient();

  return (
    <nav className="admin-nav">
      <div className="admin-nav-header">
        <Link to="/" className="logo-link">
          <img src={logoImage} alt="SHH Logo" className="nav-logo" />
          <span className="nav-title">Smart Home Health</span>
        </Link>
      </div>
      
      <PatientSelector 
        selectedPatientId={selectedPatientId}
        onPatientChange={setPatientId}
      />
      
      <div className="admin-nav-links">
        <Link 
          to="/admin" 
          className={`nav-link ${location.pathname === '/admin' ? 'active' : ''}`}
        >
          Dashboard
        </Link>
        <Link 
          to="/admin/schedule" 
          className={`nav-link ${location.pathname === '/admin/schedule' ? 'active' : ''}`}
        >
          Schedule
        </Link>
        <Link 
          to="/admin/medications" 
          className={`nav-link ${location.pathname === '/admin/medications' ? 'active' : ''}`}
        >
          Medications
        </Link>
        <Link 
          to="/admin/care-tasks" 
          className={`nav-link ${location.pathname === '/admin/care-tasks' ? 'active' : ''}`}
        >
          Care Tasks
        </Link>
        <Link 
          to="/admin/equipment" 
          className={`nav-link ${location.pathname === '/admin/equipment' ? 'active' : ''}`}
        >
          Equipment
        </Link>
        <Link 
          to="/admin/providers" 
          className={`nav-link ${location.pathname === '/admin/providers' ? 'active' : ''}`}
        >
          Providers
        </Link>
        <Link 
          to="/admin/businesses" 
          className={`nav-link ${location.pathname === '/admin/businesses' ? 'active' : ''}`}
        >
          Businesses
        </Link>
        <Link 
          to="/admin/monitoring" 
          className={`nav-link ${location.pathname === '/admin/monitoring' ? 'active' : ''}`}
        >
          Monitoring
        </Link>
        <Link 
          to="/admin/settings" 
          className={`nav-link ${location.pathname === '/admin/settings' ? 'active' : ''}`}
        >
          Settings
        </Link>
      </div>
      
      <div className="admin-nav-footer">
        <Link to="/" className="back-to-dashboard">
          ← Back to Touch Dashboard
        </Link>
      </div>
    </nav>
  );
};

const Layout = ({ children }) => {
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith('/admin');
  const isAdminV2Route = location.pathname.startsWith('/admin-v2');
  
  // Admin V2 has its own layout, so just render children directly
  if (isAdminV2Route) {
    return (
      <div className="layout">
        <main className="main-content">
          {children}
        </main>
      </div>
    );
  }
  
  return (
    <div className="layout">
      {isAdminRoute ? (
        <AdminPatientProvider>
          <AdminNav />
          <main className="main-content with-nav">
            {children}
          </main>
        </AdminPatientProvider>
      ) : (
        <main className="main-content">
          {children}
        </main>
      )}
    </div>
  );
};

export default Layout;
