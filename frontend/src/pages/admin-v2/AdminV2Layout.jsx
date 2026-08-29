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
import { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import {
  DashboardIcon,
  PatientsIcon,
  MedicationsIcon,
  TasksIcon,
  EquipmentIcon,
  NutritionIcon,
  MonitoringIcon,
  ProfileIcon,
  ConfigIcon,
  BackArrowIcon,
  UsersIcon,
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  XIcon,
  ClipboardListIcon,
  VirusIcon,
  MenuIcon,
  BarChartIcon,
  MessagesIcon
} from '../../components/Icons';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import './AdminV2.css';
import './admin-nav.css'; // grouped-nav structure (both themes)
// Bedside-monitor skin (dark theme only) + its fonts (shared entry, deduped
// with the capture surface). Loaded after AdminV2.css so overrides win.
import '../../styles/vcFonts';
import './vc-shell.css';
import './vc-content.css';
import './vc-forms.css';
import ConnectionChip from '../../components/ConnectionChip';
import PersonAvatar from '../../components/vc/PersonAvatar';
import useConnectionStatus from '../../hooks/useConnectionStatus';

// Side navigation, grouped into labeled sections (mockup: Overview /
// Clinical / Care / Records / Account). The flat list is derived below for
// active-label and permission-filtering logic.
const sideNavGroups = [
  {
    label: 'Overview',
    items: [
      { path: '/care', label: 'Dashboard', Icon: DashboardIcon },
      { path: '/care/schedule', label: 'Schedule', Icon: CalendarIcon, requiredPermissions: ['medications.read', 'care_tasks.read'] },
    ],
  },
  {
    label: 'Clinical',
    items: [
      { path: '/care/vitals', label: 'Vitals', Icon: ClipboardListIcon, requiredPermissions: ['vitals.read', 'vitals.create'] },
      { path: '/care/symptoms', label: 'Symptoms', Icon: VirusIcon, requiredPermissions: ['vitals.read', 'vitals.create'] },
      { path: '/care/monitoring', label: 'Monitoring', Icon: MonitoringIcon, requiredPermissions: ['monitoring.read', 'monitoring.create', 'monitoring.update', 'monitoring.delete'] },
    ],
  },
  {
    label: 'Care',
    items: [
      { path: '/care/medications', label: 'Medications', Icon: MedicationsIcon, requiredPermissions: ['medications.read', 'medications.create', 'medications.update', 'medications.delete'] },
      { path: '/care/nutrition', label: 'Nutrition', Icon: NutritionIcon, requiredPermissions: ['nutrition.read', 'nutrition.create', 'nutrition.update', 'nutrition.delete'] },
      { path: '/care/care-tasks', label: 'Care Tasks', Icon: TasksIcon, requiredPermissions: ['care_tasks.read', 'care_tasks.create', 'care_tasks.update', 'care_tasks.delete'] },
      { path: '/care/equipment', label: 'Equipment', Icon: EquipmentIcon, requiredPermissions: ['equipment.read', 'equipment.create', 'equipment.update', 'equipment.delete'] },
    ],
  },
  {
    label: 'Records',
    items: [
      { path: '/care/messages', label: 'Messages', Icon: MessagesIcon },
      { path: '/care/reports', label: 'Reports', Icon: BarChartIcon, requiredPermissions: ['vitals.read'] },
    ],
  },
  {
    label: 'Account',
    items: [
      { path: '/care/profile', label: 'Profile', Icon: ProfileIcon },
      { path: '/care/configuration', label: 'Configuration', Icon: ConfigIcon, systemAdminOnly: true },
    ],
  },
];
const sideNavItems = sideNavGroups.flatMap((g) => g.items);

// Get top nav items based on current section, permissions, and read access (restricted mode hides History/Active)
const getTopNavItems = (section, hasAnyPermission, hasReadAccess, isSystemAdmin) => {
  const navItems = {
    schedule: [
      { path: '/care/schedule', label: 'Schedule' },
      // Undo Log is an audit view — only surface it to users with audit access.
      ...(hasAnyPermission(['audit.read'])
        ? [{ path: '/care/schedule/undo-log', label: 'Undo' }] : []),
    ],
    vitals: hasReadAccess
      ? [
          { path: '/care/vitals', label: 'Record' },
          { path: '/care/vitals/history', label: 'History' },
        ]
      : [{ path: '/care/vitals', label: 'Record' }],
    symptoms: hasReadAccess
      ? [
          { path: '/care/symptoms', label: 'Log' },
          { path: '/care/symptoms/active', label: 'Active' },
          { path: '/care/symptoms/history', label: 'History' },
        ]
      : [{ path: '/care/symptoms', label: 'Log' }],
    medications: [
      { path: '/care/medications', label: 'Overview' },
      { path: '/care/medications/schedule', label: 'Schedule' },
      { path: '/care/medications/manage', label: 'Manage' },
      ...(hasAnyPermission(['audit.read'])
        ? [{ path: '/care/schedule/undo-log', label: 'Undo' }] : []),
    ],
    'care-tasks': [
      { path: '/care/care-tasks', label: 'Overview' },
      { path: '/care/care-tasks/manage', label: 'Tasks' },
      { path: '/care/care-tasks/schedule', label: 'Schedule' },
      ...(hasAnyPermission(['audit.read'])
        ? [{ path: '/care/schedule/undo-log', label: 'Undo' }] : []),
    ],
    equipment: [
      { path: '/care/equipment', label: 'Overview' },
      { path: '/care/equipment/history', label: 'History' },
      { path: '/care/equipment/shipments', label: 'Deliveries' },
      { path: '/care/equipment/inventory', label: 'Supplies' },
      { path: '/care/equipment/alerts', label: 'Alerts' },
    ],
    nutrition: [
      { path: '/care/nutrition', label: 'Overview' },
      { path: '/care/nutrition/schedule', label: 'Schedule' },
      { path: '/care/nutrition/plan', label: 'Plan' },
      { path: '/care/nutrition/items', label: 'Items' },
      ...(hasAnyPermission(['audit.read'])
        ? [{ path: '/care/schedule/undo-log', label: 'Undo' }] : []),
    ],
    monitoring: [
      { path: '/care/monitoring', label: 'Alerts' },
      { path: '/care/monitoring/history', label: 'History' },
      { path: '/care/monitoring/timeline', label: 'Timeline' },
      { path: '/care/monitoring/ventilator', label: 'Ventilator' },
      { path: '/care/monitoring/interactions', label: 'Interactions' },
      { path: '/care/monitoring/environment', label: 'Environment' },
    ],
    reports: [
      { path: '/care/reports', label: 'Day over Day' },
      { path: '/care/reports/overnight', label: 'Overnight' },
      { path: '/care/reports/weekly', label: 'Weekly Summary' },
    ],
    profile: [
      // Patient profile sections
      { path: '/care/profile', label: 'Summary' },
      ...(hasAnyPermission(['providers.read', 'providers.create', 'providers.update', 'providers.delete'])
        ? [{ path: '/care/profile/providers', label: 'Providers' }] : []),
      ...(hasAnyPermission(['providers.read', 'providers.create', 'providers.update', 'providers.delete', 'diagnoses.read', 'diagnoses.create', 'diagnoses.update', 'diagnoses.delete'])
        ? [{ path: '/care/profile/diagnoses', label: 'Diagnoses' }] : []),
      ...(hasAnyPermission(['providers.read', 'providers.create', 'providers.update', 'providers.delete', 'implants.read', 'implants.create', 'implants.update', 'implants.delete'])
        ? [{ path: '/care/profile/implants', label: 'Implants' }] : []),
      ...(hasAnyPermission(['businesses.read', 'businesses.create', 'businesses.update', 'businesses.delete'])
        ? [{ path: '/care/profile/businesses', label: 'Businesses' }] : []),
      ...(isSystemAdmin
        ? [{ path: '/care/profile/connections', label: 'Connections' }] : []),
    ],
    configuration: [
      // System-wide configuration
      { path: '/care/configuration', label: 'General' },
      ...(isSystemAdmin
        ? [{ path: '/care/configuration/account', label: 'Account' }] : []),
      // Care profiles, users and roles are one Directory page with three
      // tabbed routes; the tab bar entry points at the first one the user can
      // read, and stays lit on any of them.
      ...(hasAnyPermission([
        'patients.read', 'patients.create', 'patients.update', 'patients.delete',
        'users.read', 'users.create', 'users.update', 'users.delete',
        'roles.read', 'roles.create', 'roles.update', 'roles.delete',
      ])
        ? [{
          path: hasAnyPermission(['patients.read', 'patients.create', 'patients.update', 'patients.delete'])
            ? '/care/configuration/patients'
            : hasAnyPermission(['users.read', 'users.create', 'users.update', 'users.delete'])
              ? '/care/configuration/users'
              : '/care/configuration/users/roles',
          label: 'Directory',
          matchPaths: [
            '/care/configuration/patients',
            '/care/configuration/users',
          ],
        }] : []),
      { path: '/care/configuration/mqtt', label: 'MQTT' },
      { path: '/care/configuration/home-assistant', label: 'Home Assistant' },
      { path: '/care/configuration/environment', label: 'Environment' },
      ...(isSystemAdmin
        ? [{ path: '/care/configuration/backup', label: 'Backup' }] : []),
      ...(isSystemAdmin
        ? [{ path: '/care/configuration/security', label: 'Security' }] : []),
      ...(isSystemAdmin
        ? [{ path: '/care/configuration/system-health', label: 'System' }] : []),
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

const RESTRICTED_NAV_PATHS = ['/care', '/care/schedule', '/care/vitals', '/care/symptoms'];

const AdminV2Layout = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, logout, switchUser, hasReadAccess, unlockWithAccountPassword } = useAuth();
  const connection = useConnectionStatus();
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [unlockLoading, setUnlockLoading] = useState(false);
  const { patients, selectedPatient, selectPatient, loadingPatients } = useAdminPatient();
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('adminV2SidebarCollapsed');
    return saved === 'true';
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const dropdownRef = useRef(null);
  const topNavRef = useRef(null);
  const currentSection = getCurrentSection(location.pathname);

  // Detect mobile viewport
  useEffect(() => {
    const m = window.matchMedia('(max-width: 768px)');
    const update = () => setIsMobile(m.matches);
    update();
    m.addEventListener('change', update);
    return () => m.removeEventListener('change', update);
  }, []);

  // Persist sidebar state (desktop only)
  useEffect(() => {
    if (!isMobile) localStorage.setItem('adminV2SidebarCollapsed', sidebarCollapsed);
  }, [sidebarCollapsed, isMobile]);

  // Toggle sidebar (desktop: collapse/expand; mobile: open/close drawer)
  const toggleSidebar = () => {
    if (isMobile) {
      setMobileMenuOpen((open) => !open);
      setShowPatientDropdown(false);
    } else {
      setSidebarCollapsed(!sidebarCollapsed);
      setShowPatientDropdown(false);
    }
  };

  const closeMobileMenu = () => {
    if (isMobile) setMobileMenuOpen(false);
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

  // Handle patient selection - update context and URL if on a patient-specific page
  const handleSelectPatient = (patient) => {
    selectPatient(patient);
    setShowPatientDropdown(false);
    closeMobileMenu();
    
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
  
  const topNavItems = getTopNavItems(currentSection, hasAnyPermission, hasReadAccess, user?.is_system_admin);

  // Keep the active top-nav item centered in its (horizontally scrollable) track
  // when the route changes, instead of leaving the track scrolled to the start.
  useEffect(() => {
    const nav = topNavRef.current;
    if (!nav) return;
    const active = nav.querySelector('.admin-v2-topnav-link.active');
    if (!active) return;
    const navRect = nav.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const delta = (activeRect.left - navRect.left) - (nav.clientWidth - active.clientWidth) / 2;
    nav.scrollBy({ left: delta, behavior: 'smooth' });
  }, [location.pathname, topNavItems.length]);

  // vc form skin (vc-forms.css) applies to the whole admin. It used to be an
  // opt-in allowlist of routes while the rebuild rolled out, which left every
  // un-listed section on stock shadcn geometry and the stock red destructive —
  // the colours were already right everywhere (vc-content.css remaps the .tw
  // islands globally), only the shape and typography stopped at the list.
  //
  // This layout is mounted by every /care page, so binding the class to its
  // lifetime scopes the skin to the admin exactly. It goes on <body> rather
  // than the page wrapper so it also reaches Radix's portalled Select/Dialog
  // content, which renders outside the page tree.
  useEffect(() => {
    document.body.classList.add('vc-form-skin');
    return () => document.body.classList.remove('vc-form-skin');
  }, []);

  // Chevron scroll hints: shown at whichever edge has more tabs off-screen.
  const [navScroll, setNavScroll] = useState({ left: false, right: false });
  useEffect(() => {
    const nav = topNavRef.current;
    if (!nav) return undefined;
    const update = () => setNavScroll({
      left: nav.scrollLeft > 2,
      right: nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 2,
    });
    update();
    nav.addEventListener('scroll', update, { passive: true });
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(nav);
    return () => {
      nav.removeEventListener('scroll', update);
      resizeObserver.disconnect();
    };
  }, [topNavItems.length]);

  const nudgeTopNav = (direction) => {
    const nav = topNavRef.current;
    if (nav) nav.scrollBy({ left: direction * nav.clientWidth * 0.6, behavior: 'smooth' });
  };

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

  // A top-nav entry that fronts several routes (Directory) stays lit on all of
  // them, including their detail pages.
  const isTopNavActive = (item) => (item.matchPaths
    ? item.matchPaths.some((p) => location.pathname.startsWith(p))
    : isExactMatch(item.path));

  const visibleNavItems = (hasReadAccess
    ? sideNavItems.filter(item => {
        if (!item.requiredPermissions) return true;
        return hasAnyPermission(item.requiredPermissions);
      })
    : sideNavItems.filter(item => RESTRICTED_NAV_PATHS.includes(item.path))
        .filter(item => {
          if (!item.requiredPermissions) return true;
          return hasAnyPermission(item.requiredPermissions);
        })
  ).filter(item => !item.systemAdminOnly || user?.is_system_admin);

  // Grouped view of the same visible set; groups with no visible items vanish.
  const visibleNavGroups = sideNavGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => visibleNavItems.includes(item)),
    }))
    .filter((group) => group.items.length > 0);

  const handleUnlockSubmit = async (e) => {
    e.preventDefault();
    setUnlockError('');
    setUnlockLoading(true);
    const result = await unlockWithAccountPassword(unlockPassword);
    setUnlockLoading(false);
    if (result.success) {
      setShowUnlockModal(false);
      setUnlockPassword('');
    } else {
      setUnlockError(result.error || 'Invalid password');
    }
  };

  const activeNavLabel = visibleNavItems.find((item) => isActiveLink(item.path))?.label || 'Dashboard';
  const activeSubNavLabel = topNavItems.find((item) => isTopNavActive(item))?.label || null;

  return (
    <div className={`admin-v2-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${mobileMenuOpen ? 'mobile-menu-open' : ''}`}>
      {/* Mobile overlay - closes drawer when tapping outside */}
      <div
        className="admin-v2-sidebar-overlay"
        aria-hidden={!mobileMenuOpen}
        onClick={closeMobileMenu}
      />

      {/* Side Navigation - drawer on mobile, sidebar on desktop */}
      <aside className={`admin-v2-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        {/* Mobile drawer header (hidden on desktop): labeled CLOSE + breadcrumb */}
        <div className="admin-v2-drawer-header">
          <button
            type="button"
            className="admin-v2-drawer-close"
            onClick={closeMobileMenu}
            aria-label="Close navigation"
          >
            <XIcon size={20} />
            <span className="admin-v2-drawer-close-caption">Close</span>
          </button>
          <span className="admin-v2-drawer-title">
            SHH <span className="admin-v2-drawer-title-sep">/</span> Navigation
          </span>
        </div>

        <div className="admin-v2-sidebar-header">
          <Link to="/" className="admin-v2-logo-link">
            {!sidebarCollapsed ? (
              <>
                <span className="admin-v2-logo-text admin-v2-logo-full">Smart Home Health</span>
                <span className="admin-v2-logo-text admin-v2-logo-short">SHH</span>
              </>
            ) : (
              <span className="admin-v2-logo-text">SHH</span>
            )}
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
                <PersonAvatar kind="patient" id={selectedPatient.id} seed={selectedPatient.avatar_seed}
                              photo={selectedPatient.avatar_photo} size={36} decorative />
                <div className="admin-v2-patient-selector-details">
                  <span className="admin-v2-patient-selector-name">
                    {selectedPatient.first_name} {selectedPatient.last_name}
                  </span>
                  <span className="admin-v2-patient-selector-meta">
                    {calculateAge(selectedPatient.date_of_birth) !== null
                      ? `Age ${calculateAge(selectedPatient.date_of_birth)}`
                      : 'Age unknown'}
                  </span>
                  <span className={`admin-v2-patient-selector-status ${selectedPatient.is_active ? 'active' : ''}`}>
                    {selectedPatient.is_active ? 'Care plan active' : 'Inactive'}
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
                      <PersonAvatar kind="patient" id={patient.id} seed={patient.avatar_seed}
                                    photo={patient.avatar_photo} size={32} decorative />
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
            <PersonAvatar kind="patient" id={selectedPatient.id} seed={selectedPatient.avatar_seed}
                          photo={selectedPatient.avatar_photo} size={36}
                          name={`${selectedPatient.first_name} ${selectedPatient.last_name}`} />
          </div>
        )}
        
        <nav className="admin-v2-sidebar-nav">
          {visibleNavGroups.map((group) => (
            <div key={group.label} className="admin-v2-nav-group">
              <span className="admin-v2-nav-group-label">{group.label}</span>
              <div className="admin-v2-nav-group-items">
                {group.items.map((item) => {
                  const IconComponent = item.Icon;
                  return (
                    <Link
                      key={item.path}
                      to={getNavUrl(item.path)}
                      className={`admin-v2-sidebar-link ${isActiveLink(item.path) ? 'active' : ''}`}
                      onClick={closeMobileMenu}
                    >
                      <span className="admin-v2-sidebar-icon">
                        <IconComponent size={18} />
                      </span>
                      <span className="admin-v2-sidebar-label">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        
        <div className="admin-v2-sidebar-footer">
          {(!sidebarCollapsed || isMobile) && (
            <>
              <button onClick={() => { closeMobileMenu(); handleSwitchUser(); }} className="admin-v2-back-link">
                <UsersIcon size={14} /> Switch User
              </button>
              <button onClick={() => { closeMobileMenu(); handleLogout(); }} className="admin-v2-back-link admin-v2-logout-link">
                <BackArrowIcon size={14} /> Log Out
              </button>
            </>
          )}
          {sidebarCollapsed && !isMobile && (
            <>
              <button onClick={handleLogout} className="admin-v2-back-link" title="Log Out">
                <BackArrowIcon size={14} />
              </button>
            </>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="admin-v2-main">
        {/* Pinned top: mobile header + restricted banner + sub-nav stay fixed while content scrolls.
            Grouped in one sticky container so they never overlap each other (two sibling
            sticky bars would collide at top:0 and one would hide the other). */}
        <div className="admin-v2-pinned-top">
          {/* Mobile header - labeled NAV button, section + patient context,
              live connection chip (visible only on small screens) */}
          <header className="admin-v2-mobile-header">
            <button
              type="button"
              className="admin-v2-mobile-menu-btn"
              onClick={toggleSidebar}
              aria-label="Open navigation"
            >
              <MenuIcon size={20} />
              <span className="admin-v2-mobile-menu-caption">Nav</span>
            </button>
            <div className="admin-v2-mobile-header-titles">
              <span className="admin-v2-mobile-header-title">{activeNavLabel}</span>
              {(selectedPatient || activeSubNavLabel) && (
                <span className="admin-v2-mobile-header-sub">
                  {[selectedPatient && `${selectedPatient.first_name} ${selectedPatient.last_name}`,
                    activeSubNavLabel]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              )}
            </div>
            <ConnectionChip connection={connection} stacked />
          </header>

          {/* Restricted mode banner */}
          {!hasReadAccess && (
            <div className="admin-v2-restricted-banner">
              <span className="admin-v2-restricted-text">Restricted mode — You can only log and record. Enter account password to view data.</span>
              <button type="button" className="admin-v2-unlock-btn" onClick={() => setShowUnlockModal(true)}>
                Unlock
              </button>
            </div>
          )}

          {/* Top Navigation - only show if section has sub-navigation */}
          {topNavItems.length > 0 && (
            <header className="admin-v2-topnav">
              {navScroll.left && (
                <button type="button" className="admin-v2-topnav-scroll-hint left"
                        aria-label="Scroll sections left" onClick={() => nudgeTopNav(-1)}>
                  <ChevronLeftIcon size={16} />
                </button>
              )}
              <nav className="admin-v2-topnav-links" ref={topNavRef}>
                {topNavItems.map((item) => (
                  <Link
                    key={item.path}
                    to={getNavUrl(item.path)}
                    className={`admin-v2-topnav-link ${isTopNavActive(item) ? 'active' : ''}`}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
              {navScroll.right && (
                <button type="button" className="admin-v2-topnav-scroll-hint right"
                        aria-label="Scroll sections right" onClick={() => nudgeTopNav(1)}>
                  <ChevronRightIcon size={16} />
                </button>
              )}
            </header>
          )}
        </div>

        {/* Unlock modal */}
        <Dialog open={showUnlockModal} onOpenChange={(o) => { if (!o && !unlockLoading) setShowUnlockModal(false); }}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle>Unlock read access</DialogTitle>
              <DialogDescription>Enter account password to view data.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleUnlockSubmit} className="flex flex-col gap-3">
              {unlockError && <Alert variant="destructive">{unlockError}</Alert>}
              <Input
                type="password"
                value={unlockPassword}
                onChange={e => setUnlockPassword(e.target.value)}
                placeholder="Account password"
                autoFocus
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => !unlockLoading && setShowUnlockModal(false)}
                  disabled={unlockLoading}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={unlockLoading}>
                  {unlockLoading ? 'Unlocking...' : 'Unlock'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Page Content */}
        <main className={`admin-v2-content ${topNavItems.length > 0 ? 'with-topnav' : ''}`}>
          {children}
        </main>
      </div>
    </div>
  );
};

export default AdminV2Layout;
