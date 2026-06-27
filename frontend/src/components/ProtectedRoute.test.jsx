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
// Wave 4 — ProtectedRoute redirect matrix. useAuth is mocked; real react-router
// MemoryRouter + Routes let us assert which destination renders.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';

let mockAuth;
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => mockAuth }));

beforeEach(() => {
  mockAuth = { isAuthenticated: false, isAccountAuthenticated: false, loading: false };
});

function renderGuard({ requireFullAuth = true } = {}) {
  return render(
    <MemoryRouter initialEntries={['/care']}>
      <Routes>
        <Route
          path="/care"
          element={
            <ProtectedRoute requireFullAuth={requireFullAuth}>
              <div>protected content</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div>login page</div>} />
        <Route path="/select-user" element={<div>select user page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  it('shows a loading state while auth is resolving', () => {
    mockAuth.loading = true;
    renderGuard();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('redirects to /login when not authenticated at all', () => {
    renderGuard();
    expect(screen.getByText('login page')).toBeInTheDocument();
  });

  it('redirects account-only sessions to /select-user when full auth is required', () => {
    mockAuth.isAccountAuthenticated = true; // account only
    renderGuard();
    expect(screen.getByText('select user page')).toBeInTheDocument();
  });

  it('renders children for account-only when full auth is NOT required', () => {
    mockAuth.isAccountAuthenticated = true;
    renderGuard({ requireFullAuth: false });
    expect(screen.getByText('protected content')).toBeInTheDocument();
  });

  it('renders children when fully authenticated', () => {
    mockAuth.isAuthenticated = true;
    mockAuth.isAccountAuthenticated = true;
    renderGuard();
    expect(screen.getByText('protected content')).toBeInTheDocument();
  });
});
