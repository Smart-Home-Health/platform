import React, { createContext, useContext, useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  // Two-layer auth state
  const [account, setAccount] = useState(null);  // Layer 1: Account
  const [user, setUser] = useState(null);         // Layer 2: User
  const [authLevel, setAuthLevel] = useState(null); // "account" | "full" | null
  const [readRestricted, setReadRestricted] = useState(false); // true = add/chart only, no read

  const [isFirstRun, setIsFirstRun] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Check first-run status and session on mount
  useEffect(() => {
    checkFirstRunAndSession();
  }, []);

  const checkFirstRunAndSession = async () => {
    try {
      // Check if first run
      const firstRunRes = await fetch(`${API_BASE_URL}/api/auth/first-run`, {
        credentials: 'include'
      });
      const firstRunData = await firstRunRes.json();
      
      if (firstRunData.is_first_run) {
        setIsFirstRun(true);
        setLoading(false);
        return;
      }

      // Check existing session
      const sessionRes = await fetch(`${API_BASE_URL}/api/auth/session`, {
        credentials: 'include'
      });

      if (sessionRes.ok) {
        const sessionData = await sessionRes.json();
        setReadRestricted(!!sessionData.read_restricted);

        // Determine auth level from session
        if (sessionData.user_id) {
          // Full auth - both account and user
          setUser({
            id: sessionData.user_id,
            username: sessionData.username,
            full_name: sessionData.full_name,
            is_system_admin: sessionData.is_system_admin || false,
            roles: sessionData.roles || [],
            permissions: sessionData.permissions || []
          });
          
          // Get account info if available
          if (sessionData.account_id) {
            setAccount({ id: sessionData.account_id });
          }
          
          setAuthLevel('full');
          setShowAuthModal(false);
        } else if (sessionData.account_id) {
          // Account-level auth only
          setAccount({ id: sessionData.account_id });
          setAuthLevel('account');
          setUser(null);
          // Don't show auth modal - user needs to select a profile
        } else {
          // No auth
          setAccount(null);
          setUser(null);
          setAuthLevel(null);
          setShowAuthModal(true);
        }
      } else {
        // No active session
        setAccount(null);
        setUser(null);
        setAuthLevel(null);
        setReadRestricted(false);
        setShowAuthModal(true);
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
      setAccount(null);
      setUser(null);
      setAuthLevel(null);
      setReadRestricted(false);
      setShowAuthModal(true);
    } finally {
      setLoading(false);
    }
  };

  // Layer 1: Account login
  const accountLogin = async (slug, password) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/account/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ slug, password })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.detail || 'Account login failed');
      }

      const data = await res.json();
      
      // Small delay to ensure cookie is fully set
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Set account-level auth
      setAccount(data.account);
      setAuthLevel('account');
      setUser(null); // Clear any previous user
      setReadRestricted(!!data.read_restricted);
      setShowAuthModal(false);

      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  // Account access: password only (single account). Omit password for restricted (add/chart only).
  const accountAccess = async (password = null) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/account/access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password: password && password.trim() ? password : null })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.detail || 'Account access failed');
      }

      const data = await res.json();
      await new Promise(resolve => setTimeout(resolve, 100));

      setAccount(data.account);
      setAuthLevel('account');
      setUser(null);
      setReadRestricted(!!data.read_restricted);
      setShowAuthModal(false);

      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  // Unlock read access with account password (when already in restricted session)
  const unlockWithAccountPassword = async (password) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/account/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.detail || 'Invalid account password');
      }

      await new Promise(resolve => setTimeout(resolve, 100));
      setReadRestricted(false);
      await checkFirstRunAndSession();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  // Get users for current account
  const getAccountUsers = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/account/users`, {
        credentials: 'include'
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.detail || 'Failed to get users');
      }

      return await res.json();
    } catch (error) {
      console.error('Error getting account users:', error);
      return [];
    }
  };

  // Layer 2: User selection
  const selectUser = async (userId, pin = null, password = null) => {
    try {
      const body = { user_id: userId };
      if (pin) body.pin = pin;
      if (password) body.password = password;

      const res = await fetch(`${API_BASE_URL}/api/auth/user/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.detail || 'User selection failed');
      }

      const data = await res.json();
      
      if (data.requires_full_password) {
        return { success: false, requiresPassword: true };
      }

      // Small delay to ensure cookie is fully set
      await new Promise(resolve => setTimeout(resolve, 100));

      // Set full auth (include read_restricted from backend)
      setAccount(data.account);
      setUser({
        id: data.user.id,
        username: data.user.username,
        full_name: data.user.full_name,
        is_system_admin: data.user.is_system_admin || false,
        roles: data.user.roles || [],
        permissions: data.user.permissions || []
      });
      setAuthLevel('full');
      setReadRestricted(!!data.read_restricted);
      setShowAuthModal(false);

      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  // Legacy: Direct user login (bypasses account selection)
  const login = async (username, password) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.detail || 'Login failed');
      }

      const data = await res.json();
      
      // Small delay to ensure cookie is fully set by browser before we update state
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Set full auth (legacy login gives full auth)
      if (data.user.account_id) {
        setAccount({ id: data.user.account_id });
      }
      setUser({
        id: data.user.id,
        username: data.user.username,
        full_name: data.user.full_name,
        is_system_admin: data.user.is_system_admin || false,
        roles: data.user.roles || [],
        permissions: data.user.permissions || []
      });
      setAuthLevel('full');
      setShowAuthModal(false);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  // Legacy: PIN verification
  const verifyPin = async (userId, pin) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ user_id: userId, pin })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.detail || 'PIN verification failed');
      }

      const data = await res.json();
      
      if (data.requires_full_password) {
        return { success: false, requiresPassword: true };
      }

      // Small delay to ensure cookie is fully set by browser before we update state
      await new Promise(resolve => setTimeout(resolve, 100));

      // Set full auth
      if (data.user.account_id) {
        setAccount({ id: data.user.account_id });
      }
      setUser({
        id: data.user.id,
        username: data.user.username,
        full_name: data.user.full_name,
        is_system_admin: data.user.is_system_admin || false,
        roles: data.user.roles || [],
        permissions: data.user.permissions || []
      });
      setAuthLevel('full');
      setShowAuthModal(false);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const logout = async () => {
    try {
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include'
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setAccount(null);
      setUser(null);
      setAuthLevel(null);
      setReadRestricted(false);
      setShowAuthModal(true);
    }
  };

  // Switch user within same account (keeps account logged in)
  const switchUser = async () => {
    setUser(null);
    setAuthLevel('account');
    // Account stays logged in, just need to select user again
  };

  const completeFirstRunSetup = async (setupData) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/first-run/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(setupData)
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.detail || 'Setup failed');
      }

      const data = await res.json();
      // Set user from response
      setUser(data.user);
      setAuthLevel('full');
      setIsFirstRun(false);
      setShowAuthModal(false);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const value = {
    // Two-layer auth state
    account,
    user,
    authLevel,
    readRestricted,
    hasReadAccess: !readRestricted,

    // Computed properties
    isAuthenticated: authLevel === 'full',
    isAccountAuthenticated: authLevel === 'account' || authLevel === 'full',

    // Legacy compatibility
    isFirstRun,
    loading,
    showAuthModal,
    setShowAuthModal,

    // Two-layer auth methods
    accountLogin,
    accountAccess,
    unlockWithAccountPassword,
    getAccountUsers,
    selectUser,
    switchUser,

    // Legacy methods (still work, give full auth)
    login,
    verifyPin,
    logout,
    completeFirstRunSetup,
    checkSession: checkFirstRunAndSession
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
