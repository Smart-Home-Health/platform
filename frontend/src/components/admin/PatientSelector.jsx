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
import React, { useState, useEffect } from 'react';
import config from '../../config';

const PatientSelector = ({ selectedPatientId, onPatientChange }) => {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchPatients();
  }, []);

  const fetchPatients = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${config.apiUrl}/api/patients`);
      if (!response.ok) {
        throw new Error('Failed to fetch patients');
      }
      const data = await response.json();
      setPatients(data.filter(patient => patient.is_active));
      setError(null);
    } catch (err) {
      console.error('Error fetching patients:', err);
      setError('Failed to load patients');
    } finally {
      setLoading(false);
    }
  };

  const handlePatientChange = (e) => {
    const patientId = e.target.value;
    if (onPatientChange) {
      onPatientChange(patientId);
    }
  };

  if (loading) {
    return (
      <div style={{ 
        padding: '1rem', 
        borderBottom: '1px solid #333',
        color: '#ccc',
        fontSize: '0.875rem',
        background: '#1a1a1a'
      }}>
        Loading patients...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        padding: '1rem', 
        borderBottom: '1px solid #333',
        color: '#e74c3c',
        fontSize: '0.875rem',
        background: '#1a1a1a'
      }}>
        {error}
      </div>
    );
  }

  return (
    <div style={{ 
      padding: '1rem', 
      borderBottom: '1px solid #333',
      background: '#1a1a1a'
    }}>
      <label style={{ 
        display: 'block', 
        marginBottom: '0.75rem',
        fontSize: '0.75rem',
        fontWeight: '600',
        color: '#ccc',
        textTransform: 'uppercase',
        letterSpacing: '0.5px'
      }}>
        Current Patient
      </label>
      <select
        value={selectedPatientId || ''}
        onChange={handlePatientChange}
        style={{
          width: '100%',
          padding: '0.75rem',
          border: '1px solid #333',
          borderRadius: '4px',
          fontSize: '0.875rem',
          backgroundColor: '#2a2a2a',
          color: '#fff',
          outline: 'none',
          cursor: 'pointer'
        }}
      >
        <option value="" style={{ backgroundColor: '#2a2a2a', color: '#fff' }}>Select Patient</option>
        {patients.map(patient => (
          <option key={patient.id} value={patient.id} style={{ backgroundColor: '#2a2a2a', color: '#fff' }}>
            {patient.first_name} {patient.last_name}
            {patient.medical_record_number && ` (${patient.medical_record_number})`}
          </option>
        ))}
      </select>
      
      {selectedPatientId && (
        <div style={{
          marginTop: '0.75rem',
          fontSize: '0.75rem',
          color: '#27ae60',
          fontWeight: '500'
        }}>
          ✓ Patient selected for admin view
        </div>
      )}
    </div>
  );
};

export default PatientSelector;
