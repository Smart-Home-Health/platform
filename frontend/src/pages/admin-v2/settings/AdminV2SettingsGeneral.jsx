import React, { useState, useEffect } from 'react';
import AdminV2Layout from '../AdminV2Layout';
import { useAdminPatient } from '../../../contexts/AdminPatientContext';
import { getSettings, setSetting, updateSettings } from '../../../services/settings';
import config from '../../../config';
import '../AdminV2.css';

/**
 * General Settings page for Admin V2
 * Separates app-wide settings from patient-specific settings
 */
const AdminV2SettingsGeneral = () => {
  const { selectedPatient } = useAdminPatient();
  
  // App-wide settings
  const [appSettings, setAppSettings] = useState({
    chart_time_range: '5m',
    show_statistics: true,
    perfusion_as_percent: false,
    dashboard_chart_1_vital: '',
    dashboard_chart_2_vital: '',
    day_start_hour: 7,
  });
  
  // Patient-specific settings (thresholds)
  const [patientSettings, setPatientSettings] = useState({
    min_spo2: 90,
    max_spo2: 100,
    min_bpm: 55,
    max_bpm: 155,
    daily_calories: 2000,
    daily_water: 2000,
  });
  
  const [availableVitals, setAvailableVitals] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingApp, setIsSavingApp] = useState(false);
  const [isSavingPatient, setIsSavingPatient] = useState(false);
  const [error, setError] = useState(null);
  const [successApp, setSuccessApp] = useState(false);
  const [successPatient, setSuccessPatient] = useState(false);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Load settings and available vitals in parallel
      const [settingsResponse, vitalsResponse, nutritionCheckResponse] = await Promise.all([
        getSettings(),
        fetch(`${config.apiUrl}/api/vitals/types`, { credentials: 'include' }),
        fetch(`${config.apiUrl}/api/nutrition/has-data`, { credentials: 'include' })
      ]);
      
      // Process vitals response
      let vitalsData = [];
      if (vitalsResponse.ok) {
        vitalsData = await vitalsResponse.json();
      }
      
      // Add default vital types that are always available
      const defaultVitals = ['blood_pressure', 'temperature'];
      const allVitals = [...new Set([...defaultVitals, ...vitalsData])];
      
      // Add nutrition if there's data
      if (nutritionCheckResponse.ok) {
        const nutritionCheck = await nutritionCheckResponse.json();
        if (nutritionCheck.has_data) {
          allVitals.push('nutrition');
        }
      }
      
      setAvailableVitals(allVitals);
      
      // Parse settings into app-wide and patient-specific
      const newAppSettings = { ...appSettings };
      const newPatientSettings = { ...patientSettings };
      
      for (const [key, value] of Object.entries(settingsResponse)) {
        let processedValue = value;
        
        // Convert string boolean values to actual booleans
        if (processedValue === "True" || processedValue === "true") {
          processedValue = true;
        } else if (processedValue === "False" || processedValue === "false") {
          processedValue = false;
        }
        
        // App-wide settings
        if (key in newAppSettings) {
          newAppSettings[key] = processedValue;
        }
        
        // Patient-specific settings
        if (key in newPatientSettings) {
          newPatientSettings[key] = processedValue;
        }
      }
      
      setAppSettings(newAppSettings);
      setPatientSettings(newPatientSettings);
      
    } catch (err) {
      console.error("Error loading settings:", err);
      setError("Failed to load settings. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAppInputChange = (key, value) => {
    setAppSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handlePatientInputChange = (key, value) => {
    setPatientSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Helper function to get available options for each chart dropdown
  const getAvailableVitalsForChart = (chartNumber) => {
    const otherChartKey = chartNumber === 1 ? 'dashboard_chart_2_vital' : 'dashboard_chart_1_vital';
    const otherChartValue = appSettings[otherChartKey];
    
    return availableVitals.filter(vital => vital !== otherChartValue || vital === '');
  };

  // Helper function to format vital display names
  const formatVitalDisplayName = (vital) => {
    const displayNames = {
      'blood_pressure': 'Blood Pressure',
      'temperature': 'Temperature',
      'bathroom': 'Bathroom',
      'weight': 'Weight',
      'calories': 'Calories',
      'water': 'Water Intake',
      'nutrition': 'Nutrition (Calories & Water)'
    };
    
    return displayNames[vital] || vital.charAt(0).toUpperCase() + vital.slice(1);
  };

  const saveAppSettings = async () => {
    setError(null);
    setSuccessApp(false);
    setIsSavingApp(true);

    try {
      const settingsToUpdate = {
        chart_time_range: appSettings.chart_time_range,
        show_statistics: appSettings.show_statistics,
        perfusion_as_percent: appSettings.perfusion_as_percent,
        dashboard_chart_1_vital: appSettings.dashboard_chart_1_vital,
        dashboard_chart_2_vital: appSettings.dashboard_chart_2_vital,
        day_start_hour: parseInt(appSettings.day_start_hour),
      };

      await updateSettings(settingsToUpdate);
      
      setSuccessApp(true);
      setTimeout(() => setSuccessApp(false), 3000);
    } catch (err) {
      console.error("Error saving app settings:", err);
      setError("Failed to save app settings. Please try again.");
    } finally {
      setIsSavingApp(false);
    }
  };

  const savePatientSettings = async () => {
    setError(null);
    setSuccessPatient(false);
    setIsSavingPatient(true);

    try {
      // Save each setting individually with proper data type
      const savePromises = [
        setSetting('min_spo2', parseInt(patientSettings.min_spo2), 'int', 'Minimum SpO2 threshold'),
        setSetting('max_spo2', parseInt(patientSettings.max_spo2), 'int', 'Maximum SpO2 threshold'),
        setSetting('min_bpm', parseInt(patientSettings.min_bpm), 'int', 'Minimum heart rate threshold'),
        setSetting('max_bpm', parseInt(patientSettings.max_bpm), 'int', 'Maximum heart rate threshold'),
        setSetting('daily_calories', parseInt(patientSettings.daily_calories), 'int', 'Daily calorie target in kcal'),
        setSetting('daily_water', parseInt(patientSettings.daily_water), 'int', 'Daily water target in ml'),
        setSetting('target_calories', parseInt(patientSettings.daily_calories), 'int', 'Daily calorie target in kcal (alias)'),
        setSetting('target_water', parseInt(patientSettings.daily_water), 'int', 'Daily water target in ml (alias)'),
      ];
      
      await Promise.all(savePromises);
      
      setSuccessPatient(true);
      setTimeout(() => setSuccessPatient(false), 3000);
    } catch (err) {
      console.error("Error saving patient settings:", err);
      setError("Failed to save patient settings. Please try again.");
    } finally {
      setIsSavingPatient(false);
    }
  };

  if (isLoading) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-page">
          <div className="admin-v2-loading">Loading settings...</div>
        </div>
      </AdminV2Layout>
    );
  }

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        <div className="admin-v2-page-header">
          <h1 className="admin-v2-page-title">General Settings</h1>
          <p className="admin-v2-page-subtitle">
            Configure application-wide and patient-specific settings
          </p>
        </div>

        {error && (
          <div className="admin-v2-alert admin-v2-alert-error">
            {error}
          </div>
        )}

        {/* App-Wide Settings Section */}
        <div className="admin-v2-settings-section">
          <div className="admin-v2-settings-section-header">
            <div className="admin-v2-settings-section-title">
              <span className="admin-v2-settings-section-icon app-wide">⚙️</span>
              <div>
                <h2>Application Settings</h2>
                <p>These settings apply to the entire application</p>
              </div>
            </div>
            {successApp && (
              <span className="admin-v2-settings-success">Saved!</span>
            )}
          </div>
          
          <div className="admin-v2-settings-card">
            {/* Chart Display Settings */}
            <div className="admin-v2-settings-group">
              <h3 className="admin-v2-settings-group-title">Dashboard Display</h3>
              
              <div className="admin-v2-settings-row">
                <div className="admin-v2-settings-field">
                  <label>Chart Time Range</label>
                  <select
                    value={appSettings.chart_time_range}
                    onChange={(e) => handleAppInputChange('chart_time_range', e.target.value)}
                    className="admin-v2-input"
                  >
                    <option value="1m">1 Minute</option>
                    <option value="3m">3 Minutes</option>
                    <option value="5m">5 Minutes</option>
                    <option value="10m">10 Minutes</option>
                    <option value="30m">30 Minutes</option>
                    <option value="1h">1 Hour</option>
                  </select>
                  <span className="admin-v2-settings-hint">
                    Amount of historical data shown in SpO₂, Heart Rate, and Perfusion charts
                  </span>
                </div>
                
                <div className="admin-v2-settings-field">
                  <label>Day Start Hour</label>
                  <select
                    value={appSettings.day_start_hour}
                    onChange={(e) => handleAppInputChange('day_start_hour', e.target.value)}
                    className="admin-v2-input"
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>
                        {i === 0 ? '12:00 AM' : i < 12 ? `${i}:00 AM` : i === 12 ? '12:00 PM' : `${i - 12}:00 PM`}
                      </option>
                    ))}
                  </select>
                  <span className="admin-v2-settings-hint">
                    When daily tracking (calories, water) resets
                  </span>
                </div>
              </div>
              
              <div className="admin-v2-settings-checkbox-row">
                <label className="admin-v2-settings-checkbox">
                  <input
                    type="checkbox"
                    checked={appSettings.show_statistics}
                    onChange={(e) => handleAppInputChange('show_statistics', e.target.checked)}
                  />
                  <span className="admin-v2-settings-checkbox-label">Show Value Statistics (Min/Max/Avg)</span>
                </label>
                
                <label className="admin-v2-settings-checkbox">
                  <input
                    type="checkbox"
                    checked={appSettings.perfusion_as_percent}
                    onChange={(e) => handleAppInputChange('perfusion_as_percent', e.target.checked)}
                  />
                  <span className="admin-v2-settings-checkbox-label">Display Perfusion as Percent (%)</span>
                </label>
              </div>
            </div>

            {/* Sub-chart Selection */}
            <div className="admin-v2-settings-group">
              <h3 className="admin-v2-settings-group-title">Dashboard Sub-Charts</h3>
              <p className="admin-v2-settings-group-desc">
                Choose which vitals to display in the two sub-charts below the main dashboard. Each vital can only be used once.
              </p>
              
              <div className="admin-v2-settings-row">
                <div className="admin-v2-settings-field">
                  <label>Chart 1 - Vital Type</label>
                  <select
                    value={appSettings.dashboard_chart_1_vital}
                    onChange={(e) => handleAppInputChange('dashboard_chart_1_vital', e.target.value)}
                    className="admin-v2-input"
                  >
                    <option value="">Select a vital type...</option>
                    {getAvailableVitalsForChart(1).map(vital => (
                      <option key={vital} value={vital}>
                        {formatVitalDisplayName(vital)}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="admin-v2-settings-field">
                  <label>Chart 2 - Vital Type</label>
                  <select
                    value={appSettings.dashboard_chart_2_vital}
                    onChange={(e) => handleAppInputChange('dashboard_chart_2_vital', e.target.value)}
                    className="admin-v2-input"
                  >
                    <option value="">Select a vital type...</option>
                    {getAvailableVitalsForChart(2).map(vital => (
                      <option key={vital} value={vital}>
                        {formatVitalDisplayName(vital)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            
            <div className="admin-v2-settings-actions">
              <button 
                onClick={saveAppSettings}
                disabled={isSavingApp}
                className="admin-v2-btn admin-v2-btn-primary"
              >
                {isSavingApp ? 'Saving...' : 'Save Application Settings'}
              </button>
            </div>
          </div>
        </div>

        {/* Patient-Specific Settings Section */}
        <div className="admin-v2-settings-section">
          <div className="admin-v2-settings-section-header">
            <div className="admin-v2-settings-section-title">
              <span className="admin-v2-settings-section-icon patient">👤</span>
              <div>
                <h2>Patient Settings</h2>
                <p>
                  {selectedPatient 
                    ? `Settings for ${selectedPatient.first_name} ${selectedPatient.last_name}`
                    : 'Default settings applied to all patients'}
                </p>
              </div>
            </div>
            {successPatient && (
              <span className="admin-v2-settings-success">Saved!</span>
            )}
          </div>
          
          <div className="admin-v2-settings-card">
            {/* Alert Thresholds */}
            <div className="admin-v2-settings-group">
              <h3 className="admin-v2-settings-group-title">Vital Sign Alert Thresholds</h3>
              <p className="admin-v2-settings-group-desc">
                Alerts will trigger when readings fall outside these ranges
              </p>
              
              <div className="admin-v2-settings-row four-cols">
                <div className="admin-v2-settings-field">
                  <label>Min SpO₂ (%)</label>
                  <input
                    type="number"
                    value={patientSettings.min_spo2}
                    onChange={(e) => handlePatientInputChange('min_spo2', e.target.value)}
                    min="80"
                    max="100"
                    className="admin-v2-input"
                  />
                </div>
                
                <div className="admin-v2-settings-field">
                  <label>Max SpO₂ (%)</label>
                  <input
                    type="number"
                    value={patientSettings.max_spo2}
                    onChange={(e) => handlePatientInputChange('max_spo2', e.target.value)}
                    min="80"
                    max="100"
                    className="admin-v2-input"
                  />
                </div>
                
                <div className="admin-v2-settings-field">
                  <label>Min Heart Rate (BPM)</label>
                  <input
                    type="number"
                    value={patientSettings.min_bpm}
                    onChange={(e) => handlePatientInputChange('min_bpm', e.target.value)}
                    min="30"
                    max="200"
                    className="admin-v2-input"
                  />
                </div>
                
                <div className="admin-v2-settings-field">
                  <label>Max Heart Rate (BPM)</label>
                  <input
                    type="number"
                    value={patientSettings.max_bpm}
                    onChange={(e) => handlePatientInputChange('max_bpm', e.target.value)}
                    min="30"
                    max="250"
                    className="admin-v2-input"
                  />
                </div>
              </div>
            </div>

            {/* Nutrition Targets */}
            <div className="admin-v2-settings-group">
              <h3 className="admin-v2-settings-group-title">Daily Nutrition Targets</h3>
              
              <div className="admin-v2-settings-row">
                <div className="admin-v2-settings-field">
                  <label>Daily Calories (kcal)</label>
                  <input
                    type="number"
                    value={patientSettings.daily_calories}
                    onChange={(e) => handlePatientInputChange('daily_calories', e.target.value)}
                    min="500"
                    max="5000"
                    step="100"
                    className="admin-v2-input"
                  />
                  <span className="admin-v2-settings-hint">
                    Target daily calorie intake
                  </span>
                </div>
                
                <div className="admin-v2-settings-field">
                  <label>Daily Water (ml)</label>
                  <input
                    type="number"
                    value={patientSettings.daily_water}
                    onChange={(e) => handlePatientInputChange('daily_water', e.target.value)}
                    min="500"
                    max="5000"
                    step="100"
                    className="admin-v2-input"
                  />
                  <span className="admin-v2-settings-hint">
                    Target daily water intake
                  </span>
                </div>
              </div>
            </div>
            
            <div className="admin-v2-settings-actions">
              <button 
                onClick={savePatientSettings}
                disabled={isSavingPatient}
                className="admin-v2-btn admin-v2-btn-primary"
              >
                {isSavingPatient ? 'Saving...' : 'Save Patient Settings'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2SettingsGeneral;
