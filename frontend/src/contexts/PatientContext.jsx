import React, { createContext, useContext, useState, useEffect } from 'react';
import config, { apiFetch } from '../config';

const PatientContext = createContext();

export const usePatient = () => {
  const context = useContext(PatientContext);
  if (!context) {
    throw new Error('usePatient must be used within a PatientProvider');
  }
  return context;
};

export const PatientProvider = ({ children }) => {
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patients, setPatients] = useState([]);
  const [loadingPatients, setLoadingPatients] = useState(true);

  // Fetch all patients on mount
  useEffect(() => {
    fetchPatients();
  }, []);

  const fetchPatients = async () => {
    try {
      setLoadingPatients(true);
      const response = await fetch(`${config.apiUrl}/api/patients?active_only=false`, {
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

  const selectPatient = (patient) => {
    setSelectedPatient(patient);
  };

  const clearPatient = () => {
    setSelectedPatient(null);
  };

  const value = {
    selectedPatient,
    patients,
    loadingPatients,
    selectPatient,
    clearPatient,
    fetchPatients
  };

  return (
    <PatientContext.Provider value={value}>
      {children}
    </PatientContext.Provider>
  );
};
