import React, { useState, useEffect } from 'react';

const MedicationListView = ({ 
  medications, 
  setShowAddForm, 
  handleEdit, 
  toggleActive, 
  handleDelete, 
  setShowScheduleFor,
  type = 'active' // 'active' or 'inactive'
}) => {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const renderMedicationCard = (med) => (
    <div key={med.id} className="medication-card" style={{
      backgroundColor: '#fff',
      borderRadius: '8px',
      padding: isMobile ? '14px' : '16px',
      marginBottom: '12px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      border: `2px solid ${med.active ? '#28a745' : '#6c757d'}`
    }}>
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'flex-start', gap: isMobile ? '12px' : '0' }}>
        <div style={{ flex: 1 }}>
          <h4 style={{ margin: '0 0 8px 0', color: '#333', fontSize: isMobile ? '16px' : '18px', fontWeight: '600' }}>
            {med.name}
          </h4>
          {med.concentration && (
            <div style={{ marginBottom: '8px', fontSize: isMobile ? '13px' : '14px' }}>
              <span style={{ fontWeight: '500', color: '#666' }}>Concentration: </span>
              <span style={{ color: '#333' }}>{med.concentration}</span>
            </div>
          )}
          <div style={{ marginBottom: '8px', fontSize: isMobile ? '13px' : '14px' }}>
            <span style={{ fontWeight: '500', color: '#666' }}>Quantity: </span>
            <span style={{ color: '#333' }}>{med.quantity} {med.quantityUnit || ''}</span>
          </div>
          {med.notes && (
            <div style={{ marginBottom: '8px', fontSize: isMobile ? '12px' : '14px' }}>
              <span style={{ fontWeight: '500', color: '#666' }}>Notes: </span>
              <span style={{ color: '#333' }}>{med.notes}</span>
            </div>
          )}
          {(med.startDate) && (
            <div style={{ fontSize: isMobile ? '12px' : '14px', color: '#666' }}>
              {med.startDate && `Start: ${new Date(med.startDate).toLocaleDateString()}`}
            </div>
          )}
        </div>
        <div style={{ 
          display: 'flex', 
          flexDirection: isMobile ? 'column' : 'row',
          gap: isMobile ? '8px' : '8px', 
          marginLeft: isMobile ? '0' : '16px',
          width: isMobile ? '100%' : 'auto'
        }}>
          {isMobile ? (
            <>
              {/* First row on mobile */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setShowScheduleFor(med.id)}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    border: 'none',
                    borderRadius: '6px',
                    backgroundColor: med.schedules && med.schedules.length > 0 ? '#ffc107' : '#17a2b8',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    position: 'relative'
                  }}
                >
                  Schedule
                  {med.schedules && med.schedules.length > 0 && (
                    <span style={{
                      display: 'inline-block',
                      marginLeft: 6,
                      background: '#28a745',
                      color: '#fff',
                      borderRadius: '50%',
                      width: 18,
                      height: 18,
                      fontSize: 12,
                      lineHeight: '18px',
                      textAlign: 'center',
                      fontWeight: 700
                    }}>{med.schedules.length}</span>
                  )}
                </button>
                <button
                  onClick={() => handleEdit(med)}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    border: 'none',
                    borderRadius: '6px',
                    backgroundColor: '#007bff',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500'
                  }}
                >
                  Edit
                </button>
              </div>
              {/* Second row on mobile */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => toggleActive(med.id)}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    border: 'none',
                    borderRadius: '6px',
                    backgroundColor: med.active ? '#6c757d' : '#28a745',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500'
                  }}
                >
                  {med.active ? 'Pause' : 'Resume'}
                </button>
                <button
                  onClick={() => handleDelete(med.id)}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    border: 'none',
                    borderRadius: '6px',
                    backgroundColor: '#dc3545',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500'
                  }}
                >
                  Delete
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Single row on desktop */}
              <button
                onClick={() => setShowScheduleFor(med.id)}
                style={{
                  padding: '6px 12px',
                  border: 'none',
                  borderRadius: '4px',
                  backgroundColor: med.schedules && med.schedules.length > 0 ? '#ffc107' : '#17a2b8',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '12px',
                  position: 'relative'
                }}
              >
                Schedule
                {med.schedules && med.schedules.length > 0 && (
                  <span style={{
                    display: 'inline-block',
                    marginLeft: 6,
                    background: '#28a745',
                    color: '#fff',
                    borderRadius: '50%',
                    width: 16,
                    height: 16,
                    fontSize: 11,
                    lineHeight: '16px',
                    textAlign: 'center',
                    fontWeight: 700
                  }}>{med.schedules.length}</span>
                )}
              </button>
              <button
                onClick={() => handleEdit(med)}
                style={{
                  padding: '6px 12px',
                  border: 'none',
                  borderRadius: '4px',
                  backgroundColor: '#007bff',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                Edit
              </button>
              <button
                onClick={() => toggleActive(med.id)}
                style={{
                  padding: '6px 12px',
                  border: 'none',
                  borderRadius: '4px',
                  backgroundColor: med.active ? '#6c757d' : '#28a745',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                {med.active ? 'Pause' : 'Resume'}
              </button>
              <button
                onClick={() => handleDelete(med.id)}
                style={{
                  padding: '6px 12px',
                  border: 'none',
                  borderRadius: '4px',
                  backgroundColor: '#dc3545',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  if (medications.length === 0) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '40px',
        color: '#666',
        backgroundColor: '#f8f9fa',
        borderRadius: '8px'
      }}>
        <p>No {type} medications found.</p>
        {type === 'active' && (
          <button
            onClick={() => setShowAddForm(true)}
            style={{
              padding: '10px 20px',
              border: 'none',
              borderRadius: '6px',
              backgroundColor: '#007bff',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: '500',
              fontSize: '14px',
              marginTop: '10px'
            }}
          >
            Add your first medication
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      {medications.map(renderMedicationCard)}
    </div>
  );
};

export default MedicationListView;
