import React from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import { TasksIcon } from '../../components/Icons';
import './AdminV2.css';

const AdminV2CareTasksSchedule = () => {
  const [searchParams] = useSearchParams();
  const patientId = searchParams.get('patient');

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        <div className="admin-v2-placeholder-page">
          <TasksIcon size={64} />
          <h2>Care Tasks Schedule</h2>
          <p>Daily schedule view coming soon.</p>
          <Link 
            to={`/admin-v2/care-tasks${patientId ? `?patient=${patientId}` : ''}`}
            className="admin-v2-btn admin-v2-btn-primary"
            style={{ marginTop: '1rem', textDecoration: 'none' }}
          >
            Back to Overview
          </Link>
        </div>
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2CareTasksSchedule;
