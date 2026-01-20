import React, { useState, useEffect } from 'react';
import { getSettings, updateSettings } from '../../services/settings';
import config from '../../config';

/**
 * Dashboard settings component for configuring what's displayed on the main dashboard
 */
const DashboardSettings = () => {
  const [formData, setFormData] = useState({
    chart_time_range: '5m', // '1m', '3m', '5m', '10m', '30m', '1h'
    show_alerts_count: true,
    show_statistics: true,
    perfusion_as_percent: false, // true = show %, false = show PI
    dashboard_chart_1_vital: '', // First sub-chart vital type
    dashboard_chart_2_vital: '', // Second sub-chart vital type
  });

  const [availableVitals, setAvailableVitals] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Load dashboard settings on component mount
  useEffect(() => {
    const loadDashboardSettings = async () => {
      try {
        setIsLoading(true);
        
        // Load both settings and available vitals in parallel
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
        
        const dashboardFormData = {};
        for (const [key, value] of Object.entries(settingsResponse)) {
          // Only include dashboard-related settings
          if (key.startsWith('show_') || key.includes('chart_') || key.includes('dashboard_') || key.includes('perfusion_')) {
            let processedValue = value;
            
            // Convert string boolean values to actual booleans
            if (processedValue === "True" || processedValue === "true") {
              processedValue = true;
            } else if (processedValue === "False" || processedValue === "false") {
              processedValue = false;
            }
            
            dashboardFormData[key] = processedValue;
          }
        }
        
        // Always update state with loaded settings, even if some are missing
        // This ensures boolean false values properly override defaults
        setFormData(prev => ({
          ...prev,
          ...dashboardFormData
        }));
        
        setError(null);
      } catch (err) {
        console.error("Error loading dashboard settings:", err);
        setError("Failed to load dashboard settings. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };

    loadDashboardSettings();
  }, []);

  const handleInputChange = (key, value) => {
    setFormData(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Helper function to get available options for each chart dropdown
  const getAvailableVitalsForChart = (chartNumber) => {
    const otherChartKey = chartNumber === 1 ? 'dashboard_chart_2_vital' : 'dashboard_chart_1_vital';
    const otherChartValue = formData[otherChartKey];
    
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

  const handleSubmit = async () => {
    setError(null);
    setSuccess(false);
    setIsSubmitting(true);

    try {
      // Convert numeric inputs to numbers
      const settingsToUpdate = {
        chart_time_range: formData.chart_time_range,
        show_alerts_count: formData.show_alerts_count,
        show_statistics: formData.show_statistics,
        perfusion_as_percent: formData.perfusion_as_percent,
        dashboard_chart_1_vital: formData.dashboard_chart_1_vital,
        dashboard_chart_2_vital: formData.dashboard_chart_2_vital,
      };

      const result = await updateSettings(settingsToUpdate);
      
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error("Error saving dashboard settings:", err);
      setError("Failed to save dashboard settings. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <div style={{ color: '#ffffff', textAlign: 'center', padding: '20px' }}>Loading dashboard settings...</div>;
  }

  return (
    <div>
      <h3 style={{ 
        color: '#ffffff', 
        fontSize: '1.25rem', 
        marginBottom: '16px',
        fontWeight: '600'
      }}>Dashboard Configuration</h3>
      
      {/* Chart Time Range and Display Options */}
      <div style={{ marginBottom: '24px' }}>
        <h4 style={{ 
          color: '#ffffff', 
          fontSize: '1.1rem', 
          marginBottom: '12px',
          fontWeight: '500'
        }}>Chart Display Settings</h4>
        
        <div style={{ marginBottom: '16px' }}>
          <label style={{ 
            color: '#e2e8f0', 
            fontSize: '13px', 
            fontWeight: '500', 
            marginBottom: '6px', 
            display: 'block' 
          }}>Time Range Displayed in Charts</label>
          <select
            value={formData.chart_time_range}
            onChange={(e) => handleInputChange('chart_time_range', e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              backgroundColor: '#2d3748',
              border: '1px solid #4a5568',
              borderRadius: '6px',
              color: '#ffffff',
              fontSize: '14px',
              outline: 'none',
              cursor: 'pointer',
              boxSizing: 'border-box'
            }}
          >
            <option value="1m">1 Minute</option>
            <option value="3m">3 Minutes</option>
            <option value="5m">5 Minutes</option>
            <option value="10m">10 Minutes</option>
            <option value="30m">30 Minutes</option>
            <option value="1h">1 Hour</option>
          </select>
          <div style={{ 
            color: '#cbd5e0', 
            fontSize: '12px', 
            marginTop: '6px',
            fontStyle: 'italic'
          }}>
            Controls how much historical data is shown in the SpO₂, Heart Rate, and Perfusion charts
          </div>
        </div>

        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '10px', 
          padding: '12px',
          backgroundColor: '#1a202c',
          borderRadius: '6px',
          border: '1px solid #4a5568'
        }}>
          <input
            type="checkbox"
            checked={formData.show_statistics}
            onChange={(e) => handleInputChange('show_statistics', e.target.checked)}
            style={{
              width: '18px',
              height: '18px',
              accentColor: '#007bff',
              cursor: 'pointer'
            }}
          />
          <label style={{ 
            color: '#ffffff', 
            fontSize: '14px', 
            fontWeight: '500',
            cursor: 'pointer'
          }}>Show Value Statistics (Min/Max/Avg)</label>
        </div>
        <div style={{ 
          color: '#cbd5e0', 
          fontSize: '12px', 
          marginTop: '6px',
          fontStyle: 'italic'
        }}>
          Display minimum, maximum, and average statistics below each vital sign value
        </div>
      </div>

        {/* Card Display Options */}
        <div style={{ marginBottom: '24px' }}>
          <h4 style={{ 
            color: '#ffffff', 
            fontSize: '1.1rem', 
            marginBottom: '12px',
            fontWeight: '500'
          }}>Dashboard Charts</h4>
          
          {/* Sub-chart Selection */}
          <div style={{ marginBottom: '16px' }}>
            <h5 style={{ 
              color: '#e2e8f0', 
              fontSize: '1rem', 
              marginBottom: '8px',
              fontWeight: '500'
            }}>Vital Charts Selection</h5>
            <div style={{ 
              color: '#cbd5e0', 
              fontSize: '12px', 
              marginBottom: '12px',
              fontStyle: 'italic'
            }}>
              Choose which vitals to display in the two sub-charts. Each vital can only be used once.
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ 
                  color: '#e2e8f0', 
                  fontSize: '13px', 
                  fontWeight: '500', 
                  marginBottom: '6px', 
                  display: 'block' 
                }}>Chart 1 - Vital Type</label>
                <select
                  value={formData.dashboard_chart_1_vital}
                  onChange={(e) => handleInputChange('dashboard_chart_1_vital', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    backgroundColor: '#2d3748',
                    border: '1px solid #4a5568',
                    borderRadius: '6px',
                    color: '#ffffff',
                    fontSize: '14px',
                    outline: 'none',
                    cursor: 'pointer',
                    boxSizing: 'border-box'
                  }}
                >
                  <option value="">Select a vital type...</option>
                  {getAvailableVitalsForChart(1).map(vital => (
                    <option key={vital} value={vital}>
                      {formatVitalDisplayName(vital)}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label style={{ 
                  color: '#e2e8f0', 
                  fontSize: '13px', 
                  fontWeight: '500', 
                  marginBottom: '6px', 
                  display: 'block' 
                }}>Chart 2 - Vital Type</label>
                <select
                  value={formData.dashboard_chart_2_vital}
                  onChange={(e) => handleInputChange('dashboard_chart_2_vital', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    backgroundColor: '#2d3748',
                    border: '1px solid #4a5568',
                    borderRadius: '6px',
                    color: '#ffffff',
                    fontSize: '14px',
                    outline: 'none',
                    cursor: 'pointer',
                    boxSizing: 'border-box'
                  }}
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
        </div>

        {/* Perfusion Display Mode */}
        <div style={{ marginBottom: '24px' }}>
          <h4 style={{ 
            color: '#ffffff', 
            fontSize: '1.1rem', 
            marginBottom: '12px',
            fontWeight: '500'
          }}>Perfusion Display</h4>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '10px', 
            padding: '12px',
            backgroundColor: '#1a202c',
            borderRadius: '6px',
            border: '1px solid #4a5568'
          }}>
            <input
              type="checkbox"
              checked={formData.perfusion_as_percent}
              onChange={(e) => handleInputChange('perfusion_as_percent', e.target.checked)}
              style={{
                width: '18px',
                height: '18px',
                accentColor: '#007bff',
                cursor: 'pointer'
              }}
            />
            <label style={{ 
              color: '#ffffff', 
              fontSize: '14px', 
              fontWeight: '500',
              cursor: 'pointer'
            }}>Display Perfusion as Percent (%)</label>
          </div>
          <div style={{ 
            color: '#cbd5e0', 
            fontSize: '12px', 
            marginTop: '6px',
            fontStyle: 'italic'
          }}>
            When checked, perfusion displays with "%" symbol. When unchecked, displays "PI" (Perfusion Index).
          </div>
        </div>

        {error && (
          <div style={{ 
            backgroundColor: '#fed7d7', 
            color: '#c53030', 
            padding: '10px 12px', 
            borderRadius: '6px', 
            marginBottom: '12px',
            fontSize: '13px'
          }}>{error}</div>
        )}
        {success && (
          <div style={{ 
            backgroundColor: '#c6f6d5', 
            color: '#2f855a', 
            padding: '10px 12px', 
            borderRadius: '6px', 
            marginBottom: '12px',
            fontSize: '13px'
          }}>Dashboard settings saved successfully!</div>
        )}
        
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
          <button 
            onClick={handleSubmit}
            disabled={isSubmitting}
            style={{
              backgroundColor: '#007bff',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '10px 24px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              opacity: isSubmitting ? 0.6 : 1,
              transition: 'all 0.2s ease'
            }}
          >
            {isSubmitting ? 'Saving...' : 'Save Dashboard Settings'}
          </button>
        </div>
    </div>
  );
};

export default DashboardSettings;
