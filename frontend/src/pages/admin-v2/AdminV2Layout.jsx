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
  ProfileIcon,
  ConfigIcon,
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
  { path: '/care', label: 'Dashboard', Icon: DashboardIcon },
  { path: '/care/schedule', label: 'Schedule', Icon: CalendarIcon, requiredPermissions: ['medications.view', 'care_tasks.view'] },
  { path: '/care/vitals', label: 'Vitals', Icon: ClipboardListIcon, requiredPermissions: ['vitals.view', 'vitals.create'] },
  { path: '/care/symptoms', label: 'Symptoms', Icon: VirusIcon, requiredPermissions: ['vitals.view', 'vitals.create'] },
  { path: '/care/monitoring', label: 'Monitoring', Icon: MonitoringIcon, requiredPermissions: ['monitoring.view', 'monitoring.create', 'monitoring.update', 'monitoring.delete'] },
  { path: '/care/medications', label: 'Medications', Icon: MedicationsIcon, requiredPermissions: ['medications.view', 'medications.create', 'medications.update', 'medications.delete'] },
  { path: '/care/care-tasks', label: 'Care Tasks', Icon: TasksIcon, requiredPermissions: ['care_tasks.view', 'care_tasks.create', 'care_tasks.update', 'care_tasks.delete'] },
  { path: '/care/equipment', label: 'Equipment & Supplies', Icon: EquipmentIcon, requiredPermissions: ['equipment.view', 'equipment.create', 'equipment.update', 'equipment.delete'] },
  { path: '/care/nutrition', label: 'Nutrition', Icon: NutritionIcon, requiredPermissions: ['nutrition.view', 'nutrition.create', 'nutrition.update', 'nutrition.delete'] },
  { path: '/care/profile', label: 'Profile', Icon: ProfileIcon },
  { path: '/care/configuration', label: 'Configuration', Icon: ConfigIcon },
];

// Get top nav items based on current section and user permissions
const getTopNavItems = (section, hasAnyPermission) => {
  const navItems = {
    vitals: [
      { path: '/care/vitals', label: 'Record' },
      { path: '/care/vitals/history', label: 'History' },
    ],
    symptoms: [
      { path: '/care/symptoms', label: 'Log' },
      { path: '/care/symptoms/active', label: 'Active' },
      { path: '/care/symptoms/history', label: 'History' },
    ],
    medications: [
      { path: '/care/medications', label: 'Overview' },
      { path: '/care/medications/schedule', label: 'Schedule' },
      { path: '/care/medications/history', label: 'History' },
    ],
    'care-tasks': [
      { path: '/care/care-tasks', label: 'Overview' },
      { path: '/care/care-tasks/schedule', label: 'Schedule' },
      { path: '/care/care-tasks/history', label: 'History' },
    ],
    equipment: [
      { path: '/care/equipment', label: 'Overview' },
      { path: '/care/equipment/history', label: 'Change History' },
      { path: '/care/equipment/shipments', label: 'Shipments' },
      { path: '/care/equipment/alerts', label: 'Alerts' },
    ],
    nutrition: [
      { path: '/care/nutrition', label: 'Intake Log' },
      { path: '/care/nutrition/output', label: 'Output Log' },
      { path: '/care/nutrition/schedules', label: 'Schedules' },
      { path: '/care/nutrition/goals', label: 'Daily Goals' },
    ],
    monitoring: [
      { path: '/care/monitoring', label: 'Alerts' },
      { path: '/care/monitoring/history', label: 'History' },
      { path: '/care/monitoring/settings', label: 'Alert Settings' },
    ],
    profile: [
      // Patient profile sections
      { path: '/care/profile', label: 'Summary' },
      ...(hasAnyPermission(['providers.view', 'providers.create', 'providers.update', 'providers.delete']) 
        ? [{ path: '/care/profile/providers', label: 'Providers' }] : []),
      ...(hasAnyPermission(['providers.view', 'providers.create', 'providers.update', 'providers.delete', 'diagnoses.view', 'diagnoses.create', 'diagnoses.update', 'diagnoses.delete']) 
        ? [{ path: '/care/profile/diagnoses', label: 'Diagnoses' }] : []),
      ...(hasAnyPermission(['providers.view', 'providers.create', 'providers.update', 'providers.delete', 'implants.view', 'implants.create', 'implants.update', 'implants.delete']) 
        ? [{ path: '/care/profile/implants', label: 'Implants' }] : []),
      ...(hasAnyPermission(['businesses.view', 'businesses.create', 'businesses.update', 'businesses.delete']) 
        ? [{ path: '/care/profile/businesses', label: 'Businesses' }] : []),
    ],
    configuration: [
      // System-wide configuration
      { path: '/care/configuration', label: 'General' },
      { path: '/care/configuration/account', label: 'Account' },
      { path: '/care/configuration/integrations', label: 'Integrations' },
      ...(hasAnyPermission(['patients.view', 'patients.create', 'patients.update', 'patients.delete']) 
        ? [{ path: '/care/configuration/patients', label: 'Patients' }] : []),
      ...(hasAnyPermission(['users.view', 'users.create', 'users.update', 'users.delete']) 
        ? [{ path: '/care/configuration/users', label: 'Users' }] : []),
      ...(hasAnyPermission(['roles.view', 'roles.create', 'roles.update', 'roles.delete', 'users.view']) 
        ? [{ path: '/care/configuration/users/roles', label: 'Roles' }] : []),
      ...(hasAnyPermission(['roles.view', 'roles.create', 'roles.update', 'roles.delete', 'users.view']) 
        ? [{ path: '/care/configuration/users/permissions', label: 'Permissions' }] : []),
      { path: '/care/configuration/mqtt', label: 'MQTT' },
      { path: '/care/configuration/serial', label: 'Serial' },
      { path: '/care/configuration/alarms', label: 'Alarms' },
    ],
  };
  return navItems[section] || [];
};

