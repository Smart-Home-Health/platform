import React, { useState, useEffect } from 'react';
import { getSettings, setSetting } from '../../services/settings';

/**
 * Threshold settings component for configuring alert thresholds
 */
const ThresholdSettings = () => {
  const [formData, setFormData] = useState({
    min_spo2: 90,
    max_spo2: 100,
    min_bpm: 55,
    max_bpm: 155,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Load threshold settings on component mount
  useEffect(() => {
    const loadThresholdSettings = async () => {
      try {
        setIsLoading(true);
        const settings = await getSettings();
        
        const thresholdFormData = {};
        for (const [key, value] of Object.entries(settings)) {
          // Only include vital-sign threshold settings
          if (key.includes('spo2') || key.includes('bpm')) {
            thresholdFormData[key] = value;
          }
        }
        
        console.log('Loaded threshold settings:', thresholdFormData);
        
        setFormData(prev => ({
          ...prev,
          ...thresholdFormData
        }));
      } catch (err) {
        console.error("Error loading threshold settings:", err);
        setError("Failed to load threshold settings. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };

    loadThresholdSettings();
  }, []);

  const handleInputChange = (key, value) => {
    setFormData(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSubmit = async (e) => {
    if (e && e.preventDefault) {
      e.preventDefault();
    }
    console.log('Form submitted with data:', formData);
    
    // Validate that all fields have values
    const requiredFields = ['min_spo2', 'max_spo2', 'min_bpm', 'max_bpm'];
    const missingFields = requiredFields.filter(field => !formData[field] || formData[field] === '');
    
    if (missingFields.length > 0) {
      console.error('Missing required fields:', missingFields);
      setError(`Please fill in all fields: ${missingFields.join(', ')}`);
      return;
    }
    
    setError(null);
    setSuccess(false);
    setIsSubmitting(true);

    try {
      console.log('Starting to save settings...');
      // Save each setting individually with proper data type
      const savePromises = [
        setSetting('min_spo2', parseInt(formData.min_spo2), 'int', 'Minimum SpO2 threshold'),
        setSetting('max_spo2', parseInt(formData.max_spo2), 'int', 'Maximum SpO2 threshold'),
        setSetting('min_bpm', parseInt(formData.min_bpm), 'int', 'Minimum heart rate threshold'),
        setSetting('max_bpm', parseInt(formData.max_bpm), 'int', 'Maximum heart rate threshold'),
      ];
      
      console.log('Save promises created, executing...');
      await Promise.all(savePromises);

      console.log('Settings saved successfully');
      setSuccess(true);
      
      // Auto-hide success message after 3 seconds
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error("Error saving threshold settings:", err);
      setError("Failed to save threshold settings. Please try again.");
    } finally {
      console.log('Setting isSubmitting to false');
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        padding: '40px',
        color: '#ffffff' 
      }}>
        Loading threshold settings...
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ 
          color: '#ffffff', 
          fontSize: '1.25rem', 
          marginBottom: '16px',
          fontWeight: '600'
        }}>Alert Thresholds</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
          <div>
            <label style={{ 
              color: '#e2e8f0', 
              fontSize: '13px', 
              fontWeight: '500', 
              marginBottom: '6px', 
              display: 'block' 
            }}>Min SpO₂ (%)</label>
            <input
              type="number"
              value={formData.min_spo2}
              onChange={(e) => handleInputChange('min_spo2', e.target.value)}
              min="80"
              max="99"
              style={{
                width: '100%',
                padding: '10px 12px',
                backgroundColor: '#2d3748',
                border: '1px solid #4a5568',
                borderRadius: '6px',
                color: '#ffffff',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>
          <div>
            <label style={{ 
              color: '#e2e8f0', 
              fontSize: '13px', 
              fontWeight: '500', 
              marginBottom: '6px', 
              display: 'block' 
            }}>Max SpO₂ (%)</label>
            <input
              type="number"
              value={formData.max_spo2}
              onChange={(e) => handleInputChange('max_spo2', e.target.value)}
              min="90"
              max="100"
              style={{
                width: '100%',
                padding: '10px 12px',
                backgroundColor: '#2d3748',
                border: '1px solid #4a5568',
                borderRadius: '6px',
                color: '#ffffff',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>
          <div>
            <label style={{ 
              color: '#e2e8f0', 
              fontSize: '13px', 
              fontWeight: '500', 
              marginBottom: '6px', 
              display: 'block' 
            }}>Min Heart Rate (BPM)</label>
            <input
              type="number"
              value={formData.min_bpm}
              onChange={(e) => handleInputChange('min_bpm', e.target.value)}
              min="40"
              max="100"
              style={{
                width: '100%',
                padding: '10px 12px',
                backgroundColor: '#2d3748',
                border: '1px solid #4a5568',
                borderRadius: '6px',
                color: '#ffffff',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>
          <div>
            <label style={{ 
              color: '#e2e8f0', 
              fontSize: '13px', 
              fontWeight: '500', 
              marginBottom: '6px', 
              display: 'block' 
            }}>Max Heart Rate (BPM)</label>
            <input
              type="number"
              value={formData.max_bpm}
              onChange={(e) => handleInputChange('max_bpm', e.target.value)}
              min="100"
              max="220"
              style={{
                width: '100%',
                padding: '10px 12px',
                backgroundColor: '#2d3748',
                border: '1px solid #4a5568',
                borderRadius: '6px',
                color: '#ffffff',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>
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
        }}>Threshold settings saved successfully!</div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
        <button 
          type="button" 
          disabled={isSubmitting}
          onClick={(e) => {
            console.log('Save button clicked');
            handleSubmit(e);
          }}
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
          {isSubmitting ? 'Saving...' : 'Save Threshold Settings'}
        </button>
      </div>
    </div>
  );
};

export default ThresholdSettings;
