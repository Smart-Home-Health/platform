/*
 * Smart Home Health Hub
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
