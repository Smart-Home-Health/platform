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
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import config from '../config';
import { useAuth } from './AuthContext';

const AdminPatientContext = createContext();

export const useAdminPatient = () => {
  const context = useContext(AdminPatientContext);
  if (!context) {
    throw new Error('useAdminPatient must be used within AdminPatientProvider');
  }
  return context;
};

export const AdminPatientProvider = ({ children }) => {
  const { authLevel, hasReadAccess } = useAuth();
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [loadingPatients, setLoadingPatients] = useState(true);

  // Legacy support - keep selectedPatientId as derived value
  const selectedPatientId = selectedPatient?.id?.toString() || null;

  // Fetch patients whenever we have read access — covers initial load AND
  // regaining access after an idle lock / unlock without a full remount.
  // /api/patients 403s while restricted, so a one-time mount fetch could
  // otherwise leave the list empty until the next route remount.
  useEffect(() => {
    if (authLevel && hasReadAccess) {
      fetchPatients();
    } else {
      setLoadingPatients(false);
    }
  }, [authLevel, hasReadAccess]);

  // Load saved patient from session storage after patients are fetched
  useEffect(() => {
    if (patients.length > 0) {
      const savedPatientId = sessionStorage.getItem('adminSelectedPatientId');
      if (savedPatientId) {
        const patient = patients.find(p => p.id === parseInt(savedPatientId));
        if (patient) {
          setSelectedPatient(patient);
        }
      }
    }
  }, [patients]);

  const fetchPatients = async () => {
    try {
      setLoadingPatients(true);
      const response = await fetch(`${config.apiUrl}/api/patients`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setPatients(data);
      }
    } catch (err) {
      console.error('Error fetching patients:', err);
    } finally {
      setLoadingPatients(false);
    }
  };

  const selectPatient = useCallback((patient) => {
    setSelectedPatient(patient);
    if (patient) {
      sessionStorage.setItem('adminSelectedPatientId', patient.id.toString());
      // Sync with backend so data recording uses the selected patient
      fetch(`${config.apiUrl}/api/patients/${patient.id}/set-current`, {
        method: 'POST',
        credentials: 'include',
      }).catch(err => console.error('Error setting current patient:', err));
    } else {
      sessionStorage.removeItem('adminSelectedPatientId');
    }
  }, []);

  // Legacy support - setPatientId for old components
  const setPatientId = useCallback((patientId) => {
    if (patientId) {
      const patient = patients.find(p => p.id === parseInt(patientId));
      if (patient) {
        selectPatient(patient);
      }
    } else {
      selectPatient(null);
    }
  }, [patients, selectPatient]);

  const clearPatient = useCallback(() => {
    selectPatient(null);
  }, [selectPatient]);

  const value = {
    // New API
    patients,
    selectedPatient,
    selectPatient,
    clearPatient,
    loadingPatients,
    refreshPatients: fetchPatients,
    // Legacy API
    selectedPatientId,
    setPatientId
  };

  return (
    <AdminPatientContext.Provider value={value}>
      {children}
    </AdminPatientContext.Provider>
  );
};

export default AdminPatientContext;
