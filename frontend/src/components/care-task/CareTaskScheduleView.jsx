import React, { useState, useEffect } from 'react';
import config from '../../config';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import { localTimeToUTC, parseCronExpression } from '../../utils/timezone';

const CareTaskScheduleView = ({ taskId, taskName, onClose }) => {
  const { selectedPatient } = useAdminPatient();
  const [schedules, setSchedules] = useState([]);
  const [scheduleMode, setScheduleMode] = useState('weekly'); // 'weekly' or 'monthly'
  const [selectedDays, setSelectedDays] = useState([]); // for weekly
  const [selectedDayOfMonth, setSelectedDayOfMonth] = useState(1); // for monthly
  const [time, setTime] = useState('08:00');
  const [loading, setLoading] = useState(false);
  const [taskDetails, setTaskDetails] = useState(null);
  const [isNutritionTask, setIsNutritionTask] = useState(false);
  
  // Nutrition-specific fields
  const [nutritionData, setNutritionData] = useState({
    item_type: 'liquid', // 'food' or 'liquid'
    item_name: '',
    amount: '',
    amount_unit: 'ml',
    calories: '',
    notes: ''
  });

  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  useEffect(() => {
    fetchSchedules();
    fetchTaskDetails();
  }, [taskId]);

  const fetchTaskDetails = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/care-tasks/${taskId}`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        const task = data.care_task; // Extract the actual task from the nested response
        setTaskDetails(task);
        
        // Check if this is a nutrition-related task
        if (task.category_name) {
          const nutritionKeywords = ['nutrition', 'feeding', 'meal', 'food', 'drink', 'supplement'];
          const isNutrition = nutritionKeywords.some(keyword => 
            task.category_name.toLowerCase().includes(keyword)
          );
          setIsNutritionTask(isNutrition);
          console.log('Task category:', task.category_name, 'Is nutrition:', isNutrition);
        }
      }
    } catch (error) {
      console.error('Error fetching task details:', error);
    }
  };

  const fetchSchedules = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/care-tasks/${taskId}/schedules`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        console.log('Fetched schedules:', data);
        setSchedules(data.schedules || data); // Handle both {schedules: [...]} and [...] formats
      }
    } catch (error) {
      console.error('Error fetching schedules:', error);
    }
  };

  // Helper function to separate schedules by type
  const separateSchedules = (schedules) => {
    const weekly = [];
    const monthly = [];
    
    schedules.forEach((schedule) => {
      const cronExpression = schedule.cron_expression;
      const isActive = schedule.active;
      const scheduleId = schedule.id;
      const description = schedule.description;
      
      const parsed = parseCronExpression(cronExpression);
      if (parsed) {
        const scheduleObj = {
          id: scheduleId,
          isActive,
          parsed,
          description
        };
        
        if (parsed.type === 'weekly') {
          weekly.push(scheduleObj);
        } else if (parsed.type === 'monthly') {
          monthly.push(scheduleObj);
        }
      }
    });
    
    return { weekly, monthly };
  };

  const handleAddSchedule = async () => {
    let cron = '';
    let description = '';
    // Convert local time to UTC for cron expression (DB stores in UTC)
    const utc = localTimeToUTC(time);
    
    if (scheduleMode === 'weekly') {
      if (selectedDays.length === 0) return;
      const dow = selectedDays.sort().join(',');
      cron = `${utc.minute} ${utc.hour} * * ${dow}`;
      
      // Generate human-readable description for weekly schedule
      const daysMap = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const dayNames = selectedDays.map(d => daysMap[parseInt(d)]).join(', ');
      description = `${dayNames} at ${time}`;
    } else {
      cron = `${utc.minute} ${utc.hour} ${selectedDayOfMonth} * *`;
      
      // Generate human-readable description for monthly schedule
      description = `Day ${selectedDayOfMonth} of each month at ${time}`;
    }
    
    // Prepare notes with nutrition data if applicable
    let notes = null;
    if (isNutritionTask && nutritionData.item_name && nutritionData.amount) {
      notes = JSON.stringify({
        nutrition: {
          item_type: nutritionData.item_type,
          item_name: nutritionData.item_name,
          amount: parseFloat(nutritionData.amount),
          amount_unit: nutritionData.amount_unit,
          calories: nutritionData.calories ? parseFloat(nutritionData.calories) : null
        },
        custom_notes: nutritionData.notes
      });
    }
    
    try {
      setLoading(true);
      const response = await fetch(`${config.apiUrl}/api/add/care-task-schedule/${taskId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          cron_expression: cron,
          description: description,
          active: true,
          notes: notes,
          patient_id: selectedPatient ? selectedPatient.id : null
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to add schedule');
      }
      
      // Refresh schedules
      await fetchSchedules();
      
      // Reset form
      setSelectedDays([]);
      setSelectedDayOfMonth(1);
      setTime('08:00');
      setScheduleMode('weekly');
      setNutritionData({
        item_type: 'liquid',
        item_name: '',
        amount: '',
        amount_unit: 'ml',
        calories: '',
        notes: ''
      });
    } catch (error) {
      console.error('Error adding schedule:', error);
      alert(`Error adding schedule: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSchedule = async (scheduleId) => {
    if (!confirm('Are you sure you want to delete this schedule?')) return;
    
    try {
      setLoading(true);
      const response = await fetch(`${config.apiUrl}/api/care-task-schedules/${scheduleId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete schedule');
      }
      
      // Refresh schedules
      await fetchSchedules();
    } catch (error) {
      console.error('Error deleting schedule:', error);
      alert('Error deleting schedule. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSchedule = async (scheduleId) => {
    try {
      setLoading(true);
      const response = await fetch(`${config.apiUrl}/api/care-task-schedules/${scheduleId}/toggle-active`, {
        method: 'POST',
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to toggle schedule');
      }
      
      // Refresh schedules
      await fetchSchedules();
    } catch (error) {
      console.error('Error toggling schedule:', error);
      alert('Error updating schedule status. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      {/* Current Patient Info */}
      {selectedPatient && (
        <div style={{ 
          marginBottom: 16, 
          padding: 12, 
          backgroundColor: '#e8f4fd', 
          borderRadius: 6, 
          border: '1px solid #b3d7ff',
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          <span style={{ 
            fontSize: 14, 
            color: '#0066cc', 
            fontWeight: 500 
          }}>
            Scheduling for patient: {selectedPatient.first_name} {selectedPatient.last_name}
          </span>
        </div>
      )}

      {/* Add New Schedule Form */}
      <div style={{ marginBottom: 24, padding: 20, backgroundColor: '#f8f9fa', borderRadius: 8, border: '1px solid #dee2e6' }}>
        <h4 style={{ margin: '0 0 16px 0', color: '#333', fontSize: 16, fontWeight: 600 }}>Add New Schedule</h4>
        
        <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => setScheduleMode('weekly')}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: 6,
              background: scheduleMode === 'weekly' ? '#007bff' : '#e9ecef',
              color: scheduleMode === 'weekly' ? '#fff' : '#495057',
              fontWeight: 500,
              fontSize: 14,
              cursor: 'pointer'
            }}
          >
            Weekly
          </button>
          <button
            type="button"
            onClick={() => setScheduleMode('monthly')}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: 6,
              background: scheduleMode === 'monthly' ? '#007bff' : '#e9ecef',
              color: scheduleMode === 'monthly' ? '#fff' : '#495057',
              fontWeight: 500,
              fontSize: 14,
              cursor: 'pointer'
            }}
          >
            Monthly
          </button>
        </div>

        {scheduleMode === 'weekly' && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontWeight: 600, color: '#333', marginBottom: 8, display: 'block' }}>Select Days</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {daysOfWeek.map((day, index) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => {
                    if (selectedDays.includes(index)) {
                      setSelectedDays(selectedDays.filter(d => d !== index));
                    } else {
                      setSelectedDays([...selectedDays, index]);
                    }
                  }}
                  style={{
                    padding: '8px 16px',
                    border: '2px solid #ddd',
                    borderRadius: 6,
                    background: selectedDays.includes(index) ? '#007bff' : '#fff',
                    color: selectedDays.includes(index) ? '#fff' : '#333',
                    fontWeight: 500,
                    fontSize: 14,
                    cursor: 'pointer',
                    minWidth: 50
                  }}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>
        )}

        {scheduleMode === 'monthly' && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontWeight: 600, color: '#333', marginBottom: 8, display: 'block' }}>Day of Month</label>
            <select
              value={selectedDayOfMonth}
              onChange={e => setSelectedDayOfMonth(Number(e.target.value))}
              style={{ 
                padding: '8px 16px', 
                border: '2px solid #ddd', 
                borderRadius: 6, 
                fontSize: 14, 
                background: '#fff', 
                color: '#333',
                minWidth: 100
              }}
            >
              {[...Array(28)].map((_, i) => (
                <option key={i+1} value={i+1}>{i+1}</option>
              ))}
            </select>
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontWeight: 600, color: '#333', marginBottom: 8, display: 'block' }}>Time</label>
          <input
            type="time"
            value={time}
            onChange={e => setTime(e.target.value)}
            style={{ 
              padding: '8px 12px', 
              border: '2px solid #ddd', 
              borderRadius: 6, 
              fontSize: 14, 
              background: '#fff', 
              color: '#333', 
              width: 120 
            }}
          />
        </div>

        {/* Nutrition Fields - Only show for nutrition-related tasks */}
        {isNutritionTask && (
          <div style={{ 
            marginBottom: 20, 
            padding: 20, 
            backgroundColor: '#ffffff', 
            borderRadius: 8, 
            border: '2px solid #e3f2fd',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}>
            <h5 style={{ 
              margin: '0 0 16px 0', 
              color: '#1976d2', 
              fontSize: 16, 
              fontWeight: 600
            }}>
              Nutrition Information
            </h5>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={{ 
                  fontWeight: 600, 
                  color: '#424242', 
                  marginBottom: 6, 
                  display: 'block', 
                  fontSize: 14 
                }}>
                  Type
                </label>
                <select
                  value={nutritionData.item_type}
                  onChange={e => setNutritionData({ ...nutritionData, item_type: e.target.value })}
                  style={{ 
                    padding: '10px 12px', 
                    border: '2px solid #e0e0e0', 
                    borderRadius: 6, 
                    fontSize: 14, 
                    width: '100%',
                    backgroundColor: '#fafafa',
                    transition: 'border-color 0.2s',
                    cursor: 'pointer'
                  }}
                >
                  <option value="liquid">Liquid/Drink</option>
                  <option value="food">Food</option>
                  <option value="supplement">Supplement</option>
                </select>
              </div>

              <div>
                <label style={{ 
                  fontWeight: 600, 
                  color: '#424242', 
                  marginBottom: 6, 
                  display: 'block', 
                  fontSize: 14 
                }}>
                  Item Name
                </label>
                <input
                  type="text"
                  value={nutritionData.item_name}
                  onChange={e => setNutritionData({ ...nutritionData, item_name: e.target.value })}
                  placeholder="e.g., Peptamen, Water, Chicken Soup"
                  style={{ 
                    padding: '10px 12px', 
                    border: '2px solid #e0e0e0', 
                    borderRadius: 6, 
                    fontSize: 14, 
                    width: '100%',
                    backgroundColor: '#fafafa',
                    transition: 'border-color 0.2s'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#1976d2'}
                  onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={{ 
                  fontWeight: 600, 
                  color: '#424242', 
                  marginBottom: 6, 
                  display: 'block', 
                  fontSize: 14 
                }}>
                  Amount
                </label>
                <input
                  type="number"
                  value={nutritionData.amount}
                  onChange={e => setNutritionData({ ...nutritionData, amount: e.target.value })}
                  placeholder="250"
                  style={{ 
                    padding: '10px 12px', 
                    border: '2px solid #e0e0e0', 
                    borderRadius: 6, 
                    fontSize: 14, 
                    width: '100%',
                    backgroundColor: '#fafafa',
                    transition: 'border-color 0.2s'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#1976d2'}
                  onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
                />
              </div>

              <div>
                <label style={{ 
                  fontWeight: 600, 
                  color: '#424242', 
                  marginBottom: 6, 
                  display: 'block', 
                  fontSize: 14 
                }}>
                  Unit
                </label>
                <select
                  value={nutritionData.amount_unit}
                  onChange={e => setNutritionData({ ...nutritionData, amount_unit: e.target.value })}
                  style={{ 
                    padding: '10px 12px', 
                    border: '2px solid #e0e0e0', 
                    borderRadius: 6, 
                    fontSize: 14, 
                    width: '100%',
                    backgroundColor: '#fafafa',
                    transition: 'border-color 0.2s',
                    cursor: 'pointer'
                  }}
                >
                  <option value="ml">ml</option>
                  <option value="oz">oz</option>
                  <option value="cups">cups</option>
                  <option value="grams">grams</option>
                  <option value="servings">servings</option>
                </select>
              </div>

              <div>
                <label style={{ 
                  fontWeight: 600, 
                  color: '#424242', 
                  marginBottom: 6, 
                  display: 'block', 
                  fontSize: 14 
                }}>
                  Calories (optional)
                </label>
                <input
                  type="number"
                  value={nutritionData.calories}
                  onChange={e => setNutritionData({ ...nutritionData, calories: e.target.value })}
                  placeholder="375"
                  style={{ 
                    padding: '10px 12px', 
                    border: '2px solid #e0e0e0', 
                    borderRadius: 6, 
                    fontSize: 14, 
                    width: '100%',
                    backgroundColor: '#fafafa',
                    transition: 'border-color 0.2s'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#1976d2'}
                  onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
                />
              </div>
            </div>

            <div>
              <label style={{ 
                fontWeight: 600, 
                color: '#424242', 
                marginBottom: 6, 
                display: 'block', 
                fontSize: 14 
              }}>
                Notes (optional)
              </label>
              <textarea
                value={nutritionData.notes}
                onChange={e => setNutritionData({ ...nutritionData, notes: e.target.value })}
                placeholder="Additional notes about this nutrition item..."
                rows={3}
                style={{ 
                  padding: '10px 12px', 
                  border: '2px solid #e0e0e0', 
                  borderRadius: 6, 
                  fontSize: 14, 
                  width: '100%',
                  backgroundColor: '#fafafa',
                  transition: 'border-color 0.2s',
                  resize: 'vertical',
                  fontFamily: 'inherit'
                }}
                onFocus={(e) => e.target.style.borderColor = '#1976d2'}
                onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
              />
            </div>
          </div>
        )}

        <div>
          <button
            type="button"
            onClick={handleAddSchedule}
            style={{ 
              padding: '10px 20px', 
              border: 'none', 
              borderRadius: 6, 
              background: '#28a745', 
              color: '#fff', 
              fontWeight: 500, 
              fontSize: 14,
              cursor: 'pointer',
              transition: 'background-color 0.2s'
            }}
            disabled={loading || (scheduleMode === 'weekly' ? selectedDays.length === 0 : false)}
            onMouseOver={(e) => {
              if (!loading && !(scheduleMode === 'weekly' && selectedDays.length === 0)) {
                e.target.style.background = '#1e7e34';
              }
            }}
            onMouseOut={(e) => {
              if (!loading && !(scheduleMode === 'weekly' && selectedDays.length === 0)) {
                e.target.style.background = '#28a745';
              }
            }}
          >
            {loading ? 'Adding...' : 'Add Schedule'}
          </button>
        </div>
      </div>

      {/* Existing Schedules */}
      <div style={{ marginBottom: 16 }}>
        <h4 style={{ 
          margin: '0 0 0 0', 
          color: '#ffffff', 
          fontSize: 18, 
          fontWeight: 600,
          padding: '12px 16px',
          backgroundColor: '#343a40',
          borderRadius: '8px 8px 0 0',
          marginBottom: 0
        }}>
          Current Schedules
        </h4>
        
        <div style={{ 
          backgroundColor: '#ffffff',
          borderRadius: '0 0 8px 8px',
          border: '1px solid #dee2e6',
          borderTop: 'none',
          minHeight: '100px',
          padding: '16px'
        }}>
          {schedules && schedules.length > 0 ? (() => {
            console.log('Rendering schedules:', schedules);
            const { weekly, monthly } = separateSchedules(schedules);
            console.log('Separated schedules - Weekly:', weekly, 'Monthly:', monthly);
            
            return (
              <>
                {weekly.length > 0 && (
                  <div style={{ marginBottom: 24 }}>
                    <h5 style={{ margin: '0 0 12px 0', color: '#495057', fontSize: 14, fontWeight: 600 }}>Weekly Schedules</h5>
                    <div style={{ backgroundColor: '#fff', borderRadius: 8, border: '1px solid #dee2e6', overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f8f9fa' }}>
                            <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#495057', borderBottom: '1px solid #dee2e6' }}>
                              Time
                            </th>
                            <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#495057', borderBottom: '1px solid #dee2e6' }}>
                              Days
                            </th>
                            <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#495057', borderBottom: '1px solid #dee2e6' }}>
                              Description
                            </th>
                            <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: 13, fontWeight: 600, color: '#495057', borderBottom: '1px solid #dee2e6' }}>
                              Status
                            </th>
                            <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: 13, fontWeight: 600, color: '#495057', borderBottom: '1px solid #dee2e6' }}>
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {weekly.map((schedule, index) => (
                            <tr key={schedule.id} style={{ borderBottom: index < weekly.length - 1 ? '1px solid #f1f3f4' : 'none' }}>
                              <td style={{ padding: '12px 16px', fontSize: 14, color: '#333' }}>
                                {schedule.parsed.time}
                              </td>
                              <td style={{ padding: '12px 16px', fontSize: 14, color: '#333' }}>
                                {schedule.parsed.days}
                              </td>
                              <td style={{ padding: '12px 16px', fontSize: 14, color: '#666' }}>
                                {schedule.description || 'No description'}
                              </td>
                              <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                <span style={{ 
                                  padding: '4px 8px', 
                                  borderRadius: 4, 
                                  fontSize: 12, 
                                  fontWeight: 600,
                                  background: schedule.isActive ? '#d4edda' : '#f8d7da',
                                  color: schedule.isActive ? '#155724' : '#721c24'
                                }}>
                                  {schedule.isActive ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                              <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                                  <button
                                    onClick={() => handleToggleSchedule(schedule.id)}
                                    style={{
                                      padding: '4px 8px',
                                      border: 'none',
                                      borderRadius: 4,
                                      background: schedule.isActive ? '#6c757d' : '#28a745',
                                      color: '#fff',
                                      fontSize: 12,
                                      fontWeight: 500,
                                      cursor: 'pointer'
                                    }}
                                  >
                                    {schedule.isActive ? 'Pause' : 'Resume'}
                                  </button>
                                  <button
                                    onClick={() => handleDeleteSchedule(schedule.id)}
                                    style={{
                                      padding: '4px 8px',
                                      border: 'none',
                                      borderRadius: 4,
                                      background: '#dc3545',
                                      color: '#fff',
                                      fontSize: 12,
                                      fontWeight: 500,
                                      cursor: 'pointer'
                                    }}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {monthly.length > 0 && (
                  <div style={{ marginBottom: 24 }}>
                    <h5 style={{ margin: '0 0 12px 0', color: '#495057', fontSize: 14, fontWeight: 600 }}>Monthly Schedules</h5>
                    <div style={{ backgroundColor: '#fff', borderRadius: 8, border: '1px solid #dee2e6', overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f8f9fa' }}>
                            <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#495057', borderBottom: '1px solid #dee2e6' }}>
                              Time
                            </th>
                            <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#495057', borderBottom: '1px solid #dee2e6' }}>
                              Day
                            </th>
                            <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#495057', borderBottom: '1px solid #dee2e6' }}>
                              Description
                            </th>
                            <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: 13, fontWeight: 600, color: '#495057', borderBottom: '1px solid #dee2e6' }}>
                              Status
                            </th>
                            <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: 13, fontWeight: 600, color: '#495057', borderBottom: '1px solid #dee2e6' }}>
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {monthly.map((schedule, index) => (
                            <tr key={schedule.id} style={{ borderBottom: index < monthly.length - 1 ? '1px solid #f1f3f4' : 'none' }}>
                              <td style={{ padding: '12px 16px', fontSize: 14, color: '#333' }}>
                                {schedule.parsed.time}
                              </td>
                              <td style={{ padding: '12px 16px', fontSize: 14, color: '#333' }}>
                                Day {schedule.parsed.dayOfMonth}
                              </td>
                              <td style={{ padding: '12px 16px', fontSize: 14, color: '#666' }}>
                                {schedule.description || 'No description'}
                              </td>
                              <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                <span style={{ 
                                  padding: '4px 8px', 
                                  borderRadius: 4, 
                                  fontSize: 12, 
                                  fontWeight: 600,
                                  background: schedule.isActive ? '#d4edda' : '#f8d7da',
                                  color: schedule.isActive ? '#155724' : '#721c24'
                                }}>
                                  {schedule.isActive ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                              <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                                  <button
                                    onClick={() => handleToggleSchedule(schedule.id)}
                                    style={{
                                      padding: '4px 8px',
                                      border: 'none',
                                      borderRadius: 4,
                                      background: schedule.isActive ? '#6c757d' : '#28a745',
                                      color: '#fff',
                                      fontSize: 12,
                                      fontWeight: 500,
                                      cursor: 'pointer'
                                    }}
                                  >
                                    {schedule.isActive ? 'Pause' : 'Resume'}
                                  </button>
                                  <button
                                    onClick={() => handleDeleteSchedule(schedule.id)}
                                    style={{
                                      padding: '4px 8px',
                                      border: 'none',
                                      borderRadius: 4,
                                      background: '#dc3545',
                                      color: '#fff',
                                      fontSize: 12,
                                      fontWeight: 500,
                                      cursor: 'pointer'
                                    }}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            );
          })() : (
            <div style={{
              textAlign: 'center',
              padding: '40px',
              color: '#666',
              fontSize: 16
            }}>
              <p style={{ margin: 0 }}>No schedules found for this care task.</p>
              <p style={{ margin: '8px 0 0 0', fontSize: 14, color: '#888' }}>
                Add a schedule above to get started.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CareTaskScheduleView;
