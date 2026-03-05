import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import { PatientSelectorModal } from './components';
import config from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import {
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MedicationsIcon,
  NutritionIcon,
  TasksIcon,
  CheckIcon,
  ClockIcon,
  PatientsIcon,
  XIcon,
  EditIcon,
  PrintIcon
} from '../../components/Icons';
import { getCurrentLocalDateTime, localDateTimeToUTC } from '../../utils/timezone';
import './AdminV2.css';

const AdminV2Schedule = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const scrollContainerRef = useRef(null);
  const { 
    patients, 
    selectedPatient: contextPatient, 
    selectPatient: setContextPatient,
    loadingPatients 
  } = useAdminPatient();
  
  // Use context patient as the source of truth
  const selectedPatient = contextPatient;
  const [showPatientModal, setShowPatientModal] = useState(false);
  
  // Schedule date state
  const [selectedDate, setSelectedDate] = useState(new Date());
  
  // Mobile tab state (for showing one section at a time on mobile)
  const [mobileTab, setMobileTab] = useState('medications');
  
  // Schedule data state
  const [scheduleData, setScheduleData] = useState({
    medications: [],
    nutrition: [],
    care_tasks: []
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [completing, setCompleting] = useState({}); // Track items being completed
  
  // Completion modal state
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completeModalData, setCompleteModalData] = useState({
    type: null, // 'medication', 'nutrition', 'care-task'
    items: [], // single item or multiple for bulk
    isBulk: false,
    hour: null
  });
  const [completeFormData, setCompleteFormData] = useState({
    completed_at: '',
    notes: '',
    // Medication-specific
    dose_amount: '',
    dose_unit: '',
    // Nutrition-specific
    amount: '',
    amount_unit: '',
    item_name: ''
  });

  // Format date for API (YYYY-MM-DD)
  const formatDateForApi = (date) => {
    return date.toISOString().split('T')[0];
  };

  // Format date for display
  const formatDateDisplay = (date) => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  // Check if date is today
  const isToday = (date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  // Navigation functions
  const goToPreviousDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() - 1);
    setSelectedDate(newDate);
  };

  const goToNextDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + 1);
    setSelectedDate(newDate);
  };

  const goToToday = () => {
    setSelectedDate(new Date());
  };

  // Check URL params for patient ID or use context patient
  useEffect(() => {
    const patientId = searchParams.get('patient');
    if (patientId && patients.length > 0) {
      const patient = patients.find(p => p.id === parseInt(patientId));
      if (patient && patient.id !== contextPatient?.id) {
        setContextPatient(patient);
      }
    } else if (!patientId && !contextPatient && patients.length > 0 && !loadingPatients) {
      setShowPatientModal(true);
    }
  }, [searchParams, patients, loadingPatients]);

  // Update URL when context patient changes
  useEffect(() => {
    if (contextPatient && searchParams.get('patient') !== String(contextPatient.id)) {
      setSearchParams({ patient: contextPatient.id });
    }
  }, [contextPatient]);

  // Fetch schedule when patient or date changes
  useEffect(() => {
    if (selectedPatient) {
      fetchSchedule();
    }
  }, [selectedPatient, selectedDate]);

  // Scroll to current hour on load
  useEffect(() => {
    if (scrollContainerRef.current && isToday(selectedDate)) {
      const currentHour = new Date().getHours();
      const hourRow = scrollContainerRef.current.querySelector(`[data-hour="${currentHour}"]`);
      if (hourRow) {
        hourRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [scheduleData, selectedDate]);

  const fetchSchedule = async () => {
    if (!selectedPatient) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const dateParam = formatDateForApi(selectedDate);
      const response = await fetch(
        `${config.apiUrl}/api/schedule/daily?patient_id=${selectedPatient.id}&target_date=${dateParam}`,
        { credentials: 'include' }
      );

      if (response.ok) {
        const data = await response.json();
        
        // Convert UTC scheduled times to local timezone for display
        // Backend returns times in UTC, we need to compute local hour/minute
        const convertToLocalTime = (item) => {
          if (!item.scheduled_time) return item;
          // Ensure the time is parsed as UTC (add Z if missing)
          const utcTime = item.scheduled_time.endsWith('Z') || item.scheduled_time.includes('+') 
            ? item.scheduled_time 
            : item.scheduled_time + 'Z';
          const localDate = new Date(utcTime);
          return {
            ...item,
            hour: localDate.getHours(),
            minute: localDate.getMinutes()
          };
        };
        
        setScheduleData({
          medications: (data.medications || []).map(convertToLocalTime),
          nutrition: (data.nutrition || []).map(convertToLocalTime),
          care_tasks: (data.care_tasks || []).map(convertToLocalTime)
        });
      } else {
        setError('Failed to load schedule');
      }
    } catch (err) {
      setError('Error connecting to server');
      console.error('Error fetching schedule:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPatient = (patient) => {
    setContextPatient(patient);
    setShowPatientModal(false);
  };

  // Open completion modal for a single item
  const openCompleteModal = (type, item) => {
    if (item.completed) return;
    
    setCompleteModalData({
      type,
      items: [item],
      isBulk: false,
      hour: item.hour
    });
    
    // Pre-fill form with item data
    setCompleteFormData({
      completed_at: getCurrentLocalDateTime(),
      notes: '',
      dose_amount: item.dose_amount || '',
      dose_unit: item.dose_unit || '',
      amount: item.default_amount || '',
      amount_unit: item.default_amount_unit || '',
      item_name: item.default_item || item.name || ''
    });
    
    setShowCompleteModal(true);
  };

  // Open completion modal for all items in an hour
  const openCompleteHourModal = (hour, type) => {
    const items = type === 'medication' ? medicationsByHour[hour] :
                  type === 'nutrition' ? nutritionByHour[hour] :
                  careTasksByHour[hour];
    
    const incompleteItems = items?.filter(i => !i.completed) || [];
    if (incompleteItems.length === 0) return;
    
    setCompleteModalData({
      type,
      items: incompleteItems,
      isBulk: true,
      hour
    });
    
    // Pre-fill form with first item's data or defaults
    const firstItem = incompleteItems[0];
    setCompleteFormData({
      completed_at: getCurrentLocalDateTime(),
      notes: '',
      dose_amount: firstItem?.dose_amount || '',
      dose_unit: firstItem?.dose_unit || '',
      amount: firstItem?.default_amount || '',
      amount_unit: firstItem?.default_amount_unit || '',
      item_name: firstItem?.default_item || firstItem?.name || ''
    });
    
    setShowCompleteModal(true);
  };

  // Submit completion from modal
  const handleSubmitCompletion = async () => {
    const { type, items, isBulk } = completeModalData;
    
    // Create completion key for loading state
    const loadingKey = isBulk 
      ? `hour-${completeModalData.hour}-${type}`
      : `${type}-${items[0].schedule_id}-${items[0].scheduled_time}`;
    
    setCompleting(prev => ({ ...prev, [loadingKey]: true }));
    
    try {
      if (isBulk) {
        // Bulk completion
        const payload = {
          medications: [],
          nutrition: [],
          care_tasks: []
        };
        
        const key = type === 'medication' ? 'medications' : 
                   type === 'nutrition' ? 'nutrition' : 'care_tasks';
        
        payload[key] = items.map(item => ({
          schedule_id: item.schedule_id,
          scheduled_time: item.scheduled_time,
          patient_id: selectedPatient.id,
          user_id: user?.id || null,
          notes: completeFormData.notes || null,
          completed_at: localDateTimeToUTC(completeFormData.completed_at),
          // Include type-specific data
          ...(type === 'medication' && { 
            dose_amount: completeFormData.dose_amount || item.dose_amount,
            dose_unit: completeFormData.dose_unit || item.dose_unit
          }),
          ...(type === 'nutrition' && {
            amount: completeFormData.amount || item.default_amount,
            amount_unit: completeFormData.amount_unit || item.default_amount_unit,
            item_name: completeFormData.item_name || item.default_item
          })
        }));
        
        const response = await fetch(`${config.apiUrl}/api/schedule/complete/bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload)
        });
        
        if (response.ok) {
          setScheduleData(prev => ({
            ...prev,
            [key]: prev[key].map(i => {
              const wasCompleted = items.some(
                inc => inc.schedule_id === i.schedule_id && inc.scheduled_time === i.scheduled_time
              );
              return wasCompleted ? { ...i, completed: true } : i;
            })
          }));
          setShowCompleteModal(false);
        }
      } else {
        // Single item completion
        const item = items[0];
        const response = await fetch(`${config.apiUrl}/api/schedule/complete/${type}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            schedule_id: item.schedule_id,
            scheduled_time: item.scheduled_time,
            patient_id: selectedPatient.id,
            user_id: user?.id || null,
            notes: completeFormData.notes || null,
            completed_at: localDateTimeToUTC(completeFormData.completed_at),
            // Include type-specific data
            ...(type === 'medication' && { 
              dose_amount: completeFormData.dose_amount,
              dose_unit: completeFormData.dose_unit
            }),
            ...(type === 'nutrition' && {
              amount: completeFormData.amount,
              amount_unit: completeFormData.amount_unit,
              item_name: completeFormData.item_name
            })
          })
        });
        
        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            const key = type === 'medication' ? 'medications' : 
                       type === 'nutrition' ? 'nutrition' : 'care_tasks';
            setScheduleData(prev => ({
              ...prev,
              [key]: prev[key].map(i => 
                i.schedule_id === item.schedule_id && i.scheduled_time === item.scheduled_time
                  ? { ...i, completed: true }
                  : i
              )
            }));
            setShowCompleteModal(false);
          }
        }
      }
    } catch (err) {
      console.error(`Error completing ${type}:`, err);
    } finally {
      setCompleting(prev => ({ ...prev, [loadingKey]: false }));
    }
  };

  // Legacy handlers that now open modal (keeping for backwards compatibility if needed)
  const handleCompleteItem = (type, item) => {
    openCompleteModal(type, item);
  };

  const handleCompleteHour = (hour, type) => {
    openCompleteHourModal(hour, type);
  };

  const handlePrintSchedule = () => {
    // Add print class to body for print-specific styles
    document.body.classList.add('printing-schedule');
    window.print();
    // Remove the class after printing
    setTimeout(() => {
      document.body.classList.remove('printing-schedule');
    }, 100);
  };

  // Group items by hour
  const getItemsByHour = (items) => {
    const byHour = {};
    for (let h = 0; h < 24; h++) {
      byHour[h] = [];
    }
    items.forEach(item => {
      if (byHour[item.hour] !== undefined) {
        byHour[item.hour].push(item);
      }
    });
    return byHour;
  };

  const medicationsByHour = getItemsByHour(scheduleData.medications);
  const nutritionByHour = getItemsByHour(scheduleData.nutrition);
  const careTasksByHour = getItemsByHour(scheduleData.care_tasks);

  // Format hour for display
  const formatHour = (hour) => {
    if (hour === 0) return '12 AM';
    if (hour < 12) return `${hour} AM`;
    if (hour === 12) return '12 PM';
    return `${hour - 12} PM`;
  };

  // Check if an hour row has any items
  const hasItemsInHour = (hour) => {
    return medicationsByHour[hour]?.length > 0 || 
           nutritionByHour[hour]?.length > 0 || 
           careTasksByHour[hour]?.length > 0;
  };

  // Get current hour for highlighting
  const currentHour = isToday(selectedDate) ? new Date().getHours() : -1;

  // Count totals for summary
  const totalMeds = scheduleData.medications.length;
  const completedMeds = scheduleData.medications.filter(m => m.completed).length;
  const totalNutrition = scheduleData.nutrition.length;
  const completedNutrition = scheduleData.nutrition.filter(n => n.completed).length;
  const totalTasks = scheduleData.care_tasks.length;
  const completedTasks = scheduleData.care_tasks.filter(t => t.completed).length;

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        {selectedPatient ? (
          <>
            {error && (
              <div className="admin-v2-error-banner">{error}</div>
            )}

            {/* Date Navigation */}
            <div className="admin-v2-schedule-nav">
              <button 
                className="admin-v2-btn admin-v2-btn-icon"
                onClick={goToPreviousDay}
                title="Previous Day"
              >
                <ChevronLeftIcon size={20} />
              </button>
              
              <div className="admin-v2-schedule-date">
                <CalendarIcon size={18} />
                <span>{formatDateDisplay(selectedDate)}</span>
                {isToday(selectedDate) && (
                  <span className="admin-v2-today-badge">Today</span>
                )}
              </div>
              
              <button 
                className="admin-v2-btn admin-v2-btn-icon"
                onClick={goToNextDay}
                title="Next Day"
              >
                <ChevronRightIcon size={20} />
              </button>

              {!isToday(selectedDate) && (
                <button 
                  className="admin-v2-btn admin-v2-btn-sm"
                  onClick={goToToday}
                  style={{ marginLeft: '1rem' }}
                >
                  Go to Today
                </button>
              )}

              <input
                type="date"
                value={formatDateForApi(selectedDate)}
                onChange={(e) => setSelectedDate(new Date(e.target.value + 'T00:00:00'))}
                className="admin-v2-date-picker"
              />

              <button 
                className="admin-v2-btn admin-v2-btn-primary"
                onClick={handlePrintSchedule}
                title="Print Schedule"
                style={{ marginLeft: 'auto' }}
              >
                <PrintIcon size={16} />
                Print
              </button>
            </div>

            {/* Summary Stats - aligned to schedule columns */}
            <div className="admin-v2-summary-stats admin-v2-schedule-stats" style={{ marginBottom: '1.5rem' }}>
              <div className="admin-v2-schedule-stats-spacer" />
              <div className="admin-v2-stat-card">
                <div className="admin-v2-stat-icon medications">
                  <MedicationsIcon size={24} />
                </div>
                <div className="admin-v2-stat-info">
                  <h4>{completedMeds}/{totalMeds}</h4>
                  <p>Medications</p>
                </div>
              </div>
              <div className="admin-v2-stat-card">
                <div className="admin-v2-stat-icon nutrition">
                  <NutritionIcon size={24} />
                </div>
                <div className="admin-v2-stat-info">
                  <h4>{completedNutrition}/{totalNutrition}</h4>
                  <p>Nutrition</p>
                </div>
              </div>
              <div className="admin-v2-stat-card">
                <div className="admin-v2-stat-icon tasks">
                  <TasksIcon size={24} />
                </div>
                <div className="admin-v2-stat-info">
                  <h4>{completedTasks}/{totalTasks}</h4>
                  <p>Care Tasks</p>
                </div>
              </div>
            </div>

            {/* Mobile Tab Toggle */}
            <div className="admin-v2-schedule-mobile-tabs">
              <button
                className={`admin-v2-schedule-mobile-tab ${mobileTab === 'medications' ? 'active' : ''}`}
                onClick={() => setMobileTab('medications')}
              >
                <MedicationsIcon size={16} />
                <span>Meds</span>
                <span className="admin-v2-schedule-mobile-tab-count">{completedMeds}/{totalMeds}</span>
              </button>
              <button
                className={`admin-v2-schedule-mobile-tab ${mobileTab === 'nutrition' ? 'active' : ''}`}
                onClick={() => setMobileTab('nutrition')}
              >
                <NutritionIcon size={16} />
                <span>Nutrition</span>
                <span className="admin-v2-schedule-mobile-tab-count">{completedNutrition}/{totalNutrition}</span>
              </button>
              <button
                className={`admin-v2-schedule-mobile-tab ${mobileTab === 'tasks' ? 'active' : ''}`}
                onClick={() => setMobileTab('tasks')}
              >
                <TasksIcon size={16} />
                <span>Tasks</span>
                <span className="admin-v2-schedule-mobile-tab-count">{completedTasks}/{totalTasks}</span>
              </button>
            </div>

            {/* Schedule Grid */}
            <div className={`admin-v2-schedule-container mobile-tab-${mobileTab}`}>
              {loading ? (
                <div className="admin-v2-loading">Loading schedule...</div>
              ) : (
                <>
                  {/* Column Headers */}
                  <div className="admin-v2-schedule-header">
                    <div className="admin-v2-schedule-time-col">Time</div>
                    <div className="admin-v2-schedule-col medications">
                      <MedicationsIcon size={16} />
                      <span>Medications</span>
                    </div>
                    <div className="admin-v2-schedule-col nutrition">
                      <NutritionIcon size={16} />
                      <span>Nutrition</span>
                    </div>
                    <div className="admin-v2-schedule-col tasks">
                      <TasksIcon size={16} />
                      <span>Care Tasks</span>
                    </div>
                  </div>

                  {/* Scrollable Hour Rows */}
                  <div className="admin-v2-schedule-body" ref={scrollContainerRef}>
                    {[...Array(24)].map((_, hour) => (
                      <div 
                        key={hour} 
                        className={`admin-v2-schedule-row ${hour === currentHour ? 'current-hour' : ''} ${hasItemsInHour(hour) ? 'has-items' : ''}`}
                        data-hour={hour}
                      >
                        {/* Time Column */}
                        <div className="admin-v2-schedule-time-col">
                          <span className="admin-v2-hour-label">{formatHour(hour)}</span>
                        </div>

                        {/* Medications Column */}
                        <div className="admin-v2-schedule-col medications">
                          {medicationsByHour[hour]?.length > 0 && (
                            <div className="admin-v2-schedule-group medication">
                              {medicationsByHour[hour].some(m => !m.completed) && (
                                <button
                                  className="admin-v2-schedule-complete-all"
                                  onClick={() => handleCompleteHour(hour, 'medication')}
                                  disabled={completing[`hour-${hour}-medication`]}
                                  title="Complete all medications this hour"
                                >
                                  {completing[`hour-${hour}-medication`] ? '...' : <CheckIcon size={12} />}
                                </button>
                              )}
                              {medicationsByHour[hour].map((med, idx) => {
                                const itemKey = `medication-${med.schedule_id}-${med.scheduled_time}`;
                                return (
                                  <React.Fragment key={`med-${med.schedule_id}-${idx}`}>
                                    {idx > 0 && <div className="admin-v2-schedule-divider" />}
                                    <div 
                                      className={`admin-v2-schedule-item ${med.completed ? 'completed' : 'clickable'} ${completing[itemKey] ? 'completing' : ''}`}
                                      onClick={() => !med.completed && handleCompleteItem('medication', med)}
                                      role="button"
                                      tabIndex={med.completed ? -1 : 0}
                                    >
                                      <div className="admin-v2-schedule-item-header">
                                        <span className="admin-v2-schedule-item-time">
                                          <ClockIcon size={12} />
                                          {String(med.hour).padStart(2, '0')}:{String(med.minute).padStart(2, '0')}
                                        </span>
                                        <span className="admin-v2-schedule-item-name">{med.name}</span>
                                        {med.dose_amount && (
                                          <span className="admin-v2-schedule-item-dose">
                                            {med.dose_amount} {med.dose_unit}
                                          </span>
                                        )}
                                        <span className={`admin-v2-schedule-item-check ${med.completed ? 'checked' : ''}`}>
                                          {completing[itemKey] ? '...' : <CheckIcon size={14} />}
                                        </span>
                                      </div>
                                    </div>
                                  </React.Fragment>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Nutrition Column */}
                        <div className="admin-v2-schedule-col nutrition">
                          {nutritionByHour[hour]?.length > 0 && (
                            <div className="admin-v2-schedule-group nutrition">
                              {nutritionByHour[hour].some(n => !n.completed) && (
                                <button
                                  className="admin-v2-schedule-complete-all"
                                  onClick={() => handleCompleteHour(hour, 'nutrition')}
                                  disabled={completing[`hour-${hour}-nutrition`]}
                                  title="Complete all nutrition this hour"
                                >
                                  {completing[`hour-${hour}-nutrition`] ? '...' : <CheckIcon size={12} />}
                                </button>
                              )}
                              {nutritionByHour[hour].map((item, idx) => {
                                const itemKey = `nutrition-${item.schedule_id}-${item.scheduled_time}`;
                                return (
                                  <React.Fragment key={`nutr-${item.schedule_id}-${idx}`}>
                                    {idx > 0 && <div className="admin-v2-schedule-divider" />}
                                    <div 
                                      className={`admin-v2-schedule-item ${item.completed ? 'completed' : 'clickable'} ${completing[itemKey] ? 'completing' : ''}`}
                                      onClick={() => !item.completed && handleCompleteItem('nutrition', item)}
                                      role="button"
                                      tabIndex={item.completed ? -1 : 0}
                                    >
                                      <div className="admin-v2-schedule-item-header">
                                        <span className="admin-v2-schedule-item-time">
                                          <ClockIcon size={12} />
                                          {String(item.hour).padStart(2, '0')}:{String(item.minute).padStart(2, '0')}
                                        </span>
                                        <span className="admin-v2-schedule-item-name">{item.name}</span>
                                        {(item.default_amount || item.default_item) && (
                                          <span className="admin-v2-schedule-item-dose">
                                            {item.default_item && <span>{item.default_item}</span>}
                                            {item.default_amount && (
                                              <span> {item.default_amount} {item.default_amount_unit || ''}</span>
                                            )}
                                          </span>
                                        )}
                                        <span className={`admin-v2-schedule-item-check ${item.completed ? 'checked' : ''}`}>
                                          {completing[itemKey] ? '...' : <CheckIcon size={14} />}
                                        </span>
                                      </div>
                                    </div>
                                  </React.Fragment>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Care Tasks Column */}
                        <div className="admin-v2-schedule-col tasks">
                          {careTasksByHour[hour]?.length > 0 && (
                            <div className="admin-v2-schedule-group care-task">
                              {careTasksByHour[hour].some(t => !t.completed) && (
                                <button
                                  className="admin-v2-schedule-complete-all"
                                  onClick={() => handleCompleteHour(hour, 'care-task')}
                                  disabled={completing[`hour-${hour}-care-task`]}
                                  title="Complete all care tasks this hour"
                                >
                                  {completing[`hour-${hour}-care-task`] ? '...' : <CheckIcon size={12} />}
                                </button>
                              )}
                              {careTasksByHour[hour].map((task, idx) => {
                                const itemKey = `care-task-${task.schedule_id}-${task.scheduled_time}`;
                                return (
                                  <React.Fragment key={`task-${task.schedule_id}-${idx}`}>
                                    {idx > 0 && (
                                      <div 
                                        className="admin-v2-schedule-divider"
                                        style={task.category_color !== careTasksByHour[hour][idx-1]?.category_color ? {
                                          height: '2px',
                                          background: `linear-gradient(to right, ${careTasksByHour[hour][idx-1]?.category_color || '#a371f7'}, ${task.category_color || '#a371f7'})`
                                        } : {}}
                                      />
                                    )}
                                    <div 
                                      className={`admin-v2-schedule-item ${task.completed ? 'completed' : 'clickable'} ${completing[itemKey] ? 'completing' : ''}`}
                                      onClick={() => !task.completed && handleCompleteItem('care-task', task)}
                                      role="button"
                                      tabIndex={task.completed ? -1 : 0}
                                      style={task.category_color ? { borderLeft: `3px solid ${task.category_color}` } : {}}
                                    >
                                      <div className="admin-v2-schedule-item-header">
                                        <span className="admin-v2-schedule-item-time">
                                          <ClockIcon size={12} />
                                          {String(task.hour).padStart(2, '0')}:{String(task.minute).padStart(2, '0')}
                                        </span>
                                        <span className="admin-v2-schedule-item-name">{task.name}</span>
                                        {task.category_name && (
                                          <span 
                                            className="admin-v2-schedule-item-category"
                                            style={task.category_color ? { backgroundColor: task.category_color + '20', color: task.category_color } : {}}
                                          >
                                            {task.category_name}
                                          </span>
                                        )}
                                        <span className={`admin-v2-schedule-item-check ${task.completed ? 'checked' : ''}`}>
                                          {completing[itemKey] ? '...' : <CheckIcon size={14} />}
                                        </span>
                                      </div>
                                    </div>
                                  </React.Fragment>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="schedule-select-patient">
            <h2>Select a Patient</h2>
            <p>Choose a patient to view their daily schedule</p>
            <button 
              className="admin-v2-btn admin-v2-btn-primary"
              onClick={() => setShowPatientModal(true)}
            >
              Select Patient
            </button>
          </div>
        )}

        {/* Patient Selection Modal */}
        {showPatientModal && (
          <PatientSelectorModal
            patients={patients}
            selectedPatient={selectedPatient}
            onSelectPatient={handleSelectPatient}
            onClose={() => setShowPatientModal(false)}
            loading={loadingPatients}
          />
        )}

        {/* Completion Confirmation Modal */}
        {showCompleteModal && (
          <div className="admin-v2-modal-overlay" onClick={() => setShowCompleteModal(false)}>
            <div className="admin-v2-modal admin-v2-modal-sm" onClick={e => e.stopPropagation()}>
              <div className="admin-v2-modal-header">
                <h2>
                  {completeModalData.isBulk 
                    ? `Complete ${completeModalData.items.length} ${completeModalData.type === 'medication' ? 'Medication' : completeModalData.type === 'nutrition' ? 'Nutrition' : 'Care Task'}${completeModalData.items.length > 1 ? 's' : ''}`
                    : `Complete ${completeModalData.type === 'medication' ? 'Medication' : completeModalData.type === 'nutrition' ? 'Nutrition' : 'Care Task'}`
                  }
                </h2>
                <button className="admin-v2-modal-close" onClick={() => setShowCompleteModal(false)}>
                  <XIcon size={20} />
                </button>
              </div>
              
              <div className="admin-v2-modal-body">
                {/* Item Summary */}
                <div style={{ 
                  background: '#21262d', 
                  borderRadius: '6px', 
                  padding: '1rem', 
                  marginBottom: '1.5rem' 
                }}>
                  {completeModalData.items.map((item, idx) => (
                    <div key={idx} style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      padding: idx > 0 ? '0.5rem 0 0' : 0,
                      borderTop: idx > 0 ? '1px solid #30363d' : 'none',
                      marginTop: idx > 0 ? '0.5rem' : 0
                    }}>
                      <span style={{ fontWeight: 500, color: '#e6edf3' }}>{item.name}</span>
                      <span style={{ color: '#8b949e', fontSize: '0.85rem' }}>
                        Scheduled: {String(item.hour).padStart(2, '0')}:{String(item.minute).padStart(2, '0')}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Completion Time */}
                <div className="admin-v2-form-group">
                  <label>Completed At *</label>
                  <input
                    type="datetime-local"
                    value={completeFormData.completed_at}
                    onChange={e => setCompleteFormData({...completeFormData, completed_at: e.target.value})}
                    style={{ width: '100%' }}
                  />
                  <small style={{ color: '#8b949e' }}>Adjust if completed at a different time</small>
                </div>

                {/* Medication-specific fields */}
                {completeModalData.type === 'medication' && !completeModalData.isBulk && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="admin-v2-form-group">
                      <label>Dose Amount</label>
                      <input
                        type="number"
                        step="0.1"
                        value={completeFormData.dose_amount}
                        onChange={e => setCompleteFormData({...completeFormData, dose_amount: e.target.value})}
                        placeholder="Amount given"
                      />
                    </div>
                    <div className="admin-v2-form-group">
                      <label>Unit</label>
                      <input
                        type="text"
                        value={completeFormData.dose_unit}
                        onChange={e => setCompleteFormData({...completeFormData, dose_unit: e.target.value})}
                        placeholder="mg, ml, tablets..."
                      />
                    </div>
                  </div>
                )}

                {/* Nutrition-specific fields */}
                {completeModalData.type === 'nutrition' && !completeModalData.isBulk && (
                  <>
                    <div className="admin-v2-form-group">
                      <label>Item Name</label>
                      <input
                        type="text"
                        value={completeFormData.item_name}
                        onChange={e => setCompleteFormData({...completeFormData, item_name: e.target.value})}
                        placeholder="What was consumed?"
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div className="admin-v2-form-group">
                        <label>Amount</label>
                        <input
                          type="number"
                          step="0.1"
                          value={completeFormData.amount}
                          onChange={e => setCompleteFormData({...completeFormData, amount: e.target.value})}
                          placeholder="Amount"
                        />
                      </div>
                      <div className="admin-v2-form-group">
                        <label>Unit</label>
                        <select
                          value={completeFormData.amount_unit}
                          onChange={e => setCompleteFormData({...completeFormData, amount_unit: e.target.value})}
                        >
                          <option value="">Select...</option>
                          <option value="ml">ml</option>
                          <option value="oz">oz</option>
                          <option value="cups">cups</option>
                          <option value="grams">grams</option>
                          <option value="servings">servings</option>
                        </select>
                      </div>
                    </div>
                  </>
                )}

                {/* Notes */}
                <div className="admin-v2-form-group">
                  <label>Notes (optional)</label>
                  <textarea
                    value={completeFormData.notes}
                    onChange={e => setCompleteFormData({...completeFormData, notes: e.target.value})}
                    placeholder="Any additional notes..."
                    rows={2}
                  />
                </div>
              </div>

              <div className="admin-v2-modal-footer">
                <button 
                  type="button" 
                  className="admin-v2-btn"
                  onClick={() => setShowCompleteModal(false)}
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  className="admin-v2-btn admin-v2-btn-primary"
                  onClick={handleSubmitCompletion}
                  disabled={Object.values(completing).some(v => v)}
                >
                  {Object.values(completing).some(v => v) ? 'Saving...' : 'Mark Complete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Schedule;
