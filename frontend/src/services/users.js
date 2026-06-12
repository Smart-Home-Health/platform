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
import config, { apiFetch } from '../config';

export const userService = {
  // Get all users
  getUsers: async () => {
    const response = await apiFetch(`${config.apiUrl}/api/auth/users`);
    if (!response.ok) {
      throw new Error('Failed to fetch users');
    }
    return await response.json();
  },

  // Get user by ID
  getUser: async (userId) => {
    const response = await apiFetch(`${config.apiUrl}/api/auth/users/${userId}`);
    if (!response.ok) {
      throw new Error('Failed to fetch user');
    }
    return await response.json();
  },

  // Create new user
  createUser: async (userData) => {
    const response = await apiFetch(`${config.apiUrl}/api/auth/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to create user');
    }
    return await response.json();
  },

  // Update user
  updateUser: async (userId, userData) => {
    const response = await apiFetch(`${config.apiUrl}/api/auth/users/${userId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to update user');
    }
    return await response.json();
  },

  // Delete user
  deleteUser: async (userId) => {
    const response = await apiFetch(`${config.apiUrl}/api/auth/users/${userId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to delete user');
    }
    return await response.json();
  },

  // Get available roles
  getRoles: async () => {
    const response = await apiFetch(`${config.apiUrl}/api/auth/roles`);
    if (!response.ok) {
      throw new Error('Failed to fetch roles');
    }
    return await response.json();
  },

  // Assign role to user
  assignRole: async (userId, roleId, expiresAt = null) => {
    const response = await apiFetch(`${config.apiUrl}/api/auth/users/${userId}/roles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role_id: roleId, expires_at: expiresAt }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to assign role');
    }
    return await response.json();
  },

  // Remove role from user
  removeRole: async (userId, roleId) => {
    const response = await apiFetch(`${config.apiUrl}/api/auth/users/${userId}/roles/${roleId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to remove role');
    }
    return await response.json();
  },
};
