// Patient API service
import config, { apiFetch } from '../config';

const API_BASE_URL = config.apiUrl;

export const patientService = {
  // Get all patients
  async getPatients() {
    const response = await fetch(`${API_BASE_URL}/api/patients/`);
    if (!response.ok) {
      throw new Error('Failed to fetch patients');
    }
    return response.json();
  },

  // Get current active patient
  async getCurrentPatient() {
    const response = await fetch(`${API_BASE_URL}/api/patients/current`);
    if (!response.ok) {
      throw new Error('Failed to fetch current patient');
    }
    return response.json();
  },

  // Get patient by ID
  async getPatient(patientId) {
    const response = await fetch(`${API_BASE_URL}/api/patients/${patientId}`);
    if (!response.ok) {
      throw new Error('Failed to fetch patient');
    }
    return response.json();
  },

  // Create new patient
  async createPatient(patientData) {
    const response = await fetch(`${API_BASE_URL}/api/patients/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(patientData),
    });
    if (!response.ok) {
      throw new Error('Failed to create patient');
    }
    return response.json();
  },

  // Update patient
  async updatePatient(patientId, patientData) {
    const response = await fetch(`${API_BASE_URL}/api/patients/${patientId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(patientData),
    });
    if (!response.ok) {
      throw new Error('Failed to update patient');
    }
    return response.json();
  },

  // Deactivate patient (soft delete)
  async deactivatePatient(patientId) {
    const response = await fetch(`${API_BASE_URL}/api/patients/${patientId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error('Failed to deactivate patient');
    }
    return response.json();
  },

  // Set patient as current for dashboard tracking
  async setCurrentPatient(patientId) {
    const response = await fetch(`${API_BASE_URL}/api/patients/${patientId}/set-current`, {
      method: 'POST',
    });
    if (!response.ok) {
      throw new Error('Failed to set current patient');
    }
    return response.json();
  },

  // Activate patient
  async activatePatient(patientId) {
    const response = await fetch(`${API_BASE_URL}/api/patients/${patientId}/activate`, {
      method: 'POST',
    });
    if (!response.ok) {
      throw new Error('Failed to activate patient');
    }
    return response.json();
  }
};
