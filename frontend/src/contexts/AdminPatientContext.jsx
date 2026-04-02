import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import config, { apiFetch } from '../config';

const AdminPatientContext = createContext();

export const useAdminPatient = () => {
  const context = useContext(AdminPatientContext);
  if (!context) {
    throw new Error('useAdminPatient must be used within AdminPatientProvider');
  }
  return context;
};

export const AdminPatientProvider = ({ children }) => {
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [loadingPatients, setLoadingPatients] = useState(true);
  
  // Legacy support - keep selectedPatientId as derived value
  const selectedPatientId = selectedPatient?.id?.toString() || null;

  // Fetch patients on mount
  useEffect(() => {
    fetchPatients();
  }, []);

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
