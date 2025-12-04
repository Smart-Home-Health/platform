import React, { useState, useEffect } from 'react';

const MedicationScheduledView = ({ 
  scheduledMedications, 
  getStatusColor, 
  getStatusText, 
  handleMarkTaken 
}) => {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const allScheduledMedications = scheduledMedications.scheduled_medications || [];

  const renderScheduledMedications = () => {
    // Group by day (YYYY-MM-DD) and time
    const groupByDay = {};
    allScheduledMedications.forEach(item => {
      const dateObj = new Date(item.scheduled_time);
      const dayKey = dateObj.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      const timeStr = dateObj.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
      if (!groupByDay[dayKey]) groupByDay[dayKey] = {};
      if (!groupByDay[dayKey][timeStr]) groupByDay[dayKey][timeStr] = [];
      groupByDay[dayKey][timeStr].push(item);
    });
    
    // Sort days chronologically
    const sortedDays = Object.keys(groupByDay).sort((a, b) => {
      // Parse to Date for sorting
      const parse = d => new Date(d);
      return parse(a) - parse(b);
    });
    
    return (
      <div>
        {sortedDays.map(dayKey => (
          <div key={dayKey} style={{ marginBottom: 36 }}>
            <div style={{ fontWeight: 800, fontSize: 22, color: '#fff', marginBottom: 8, letterSpacing: 0.5, textShadow: '0 1px 2px #222' }}>{dayKey}</div>
            <div style={{ borderBottom: '2px solid #e2e8f0', marginBottom: 16 }} />
            {Object.keys(groupByDay[dayKey]).sort((a, b) => {
              // Convert to 24h for sorting
              const parse = t => {
                const [h, m, ampm] = t.match(/(\d+):(\d+)\s*(AM|PM)/i).slice(1);
                let hour = parseInt(h, 10);
                if (/pm/i.test(ampm) && hour !== 12) hour += 12;
                if (/am/i.test(ampm) && hour === 12) hour = 0;
                return hour * 60 + parseInt(m, 10);
              };
              return parse(a) - parse(b);
            }).map(timeStr => (
              <div key={timeStr} style={{
                marginBottom: 32,
                background: '#181f2a',
                borderRadius: 18,
                boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
                padding: '18px 24px',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                border: '1.5px solid #2d3748',
              }}>
                <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'space-between', marginBottom: 16, gap: isMobile ? '10px' : '0' }}>
                  <div style={{ fontWeight: 700, fontSize: isMobile ? 18 : 20, color: '#00bfff', letterSpacing: 0.2, textShadow: '0 1px 2px #222' }}>{timeStr}</div>
                  <button style={{
                    background: '#007bff',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 12,
                    padding: isMobile ? '10px 16px' : '8px 18px',
                    fontWeight: 600,
                    fontSize: isMobile ? 15 : 14,
                    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                  }}
                  onClick={() => alert('Mark all for this hour (dummy button)')}
                  >
                    Mark All
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {groupByDay[dayKey][timeStr].map((item, idx) => {
                    const colors = getStatusColor(item.status);
                    const isCompleted = item.is_completed;
                    const isToday = new Date(item.scheduled_time).toDateString() === new Date().toDateString();
                    return (
                      <div
                        key={`scheduled-${dayKey}-${timeStr}-${idx}`}
                        style={{
                          backgroundColor: colors.bg,
                          borderRadius: 12,
                          padding: isMobile ? '12px 14px' : '14px 18px',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                          border: `1.5px solid ${colors.border}`,
                          display: 'flex',
                          flexDirection: isMobile ? 'column' : 'row',
                          alignItems: isMobile ? 'stretch' : 'center',
                          gap: isMobile ? '10px' : '12px',
                          marginBottom: 0,
                          opacity: isCompleted && isToday ? 0.7 : 1,
                          order: isCompleted && isToday ? 1 : 0
                        }}
                      >
                        <div style={{ flex: 1, display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', gap: isMobile ? '6px' : 10 }}>
                          <span style={{ color: colors.text, fontSize: isMobile ? '15px' : '16px', fontWeight: '600' }}>
                            {item.medication_name}{item.concentration ? ` (${item.concentration})` : ''}
                          </span>
                          <span style={{ color: colors.text, fontSize: isMobile ? '13px' : '14px', fontWeight: 500 }}>
                            {isMobile ? '' : '- '}{item.dose_amount} {item.dose_unit}
                          </span>
                          <span style={{ color: colors.text, fontSize: isMobile ? '13px' : '14px', fontWeight: 500 }}>
                            {item.type ? `(${item.type})` : ''}
                          </span>
                          <span 
                            style={{ 
                              backgroundColor: colors.border, 
                              color: '#fff', 
                              padding: '2px 8px', 
                              borderRadius: '12px', 
                              fontSize: isMobile ? '11px' : '12px',
                              fontWeight: '500',
                              marginLeft: isMobile ? 0 : 8
                            }}
                          >
                            {getStatusText(item)}
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '8px', width: isMobile ? '100%' : 'auto' }}>
                          {!isCompleted && (
                            <>
                              <button
                                style={{
                                  padding: isMobile ? '10px 14px' : '6px 14px',
                                  border: 'none',
                                  borderRadius: '8px',
                                  backgroundColor: '#28a745',
                                  color: '#fff',
                                  cursor: 'pointer',
                                  fontSize: isMobile ? '14px' : '13px',
                                  fontWeight: '500',
                                  boxShadow: '0 1px 2px rgba(0,0,0,0.07)',
                                  flex: isMobile ? 1 : 'initial'
                                }}
                                onClick={() => handleMarkTaken(item)}
                              >
                                {item.status === 'missed' ? 'Take Now' : 'Mark Taken'}
                              </button>
                              {item.status === 'missed' && (
                                <button
                                  style={{
                                    padding: isMobile ? '10px 14px' : '6px 14px',
                                    border: '2px solid #6c757d',
                                    borderRadius: '8px',
                                    backgroundColor: '#fff',
                                    color: '#6c757d',
                                    cursor: 'pointer',
                                    fontSize: isMobile ? '14px' : '13px',
                                    fontWeight: '500',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.07)',
                                    flex: isMobile ? 1 : 'initial'
                                  }}
                                  onClick={() => {
                                    alert('Skip dose functionality coming soon');
                                  }}
                                >
                                  Skip
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div>
      {scheduledMedications.scheduled_medications && scheduledMedications.scheduled_medications.length > 0 ? (
        <div>
          {renderScheduledMedications()}
          {/* Legend */}
          <div style={{ marginTop: '24px', padding: '16px', backgroundColor: '#2d3748', borderRadius: '8px', border: '1px solid #4a5568' }}>
            <h4 style={{ margin: '0 0 12px 0', color: '#ffffff', fontSize: '14px', fontWeight: '600' }}>Status Legend:</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '12px', color: '#e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: 12, height: 12, backgroundColor: '#28a745', borderRadius: '50%' }}></div>
                <span>On time (±1 hour)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: 12, height: 12, backgroundColor: '#ffc107', borderRadius: '50%' }}></div>
                <span>Warning (1-2 hours off)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: 12, height: 12, backgroundColor: '#dc3545', borderRadius: '50%' }}></div>
                <span>Late/Early ({'>'}2 hours off)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: 12, height: 12, backgroundColor: '#17a2b8', borderRadius: '50%' }}></div>
                <span>Upcoming</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{
          textAlign: 'center',
          padding: '40px',
          color: '#a0aec0',
          backgroundColor: '#2d3748',
          borderRadius: '8px',
          border: '1px solid #4a5568'
        }}>
          <p style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: '500', color: '#ffffff' }}>No scheduled medications</p>
          <p style={{ margin: 0, color: '#a0aec0' }}>No medications scheduled for today and yesterday.</p>
        </div>
      )}
    </div>
  );
};

export default MedicationScheduledView;
