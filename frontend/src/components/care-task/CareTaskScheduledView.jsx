import React, { useState, useEffect } from 'react';

const CareTaskScheduledView = ({ 
  scheduledTasks, 
  getStatusColor, 
  getStatusText, 
  handleMarkCompleted,
  handleSkipTask,
  statusFilters,
  setStatusFilters,
  showFilters,
  setShowFilters
}) => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  const allScheduledTasks = scheduledTasks.scheduled_care_tasks || [];

  // Filter tasks based on status filters
  const filteredTasks = allScheduledTasks.filter(task => {
    const taskStatus = task.status; // Use the status directly from backend
    return statusFilters[taskStatus] !== false;
  });

  // Toggle status filter
  const toggleStatusFilter = (filterKey) => {
    setStatusFilters(prev => ({
      ...prev,
      [filterKey]: !prev[filterKey]
    }));
  };

  // Clear all filters
  const clearAllFilters = () => {
    setStatusFilters({
      pending: false,
      due_warning: false,
      due_on_time: false,
      due_late: false,
      upcoming: false,
      missed: false,
      completed: false,
      skipped: false
    });
  };

  // Set default filters (pending, missed, due statuses)
  const setDefaultFilters = () => {
    setStatusFilters({
      pending: true,
      due_warning: true,
      due_on_time: true,
      due_late: true,
      upcoming: true,
      missed: true,
      completed: false,  // Hide completed by default
      skipped: false     // Hide skipped by default
    });
  };

  // Select all filters
  const selectAllFilters = () => {
    setStatusFilters({
      pending: true,
      due_warning: true,
      due_on_time: true,
      due_late: true,
      upcoming: true,
      missed: true,
      completed: true,
      skipped: true
    });
  };

  // Count tasks by status
  const getStatusCounts = (tasks) => {
    if (!tasks || !Array.isArray(tasks)) {
      return {
        pending: 0, due_warning: 0, due_on_time: 0, due_late: 0,
        upcoming: 0, missed: 0, completed: 0, skipped: 0, total: 0
      };
    }
    
    const counts = {
      pending: 0, due_warning: 0, due_on_time: 0, due_late: 0,
      upcoming: 0, missed: 0, completed: 0, skipped: 0, total: tasks.length
    };
    
    tasks.forEach(task => {
      const status = task.status;
      if (counts[status] !== undefined) {
        counts[status]++;
      }
    });
    
    return counts;
  };

  const renderStatusFilters = () => {
    if (!showFilters) return null;

    const statusCounts = getStatusCounts(allScheduledTasks);
    
    const filterOptions = [
      { key: 'pending', label: 'Pending', color: '#17a2b8' },
      { key: 'due_warning', label: 'Due Warning', color: '#ffc107' },
      { key: 'due_on_time', label: 'Due On Time', color: '#28a745' },
      { key: 'due_late', label: 'Due Late', color: '#dc3545' },
      { key: 'upcoming', label: 'Upcoming', color: '#17a2b8' },
      { key: 'missed', label: 'Missed', color: '#dc3545' },
      { key: 'completed', label: 'Completed', color: '#28a745' },
      { key: 'skipped', label: 'Skipped', color: '#6c757d' }
    ];

    return (
      <div style={{
        marginBottom: '20px',
        padding: '16px',
        backgroundColor: '#2d3748',
        borderRadius: '8px',
        border: '1px solid #4a5568'
      }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '12px'
        }}>
          <h4 style={{ 
            margin: 0, 
            color: '#ffffff', 
            fontSize: '14px', 
            fontWeight: '600' 
          }}>
            Filter by Status:
          </h4>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={selectAllFilters}
              style={{
                padding: '4px 8px',
                backgroundColor: '#007bff',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                fontSize: '11px',
                cursor: 'pointer'
              }}
            >
              Toggle All
            </button>
            <button
              onClick={setDefaultFilters}
              style={{
                padding: '4px 8px',
                backgroundColor: '#28a745',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                fontSize: '11px',
                cursor: 'pointer'
              }}
            >
              Reset to Default
            </button>
          </div>
        </div>
        <div style={{ 
          display: 'flex', 
          flexWrap: 'wrap', 
          gap: '12px' 
        }}>
          {filterOptions.map(option => (
            <label 
              key={option.key}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '6px',
                cursor: 'pointer',
                color: '#e2e8f0',
                fontSize: '12px',
                padding: '4px 8px',
                borderRadius: '4px',
                backgroundColor: statusFilters[option.key] ? '#4a5568' : 'transparent',
                border: '1px solid #4a5568'
              }}
            >
              <input
                type="checkbox"
                checked={statusFilters[option.key] || false}
                onChange={() => toggleStatusFilter(option.key)}
                style={{ cursor: 'pointer' }}
              />
              <div style={{
                width: '12px',
                height: '12px',
                backgroundColor: option.color,
                borderRadius: '50%',
                marginRight: '4px'
              }}></div>
              {option.label} ({statusCounts[option.key] || 0})
            </label>
          ))}
        </div>
      </div>
    );
  };

  const renderScheduledTasks = () => {
    // Group by day (YYYY-MM-DD) and time
    const groupByDay = {};
    filteredTasks.forEach(item => {
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 20, color: '#00bfff', letterSpacing: 0.2, textShadow: '0 1px 2px #222' }}>{timeStr}</div>
                  <button style={{
                    background: '#007bff',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 12,
                    padding: '8px 18px',
                    fontWeight: 600,
                    fontSize: 14,
                    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                  }}
                  onClick={() => {
                    // Mark all tasks for this time slot as completed
                    groupByDay[dayKey][timeStr].forEach(task => {
                      if (!task.is_completed) {
                        handleMarkCompleted(task);
                      }
                    });
                  }}
                  >
                    Mark All
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {groupByDay[dayKey][timeStr].map((item, idx) => {
                    const statusColors = getStatusColor(item.status);
                    const isCompleted = item.is_completed;
                    const isToday = new Date(item.scheduled_time).toDateString() === new Date().toDateString();
                    
                    // Get category color if available
                    const categoryColor = item.care_task_category_color || '#6f42c1';
                    
                    return (
                      <div
                        key={`scheduled-${dayKey}-${timeStr}-${idx}`}
                        style={{
                          backgroundColor: statusColors.bg,
                          borderRadius: isMobile ? 10 : 12,
                          padding: isMobile ? '12px 14px' : '14px 18px',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                          border: `1.5px solid ${statusColors.border}`,
                          borderLeft: `6px solid ${categoryColor}`,
                          display: 'flex',
                          flexDirection: isMobile ? 'column' : 'row',
                          alignItems: isMobile ? 'stretch' : 'center',
                          gap: isMobile ? '10px' : '12px',
                          marginBottom: 0,
                          opacity: isCompleted && isToday ? 0.7 : 1,
                          order: isCompleted && isToday ? 1 : 0,
                          position: 'relative'
                        }}
                      >
                        {/* Category color indicator */}
                        {!isMobile && (
                          <div style={{
                            position: 'absolute',
                            top: 8,
                            right: 8,
                            width: 12,
                            height: 12,
                            borderRadius: '50%',
                            backgroundColor: categoryColor,
                            border: '2px solid #fff',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                          }}></div>
                        )}
                        
                        <div style={{ flex: 1, display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', gap: isMobile ? 6 : 10 }}>
                          <span style={{ color: statusColors.text, fontSize: isMobile ? '15px' : '16px', fontWeight: '600', lineHeight: '1.3' }}>
                            {item.care_task_name}
                          </span>
                          {item.care_task_description && (
                            <span style={{ color: statusColors.text, fontSize: isMobile ? '13px' : '14px', fontWeight: 400, opacity: 0.8, lineHeight: '1.3' }}>
                              {isMobile ? item.care_task_description : `- ${item.care_task_description}`}
                            </span>
                          )}
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: isMobile ? '4px' : 0 }}>
                            {item.care_task_category_name && (
                              <span style={{ 
                                backgroundColor: categoryColor, 
                                color: '#fff', 
                                padding: '2px 8px', 
                                borderRadius: '12px', 
                                fontSize: isMobile ? '10px' : '11px',
                                fontWeight: '600'
                              }}>
                                {item.care_task_category_name}
                              </span>
                            )}
                            <span 
                              style={{ 
                                backgroundColor: statusColors.border, 
                                color: '#fff', 
                                padding: '2px 8px', 
                                borderRadius: '12px', 
                                fontSize: isMobile ? '11px' : '12px',
                                fontWeight: '500'
                              }}
                            >
                              {getStatusText(item)}
                            </span>
                          </div>
                        </div>
                        
                        <div style={{ display: 'flex', gap: isMobile ? '6px' : '8px', flexDirection: isMobile ? 'row' : 'row', width: isMobile ? '100%' : 'auto' }}>
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
                                  flex: isMobile ? '1' : '0 0 auto'
                                }}
                                onClick={() => handleMarkCompleted(item)}
                              >
                                {item.status === 'missed' ? 'Complete Now' : isMobile ? 'Complete' : 'Mark Completed'}
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
                                    flex: isMobile ? '1' : '0 0 auto'
                                  }}
                                  onClick={() => handleSkipTask(item)}
                                >
                                  Skip
                                </button>
                              )}
                            </>
                          )}
                          {isCompleted && (
                            <div style={{
                              padding: isMobile ? '10px 14px' : '6px 14px',
                              backgroundColor: '#e8f5e8',
                              color: '#28a745',
                              borderRadius: '8px',
                              fontSize: isMobile ? '14px' : '13px',
                              fontWeight: '600',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '4px',
                              flex: isMobile ? '1' : '0 0 auto'
                            }}>
                              ✓ Completed
                            </div>
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
      {scheduledTasks.scheduled_care_tasks && scheduledTasks.scheduled_care_tasks.length > 0 ? (
        <div>
          {/* Filter Toggle Button */}
          <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, color: '#ffffff', fontSize: '18px', fontWeight: '600' }}>
              Today's Scheduled Care Tasks
            </h3>
            <button
              onClick={() => setShowFilters(!showFilters)}
              style={{
                padding: '8px 16px',
                backgroundColor: showFilters ? '#007bff' : '#6c757d',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: '500',
                transition: 'background-color 0.2s'
              }}
            >
              {showFilters ? 'Hide Filters' : 'Show Filters'}
            </button>
          </div>
          
          {/* Status Filters */}
          {renderStatusFilters()}
          
          {/* Task Count */}
          {filteredTasks.length !== allScheduledTasks.length && (
            <div style={{
              marginBottom: '16px',
              padding: '8px 12px',
              backgroundColor: '#374151',
              borderRadius: '6px',
              color: '#e2e8f0',
              fontSize: '12px'
            }}>
              Showing {filteredTasks.length} of {allScheduledTasks.length} tasks
            </div>
          )}
          
          {filteredTasks.length > 0 ? renderScheduledTasks() : (
            <div style={{
              textAlign: 'center',
              padding: '40px',
              color: '#a0aec0',
              backgroundColor: '#2d3748',
              borderRadius: '8px',
              border: '1px solid #4a5568'
            }}>
              <p style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: '500', color: '#ffffff' }}>
                No tasks match current filters
              </p>
              <p style={{ margin: 0, color: '#a0aec0' }}>
                Adjust your status filters to see more tasks.
              </p>
            </div>
          )}
          
          {/* Legend */}
          <div style={{ marginTop: '24px', padding: '16px', backgroundColor: '#2d3748', borderRadius: '8px', border: '1px solid #4a5568' }}>
            <h4 style={{ margin: '0 0 12px 0', color: '#ffffff', fontSize: '14px', fontWeight: '600' }}>Status Legend:</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '12px', color: '#e2e8f0', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: 12, height: 12, backgroundColor: '#28a745', borderRadius: '50%' }}></div>
                <span>Ready to complete</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: 12, height: 12, backgroundColor: '#ffc107', borderRadius: '50%' }}></div>
                <span>Warning (running late)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: 12, height: 12, backgroundColor: '#dc3545', borderRadius: '50%' }}></div>
                <span>Missed/Overdue</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: 12, height: 12, backgroundColor: '#17a2b8', borderRadius: '50%' }}></div>
                <span>Upcoming</span>
              </div>
            </div>
            <div style={{ fontSize: '12px', color: '#e2e8f0', marginTop: 8, paddingTop: 8, borderTop: '1px solid #4a5568' }}>
              <span style={{ fontWeight: '600' }}>Category Colors:</span> Left border and small dot indicate task category
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
          <p style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: '500', color: '#ffffff' }}>No scheduled care tasks</p>
          <p style={{ margin: 0, color: '#a0aec0' }}>No care tasks scheduled for today and yesterday.</p>
        </div>
      )}
    </div>
  );
};

export default CareTaskScheduledView;
