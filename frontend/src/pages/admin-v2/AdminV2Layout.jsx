import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, Outlet, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import logoImage from '../../assets/logo2.png';
import {
  DashboardIcon,
  PatientsIcon,
  MedicationsIcon,
  TasksIcon,
  EquipmentIcon,
  NutritionIcon,
  ProvidersIcon,
  BusinessesIcon,
  MonitoringIcon,
  AdminSettingsIcon,
  BackArrowIcon,
  UsersIcon,
  CalendarIcon,
  ChevronRightIcon,
  XIcon,
  ClipboardListIcon,
  VirusIcon,
  MenuIcon
} from '../../components/Icons';
import './AdminV2.css';

// Side navigation items - main app sections
const sideNavItems = [
  { path: '/admin-v2', label: 'Dashboard', Icon: DashboardIcon },
  { path: '/admin-v2/schedule', label: 'Schedule', Icon: CalendarIcon, requiredPermissions: ['medications.view', 'care_tasks.view'] },
  { path: '/admin-v2/vitals', label: 'Vitals', Icon: ClipboardListIcon, requiredPermissions: ['vitals.view', 'vitals.create'] },
  { path: '/admin-v2/symptoms', label: 'Symptoms', Icon: VirusIcon, requiredPermissions: ['vitals.view', 'vitals.create'] },
  { path: '/admin-v2/monitoring', label: 'Monitoring', Icon: MonitoringIcon, requiredPermissions: ['monitoring.view', 'monitoring.create', 'monitoring.update', 'monitoring.delete'] },
  { path: '/admin-v2/medications', label: 'Medications', Icon: MedicationsIcon, requiredPermissions: ['medications.view', 'medications.create', 'medications.update', 'medications.delete'] },
  { path: '/admin-v2/care-tasks', label: 'Care Tasks', Icon: TasksIcon, requiredPermissions: ['care_tasks.view', 'care_tasks.create', 'care_tasks.update', 'care_tasks.delete'] },
  { path: '/admin-v2/equipment', label: 'Equipment', Icon: EquipmentIcon, requiredPermissions: ['equipment.view', 'equipment.create', 'equipment.update', 'equipment.delete'] },
  { path: '/admin-v2/nutrition', label: 'Nutrition', Icon: NutritionIcon, requiredPermissions: ['nutrition.view', 'nutrition.create', 'nutrition.update', 'nutrition.delete'] },
  { path: '/admin-v2/settings', label: 'Settings', Icon: AdminSettingsIcon },
];

// Get top nav items based on current section and user permissions
const getTopNavItems = (section, hasAnyPermission) => {
  const navItems = {
    vitals: [
      { path: '/admin-v2/vitals', label: 'Record' },
      { path: '/admin-v2/vitals/history', label: 'History' },
    ],
    symptoms: [
      { path: '/admin-v2/symptoms', label: 'Log' },
      { path: '/admin-v2/symptoms/active', label: 'Active' },
      { path: '/admin-v2/symptoms/history', label: 'History' },
    ],
    medications: [
      { path: '/admin-v2/medications', label: 'Overview' },
      { path: '/admin-v2/medications/schedule', label: 'Schedule' },
      { path: '/admin-v2/medications/history', label: 'History' },
    ],
    'care-tasks': [
      { path: '/admin-v2/care-tasks', label: 'Overview' },
      { path: '/admin-v2/care-tasks/schedule', label: 'Schedule' },
      { path: '/admin-v2/care-tasks/history', label: 'History' },
    ],
    equipment: [
      { path: '/admin-v2/equipment', label: 'Overview' },
      { path: '/admin-v2/equipment/history', label: 'History' },
    ],
    nutrition: [
      { path: '/admin-v2/nutrition', label: 'Intake Log' },
      { path: '/admin-v2/nutrition/output', label: 'Output Log' },
      { path: '/admin-v2/nutrition/schedules', label: 'Schedules' },
      { path: '/admin-v2/nutrition/goals', label: 'Daily Goals' },
    ],
    monitoring: [
      { path: '/admin-v2/monitoring', label: 'Alerts' },
      { path: '/admin-v2/monitoring/history', label: 'History' },
      { path: '/admin-v2/monitoring/settings', label: 'Alert Settings' },
    ],
    settings: [
      { path: '/admin-v2/settings', label: 'General' },
      // Data Management Section
      ...(hasAnyPermission(['patients.view', 'patients.create', 'patients.update', 'patients.delete']) 
        ? [{ path: '/admin-v2/settings/patients', label: 'Patients' }] : []),
      ...(hasAnyPermission(['providers.view', 'providers.create', 'providers.update', 'providers.delete']) 
        ? [{ path: '/admin-v2/settings/providers', label: 'Providers' }] : []),
      ...(hasAnyPermission(['businesses.view', 'businesses.create', 'businesses.update', 'businesses.delete']) 
        ? [{ path: '/admin-v2/settings/businesses', label: 'Businesses' }] : []),
      ...(hasAnyPermission(['users.view', 'users.create', 'users.update', 'users.delete']) 
        ? [{ path: '/admin-v2/settings/users', label: 'Users' }] : []),
      // Device Settings Section
      { path: '/admin-v2/settings/mqtt', label: 'MQTT' },
      { path: '/admin-v2/settings/serial', label: 'Serial' },
      { path: '/admin-v2/settings/alarms', label: 'Alarms' },
    ],
  };
  return navItems[section] || [];
};

