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
  const [user, setUser] = useState(null);
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
        // Extract user info from session
        setUser({
          id: sessionData.user_id,
          username: sessionData.username,
          full_name: sessionData.full_name,
          roles: sessionData.roles || [],
          permissions: sessionData.permissions || []
        });
        setShowAuthModal(false);
      } else {
        // No active session
        setUser(null);
        setShowAuthModal(true);
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
      setUser(null);
      setShowAuthModal(true);
    } finally {
      setLoading(false);
    }
  };

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
      // Ensure user object has proper structure
      setUser({
        id: data.user.id,
        username: data.user.username,
        full_name: data.user.full_name,
        roles: data.user.roles || [],
        permissions: data.user.permissions || []
      });
      setShowAuthModal(false);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

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

      // Ensure user object has proper structure
      setUser({
        id: data.user.id,
        username: data.user.username,
        full_name: data.user.full_name,
        roles: data.user.roles || [],
        permissions: data.user.permissions || []
      });
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
      setUser(null);
      setShowAuthModal(true);
    }
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
      setIsFirstRun(false);
      setShowAuthModal(false);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const value = {
    user,
    isFirstRun,
    loading,
    showAuthModal,
    setShowAuthModal,
    login,
    verifyPin,
    logout,
    completeFirstRunSetup,
    checkSession: checkFirstRunAndSession
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
