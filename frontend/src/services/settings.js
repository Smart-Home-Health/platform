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
import config, { apiFetch } from '../config';

export const getSettings = async () => {
  try {
    const response = await fetch(`${config.apiUrl}/api/settings`, {
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch settings: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching settings:', error);
    throw error;
  }
};

export const getSetting = async (key, defaultValue = null) => {
  try {
    const response = await fetch(`${config.apiUrl}/api/settings/${key}${defaultValue ? `?default=${defaultValue}` : ''}`, {
      credentials: 'include'
    });
    
    if (response.status === 404) {
      return defaultValue;
    }
    
    if (!response.ok) {
      throw new Error(`Failed to fetch setting: ${response.status}`);
    }
    
    const data = await response.json();
    return data.value;
  } catch (error) {
    console.error(`Error fetching setting ${key}:`, error);
    return defaultValue;
  }
};

export const setSetting = async (key, value, dataType = 'string', description = null) => {
  try {
    const response = await fetch(`${config.apiUrl}/api/settings/${key}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        value,
        data_type: dataType,
        description,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to save setting: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error saving setting ${key}:`, error);
    throw error;
  }
};

export const updateSettings = async (settingsObject) => {
  try {
    const response = await fetch(`${config.apiUrl}/api/settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        settings: settingsObject,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to update settings: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error updating settings:', error);
    throw error;
  }
};

export const deleteSetting = async (key) => {
  try {
    const response = await fetch(`${config.apiUrl}/api/settings/${key}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error(`Failed to delete setting: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error deleting setting ${key}:`, error);
    throw error;
  }
};