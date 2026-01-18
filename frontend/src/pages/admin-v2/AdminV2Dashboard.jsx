import React from 'react';
import { Link } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import {
  PatientsIcon,
  MedicationsIcon,
  TasksIcon,
  EquipmentIcon,
  PlusIcon
} from '../../components/Icons';
import './AdminV2.css';

// Hardcoded patient data for now
const mockPatients = [
  {
    id: 1,
    name: 'John Smith',
    dateOfBirth: '1945-03-15',
    room: 'Room 101',
    status: 'active',
    dueCounts: {
      medications: 3,
      equipment: 1,
      tasks: 2
    }
  },
  {
    id: 2,
    name: 'Mary Johnson',
    dateOfBirth: '1952-08-22',
    room: 'Room 102',
    status: 'active',
    dueCounts: {
      medications: 0,
      equipment: 2,
      tasks: 0
    }
  },
  {
    id: 3,
    name: 'Robert Williams',
    dateOfBirth: '1948-11-30',
    room: 'Room 103',
    status: 'active',
    dueCounts: {
      medications: 5,
      equipment: 0,
      tasks: 4
    }
  },
  {
    id: 4,
    name: 'Patricia Brown',
    dateOfBirth: '1960-01-08',
    room: 'Room 104',
    status: 'inactive',
    dueCounts: {
      medications: 0,
      equipment: 0,
      tasks: 0
    }
  },
  {
    id: 5,
    name: 'Michael Davis',
    dateOfBirth: '1955-06-17',
    room: 'Room 105',
    status: 'active',
    dueCounts: {
      medications: 1,
      equipment: 3,
      tasks: 1
    }
  },
];

// Calculate age from DOB
const calculateAge = (dob) => {
  const birthDate = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};

// Get initials from name
const getInitials = (name) => {
  return name
    .split(' ')
    .map(part => part[0])
    .join('')
    .toUpperCase();
};

// Get status class for due counter
const getDueStatus = (count) => {
  if (count >= 3) return 'overdue';
  if (count > 0) return 'has-due';
  return '';
};

const AdminV2Dashboard = () => {
  // Calculate summary stats
  const totalPatients = mockPatients.length;
  const activePatients = mockPatients.filter(p => p.status === 'active').length;
  const totalMedsDue = mockPatients.reduce((sum, p) => sum + p.dueCounts.medications, 0);
  const totalTasksDue = mockPatients.reduce((sum, p) => sum + p.dueCounts.tasks, 0);
  const totalEquipmentDue = mockPatients.reduce((sum, p) => sum + p.dueCounts.equipment, 0);

  return (
    <AdminV2Layout>
      <div className="admin-v2-dashboard">
        <div className="admin-v2-dashboard-header">
          <h1 className="admin-v2-dashboard-title">Dashboard</h1>
          <p className="admin-v2-dashboard-subtitle">
            Overview of all patients and their care status
          </p>
        </div>

        {/* Summary Statistics */}
        <div className="admin-v2-summary-stats">
          <div className="admin-v2-stat-card">
            <div className="admin-v2-stat-icon patients">
              <PatientsIcon size={24} />
            </div>
            <div className="admin-v2-stat-info">
              <h4>{activePatients}/{totalPatients}</h4>
              <p>Active Patients</p>
            </div>
          </div>
          <div className="admin-v2-stat-card">
            <div className="admin-v2-stat-icon medications">
              <MedicationsIcon size={24} />
            </div>
            <div className="admin-v2-stat-info">
              <h4>{totalMedsDue}</h4>
              <p>Medications Due</p>
            </div>
          </div>
          <div className="admin-v2-stat-card">
            <div className="admin-v2-stat-icon tasks">
              <TasksIcon size={24} />
            </div>
            <div className="admin-v2-stat-info">
              <h4>{totalTasksDue}</h4>
              <p>Tasks Due</p>
            </div>
          </div>
          <div className="admin-v2-stat-card">
            <div className="admin-v2-stat-icon equipment">
              <EquipmentIcon size={24} />
            </div>
            <div className="admin-v2-stat-info">
              <h4>{totalEquipmentDue}</h4>
              <p>Equipment Due</p>
            </div>
          </div>
        </div>

        {/* Section Header */}
        <div className="admin-v2-section-header">
          <h2 className="admin-v2-section-title">All Patients</h2>
          <Link to="/admin-v2/patients/create" className="admin-v2-btn admin-v2-btn-primary">
            <PlusIcon size={16} /> Add Patient
          </Link>
        </div>

        {/* Patients Grid */}
        <div className="admin-v2-patients-grid">
          {mockPatients.map((patient) => (
            <div key={patient.id} className="admin-v2-patient-card">
              <div className="admin-v2-patient-header">
                <div className="admin-v2-patient-avatar">
                  {getInitials(patient.name)}
                </div>
                <div className="admin-v2-patient-info">
                  <h3 className="admin-v2-patient-name">{patient.name}</h3>
                  <p className="admin-v2-patient-meta">
                    Age {calculateAge(patient.dateOfBirth)} • {patient.room}
                  </p>
                </div>
                <span className={`admin-v2-patient-status ${patient.status}`}>
                  {patient.status}
                </span>
              </div>

              {/* Due Counters */}
              <div className="admin-v2-due-counters">
                <Link 
                  to={`/admin-v2/medications?patient=${patient.id}`}
                  className={`admin-v2-due-item ${getDueStatus(patient.dueCounts.medications)}`}
                >
                  <p className="admin-v2-due-count">{patient.dueCounts.medications}</p>
                  <p className="admin-v2-due-label">Meds Due</p>
                </Link>
                <div className={`admin-v2-due-item ${getDueStatus(patient.dueCounts.equipment)}`}>
                  <p className="admin-v2-due-count">{patient.dueCounts.equipment}</p>
                  <p className="admin-v2-due-label">Equip Due</p>
                </div>
                <div className={`admin-v2-due-item ${getDueStatus(patient.dueCounts.tasks)}`}>
                  <p className="admin-v2-due-count">{patient.dueCounts.tasks}</p>
                  <p className="admin-v2-due-label">Tasks Due</p>
                </div>
              </div>

              {/* Actions */}
              <div className="admin-v2-patient-actions">
                <Link to={`/admin-v2/patients/${patient.id}`} className="admin-v2-btn">
                  View Details
                </Link>
                <Link to={`/admin-v2/patients/${patient.id}/schedule`} className="admin-v2-btn admin-v2-btn-primary">
                  Schedule
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Dashboard;
