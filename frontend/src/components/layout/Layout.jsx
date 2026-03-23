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
        <Link to="/live" className="logo-link">
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
        <Link to="/care" className="back-to-dashboard">
          ← Care Dashboard
        </Link>
      </div>
    </nav>
  );
};

const Layout = ({ children }) => {
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith('/admin');
  const isCareRoute = location.pathname.startsWith('/care');
  const isLiveRoute = location.pathname.startsWith('/live');
  
  // Care routes have their own layout, but need the patient provider
  if (isCareRoute || isLiveRoute) {
    return (
      <AdminPatientProvider>
        <div className="layout">
          <main className="main-content">
            {children}
          </main>
        </div>
      </AdminPatientProvider>
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
