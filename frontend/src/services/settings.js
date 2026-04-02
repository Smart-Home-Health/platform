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