// Get current section from path
const getCurrentSection = (pathname) => {
  const parts = pathname.split('/');
  if (parts.length >= 3) {
    return parts[2]; // e.g., 'medications' from '/admin-v2/medications/schedule'
  }
  return null;
};

const AdminV2Layout = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { patients, selectedPatient, selectPatient, loadingPatients } = useAdminPatient();
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('adminV2SidebarCollapsed');
    return saved === 'true';
  });
  const dropdownRef = useRef(null);
  const currentSection = getCurrentSection(location.pathname);
  
  // Persist sidebar state
  useEffect(() => {
    localStorage.setItem('adminV2SidebarCollapsed', sidebarCollapsed);
  }, [sidebarCollapsed]);
  
  // Toggle sidebar
  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
    setShowPatientDropdown(false);
  };
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowPatientDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Calculate age from DOB
  const calculateAge = (dob) => {
    if (!dob) return null;
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  // Get initials from patient
  const getInitials = (patient) => {
    return `${patient.first_name?.[0] || ''}${patient.last_name?.[0] || ''}`.toUpperCase();
  };

  // Handle patient selection - update context and URL if on a patient-specific page
  const handleSelectPatient = (patient) => {
    selectPatient(patient);
    setShowPatientDropdown(false);
    
    // Update URL param if we're on a page that uses patient param
    const patientPages = ['/admin-v2/medications', '/admin-v2/care-tasks', '/admin-v2/equipment', '/admin-v2/nutrition', '/admin-v2/schedule', '/admin-v2/providers'];
    const isPatientPage = patientPages.some(p => location.pathname.startsWith(p));
    if (isPatientPage && patient) {
      navigate(`${location.pathname}?patient=${patient.id}`);
    }
  };
  
  // Permission helper - check if user has any of the specified permissions
  const hasAnyPermission = (permissions) => {
    if (!user) return false;
    if (user.is_system_admin) return true;
    return permissions.some(p => user.permissions?.includes(p));
  };
  
  const topNavItems = getTopNavItems(currentSection, hasAnyPermission);
  
  // Get URL with preserved query params for certain sections
  const getNavUrl = (path) => {
    // For medications, care-tasks, and equipment sections, preserve patient param
    if (path.startsWith('/admin-v2/medications') || path.startsWith('/admin-v2/care-tasks') || path.startsWith('/admin-v2/equipment')) {
      const patientId = searchParams.get('patient');
      if (patientId) {
        return `${path}?patient=${patientId}`;
      }
    }
    return path;
  };
  
  const isActiveLink = (path) => {
    if (path === '/admin-v2') {
      return location.pathname === '/admin-v2';
    }
    return location.pathname.startsWith(path);
  };

  const isExactMatch = (path) => {
    return location.pathname === path;
  };

  return (
    <div className={`admin-v2-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {/* Side Navigation */}
      <aside className={`admin-v2-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="admin-v2-sidebar-header">
          <Link to="/" className="admin-v2-logo-link">
            <img src={logoImage} alt="SHH Logo" className="admin-v2-logo" />
            {!sidebarCollapsed && <span className="admin-v2-logo-text">Admin V2</span>}
          </Link>
          <button 
            className="admin-v2-sidebar-toggle"
            onClick={toggleSidebar}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <MenuIcon size={16} />
          </button>
        </div>

        {/* Patient Selector */}
        {!sidebarCollapsed && (
          <div className="admin-v2-patient-selector" ref={dropdownRef}>
          <button 
            className="admin-v2-patient-selector-btn"
            onClick={() => setShowPatientDropdown(!showPatientDropdown)}
          >
            {selectedPatient ? (
              <>
                <div className="admin-v2-patient-selector-avatar">
                  {getInitials(selectedPatient)}
                </div>
                <div className="admin-v2-patient-selector-details">
                  <span className="admin-v2-patient-selector-name">
                    {selectedPatient.first_name} {selectedPatient.last_name}
                  </span>
                  <span className="admin-v2-patient-selector-meta">
                    {calculateAge(selectedPatient.date_of_birth) !== null 
                      ? `Age ${calculateAge(selectedPatient.date_of_birth)}`
                      : 'Age unknown'}
                  </span>
                </div>
                <ChevronRightIcon size={16} className={`admin-v2-patient-selector-arrow ${showPatientDropdown ? 'open' : ''}`} />
              </>
            ) : (
              <>
                <div className="admin-v2-patient-selector-avatar empty">
                  <PatientsIcon size={16} />
                </div>
                <div className="admin-v2-patient-selector-details">
                  <span className="admin-v2-patient-selector-name">Select Patient</span>
                  <span className="admin-v2-patient-selector-meta">No patient selected</span>
                </div>
                <ChevronRightIcon size={16} className={`admin-v2-patient-selector-arrow ${showPatientDropdown ? 'open' : ''}`} />
              </>
            )}
          </button>

          {showPatientDropdown && (
            <div className="admin-v2-patient-dropdown">
              <div className="admin-v2-patient-dropdown-header">
                <span>Select Patient</span>
                {selectedPatient && (
                  <button 
                    className="admin-v2-patient-dropdown-clear"
                    onClick={(e) => {
                      e.stopPropagation();
                      selectPatient(null);
                      setShowPatientDropdown(false);
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="admin-v2-patient-dropdown-list">
                {loadingPatients ? (
                  <div className="admin-v2-patient-dropdown-loading">Loading...</div>
                ) : patients.filter(p => p.is_active).length === 0 ? (
                  <div className="admin-v2-patient-dropdown-empty">No patients found</div>
                ) : (
                  patients.filter(p => p.is_active).map(patient => (
                    <button
                      key={patient.id}
                      className={`admin-v2-patient-dropdown-item ${selectedPatient?.id === patient.id ? 'selected' : ''}`}
                      onClick={() => handleSelectPatient(patient)}
                    >
                      <div className="admin-v2-patient-dropdown-avatar">
                        {getInitials(patient)}
                      </div>
                      <div className="admin-v2-patient-dropdown-info">
                        <span className="name">{patient.first_name} {patient.last_name}</span>
                        <span className="age">
                          {calculateAge(patient.date_of_birth) !== null 
                            ? `Age ${calculateAge(patient.date_of_birth)}`
                            : 'Age unknown'}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
        )}
        
        {/* Collapsed Patient Avatar */}
        {sidebarCollapsed && selectedPatient && (
          <div className="admin-v2-patient-collapsed" title={`${selectedPatient.first_name} ${selectedPatient.last_name}`}>
            <div className="admin-v2-patient-selector-avatar">
              {getInitials(selectedPatient)}
            </div>
          </div>
        )}
        
        <nav className="admin-v2-sidebar-nav">
          {sideNavItems
            .filter(item => {
              // If no required permissions, show to everyone
              if (!item.requiredPermissions) return true;
              // Check if user has any of the required permissions
              return hasAnyPermission(item.requiredPermissions);
            })
            .map((item) => {
            const IconComponent = item.Icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`admin-v2-sidebar-link ${isActiveLink(item.path) ? 'active' : ''}`}
              >
                <span className="admin-v2-sidebar-icon">
                  <IconComponent size={18} />
                </span>
                <span className="admin-v2-sidebar-label">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        
        <div className="admin-v2-sidebar-footer">
          {!sidebarCollapsed && (
            <>
              <Link to="/admin" className="admin-v2-back-link">
                <BackArrowIcon size={14} /> Legacy Admin
              </Link>
              <Link to="/" className="admin-v2-back-link">
                <BackArrowIcon size={14} /> Touch Dashboard
              </Link>
            </>
          )}
          {sidebarCollapsed && (
            <Link to="/" className="admin-v2-back-link" title="Touch Dashboard">
              <BackArrowIcon size={14} />
            </Link>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="admin-v2-main">
        {/* Top Navigation - only show if section has sub-navigation */}
        {topNavItems.length > 0 && (
          <header className="admin-v2-topnav">
            <nav className="admin-v2-topnav-links">
              {topNavItems.map((item) => (
                <Link
                  key={item.path}
                  to={getNavUrl(item.path)}
                  className={`admin-v2-topnav-link ${isExactMatch(item.path) ? 'active' : ''}`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </header>
        )}
        
        {/* Page Content */}
        <main className={`admin-v2-content ${topNavItems.length > 0 ? 'with-topnav' : ''}`}>
          {children}
        </main>
      </div>
    </div>
  );
};

export default AdminV2Layout;
