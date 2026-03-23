import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * ProtectedRoute component that wraps routes requiring FULL authentication.
 * - If no auth at all: redirects to /login
 * - If account-level only: redirects to /select-user
 * - If fully authenticated: renders children
 */
export default function ProtectedRoute({ children, requireFullAuth = true }) {
  const { isAuthenticated, isAccountAuthenticated, loading } = useAuth();
  const location = useLocation();

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontSize: '18px',
        color: '#718096',
        background: '#1a1f2e'
      }}>
        Loading...
      </div>
    );
  }

  // If not authenticated at all, redirect to login
  if (!isAccountAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If only account-level auth is required, allow rendering
  if (!requireFullAuth) {
    return children;
  }

  // If only account-level auth (no user selected), redirect to user selection
  if (!isAuthenticated) {
    return <Navigate to="/select-user" state={{ from: location }} replace />;
  }

  // User is fully authenticated, render children
  return children;
}