// Get current section from path
const getCurrentSection = (pathname) => {
  const parts = pathname.split('/');
  if (parts.length >= 3) {
    return parts[2]; // e.g., 'medications' from '/care/medications/schedule'
  }
  return null;
};

const AdminV2Layout = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, logout, switchUser } = useAuth();
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
    const patientPages = ['/care/medications', '/care/care-tasks', '/care/equipment', '/care/nutrition', '/care/schedule', '/care/providers'];
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

  // Handle switch user - go back to user selection
  const handleSwitchUser = async () => {
    await switchUser();
    navigate('/select-user');
  };

  // Handle full logout
  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };
  
  const topNavItems = getTopNavItems(currentSection, hasAnyPermission);
  
  // Get URL with preserved query params for certain sections
  const getNavUrl = (path) => {
    // For medications, care-tasks, and equipment sections, preserve patient param
    if (path.startsWith('/care/medications') || path.startsWith('/care/care-tasks') || path.startsWith('/care/equipment')) {
      const patientId = searchParams.get('patient');
      if (patientId) {
        return `${path}?patient=${patientId}`;
      }
    }
    return path;
  };
  
  const isActiveLink = (path) => {
    if (path === '/care') {
      return location.pathname === '/care';
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
              <Link to="/" className="admin-v2-back-link">
                <BackArrowIcon size={14} /> Touch Dashboard
              </Link>
              <button onClick={handleSwitchUser} className="admin-v2-back-link">
                <UsersIcon size={14} /> Switch User
              </button>
              <button onClick={handleLogout} className="admin-v2-back-link admin-v2-logout-link">
                <BackArrowIcon size={14} /> Log Out
              </button>
            </>
          )}
          {sidebarCollapsed && (
            <>
              <Link to="/" className="admin-v2-back-link" title="Touch Dashboard">
                <BackArrowIcon size={14} />
              </Link>
              <button onClick={handleLogout} className="admin-v2-back-link" title="Log Out">
                <BackArrowIcon size={14} />
              </button>
            </>
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
