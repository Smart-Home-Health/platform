import { useState } from 'react';
import config from '../../config';
import { useAdminPatient } from '../../contexts/AdminPatientContext';

const VitalsForm = ({ onSave, onClose }) => {
  const { selectedPatient } = useAdminPatient();
  const [formData, setFormData] = useState({
    bloodPressure: { systolic: '', diastolic: '' },
    temperature: { body: '' },
    nutrition: { calories: '', water: '' },
    weight: '',
    notes: '',
    bathroom: { type: '', size: '' }
  });
  const [showBloodPressure, setShowBloodPressure] = useState(false);
  const [showTemperature, setShowTemperature] = useState(false);
  const [showNutrition, setShowNutrition] = useState(false);
  const [showWeight, setShowWeight] = useState(false);
  const [showBathroom, setShowBathroom] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});

  const handleInputChange = (category, field, value) => {
    if (category) {
      setFormData(prev => ({
        ...prev,
        [category]: {
          ...prev[category],
          [field]: value
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [field]: value
      }));
    }
    
    // Clear validation errors when user starts typing
    if (category === 'bloodPressure') {
      setValidationErrors(prev => ({
        ...prev,
        bloodPressure: null
      }));
    }
  };

  const buildPayload = () => {
    const payload = {
      datetime: new Date().toISOString(),
      ...(selectedPatient && { patient_id: selectedPatient.id })
    };
    // Blood Pressure
    if (formData.bloodPressure.systolic || formData.bloodPressure.diastolic) {
      payload.bp = {
        systolic_bp: formData.bloodPressure.systolic ? parseInt(formData.bloodPressure.systolic) : null,
        diastolic_bp: formData.bloodPressure.diastolic ? parseInt(formData.bloodPressure.diastolic) : null,
        map_bp: calculateMAP(formData.bloodPressure.systolic, formData.bloodPressure.diastolic)
      };
    }
    // Temperature
    if (formData.temperature.body) {
      payload.temp = {
        body_temp: parseFloat(formData.temperature.body)
      };
    }
    // Nutrition
    if (formData.nutrition.calories) {
      payload.calories = parseInt(formData.nutrition.calories);
    }
    if (formData.nutrition.water) {
      payload.water_ml = parseInt(formData.nutrition.water);
    }
    // Weight
    if (formData.weight) {
      payload.weight = parseFloat(formData.weight);
    }
    // Notes
    if (formData.notes) {
      payload.notes = formData.notes;
    }
    // Bathroom
    if (formData.bathroom.type) {
      payload.bathroom_type = formData.bathroom.type;
    }
    if (formData.bathroom.size) {
      payload.bathroom_size = formData.bathroom.size;
    }
    return payload;
  };

  const validateForm = () => {
    const errors = {};
    
    // Blood Pressure validation: both systolic and diastolic required if either has data
    const systolic = formData.bloodPressure.systolic.trim();
    const diastolic = formData.bloodPressure.diastolic.trim();
    
    if ((systolic && !diastolic) || (!systolic && diastolic)) {
      errors.bloodPressure = "Both systolic and diastolic blood pressure values are required";
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length > 0 ? Object.values(errors)[0] : null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    
    try {
      // Validate form before submission
      const validationError = validateForm();
      if (validationError) {
        setError(validationError);
        setIsSubmitting(false);
        return;
      }
      
      const payload = buildPayload();
      console.log("Submitting vitals payload:", payload);
      const response = await fetch(`${config.apiUrl}/api/vitals/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const responseData = await response.json();
      if (!response.ok) {
        throw new Error(responseData.message || `Error saving vitals: ${response.statusText}`);
      }
      setSuccess(true);
      if (onSave) onSave(responseData);
      setTimeout(() => {
        setFormData({
          bloodPressure: { systolic: '', diastolic: '' },
          temperature: { body: '' },
          nutrition: { calories: '', water: '' },
          weight: '',
          notes: '',
          bathroom: { type: '', size: '' }
        });
        setSuccess(false);
      }, 2000);
    } catch (err) {
      setError(err.message || "Error saving vitals. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Calculate MAP (Mean Arterial Pressure)
  const calculateMAP = (systolic, diastolic) => {
    if (!systolic || !diastolic) return null;
    const sys = parseInt(systolic);
    const dia = parseInt(diastolic);
    return Math.round(dia + (sys - dia) / 3);
  };

  return (
    <div style={{
      backgroundColor: 'rgba(30,32,40,0.95)',
      borderRadius: '12px',
      padding: '20px',
      border: '1px solid #4a5568',
      height: '100%',
      overflow: 'auto'
    }}>
      <form onSubmit={handleSubmit} className="vitals-form" style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '24px'
      }}>
        <div className="expandable-buttons-row" style={{ 
          display: 'flex',
          gap: '12px',
          flexWrap: 'wrap',
          marginBottom: '32px'
        }}>
          <button 
            type="button" 
            onClick={() => setShowBloodPressure(v => !v)}
            style={{
              padding: '8px 16px',
              border: '1px solid #4a5568',
              borderRadius: '6px',
              backgroundColor: showBloodPressure ? '#007bff' : 'rgba(255,255,255,0.1)',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Blood Pressure {showBloodPressure ? '-' : '+'}
          </button>
          <button 
            type="button" 
            onClick={() => setShowTemperature(v => !v)}
            style={{
              padding: '8px 16px',
              border: '1px solid #4a5568',
              borderRadius: '6px',
              backgroundColor: showTemperature ? '#007bff' : 'rgba(255,255,255,0.1)',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Temperature {showTemperature ? '-' : '+'}
          </button>
          <button 
            type="button" 
            onClick={() => setShowNutrition(v => !v)}
            style={{
              padding: '8px 16px',
              border: '1px solid #4a5568',
              borderRadius: '6px',
              backgroundColor: showNutrition ? '#007bff' : 'rgba(255,255,255,0.1)',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Nutrition {showNutrition ? '-' : '+'}
          </button>
          <button 
            type="button" 
            onClick={() => setShowWeight(v => !v)}
            style={{
              padding: '8px 16px',
              border: '1px solid #4a5568',
              borderRadius: '6px',
              backgroundColor: showWeight ? '#007bff' : 'rgba(255,255,255,0.1)',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Weight {showWeight ? '-' : '+'}
          </button>
          <button 
            type="button" 
            onClick={() => setShowBathroom(v => !v)}
            style={{
              padding: '8px 16px',
              border: '1px solid #4a5568',
              borderRadius: '6px',
              backgroundColor: showBathroom ? '#007bff' : 'rgba(255,255,255,0.1)',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Bathroom {showBathroom ? '-' : '+'}
          </button>
        </div>

        {showBloodPressure && (
        <div style={{
          backgroundColor: 'rgba(255,255,255,0.05)',
          borderRadius: '8px',
          padding: '20px',
          border: '1px solid #4a5568'
        }}>
          <h3 style={{ color: '#fff', marginBottom: '20px', fontSize: '18px' }}>Blood Pressure</h3>
          {validationErrors.bloodPressure && (
            <div style={{ 
              color: '#ff5252', 
              fontSize: '14px', 
              marginBottom: '15px',
              padding: '10px',
              backgroundColor: 'rgba(255, 82, 82, 0.1)',
              border: '1px solid rgba(255, 82, 82, 0.3)',
              borderRadius: '6px'
            }}>
              {validationErrors.bloodPressure}
            </div>
          )}
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ flex: '1', minWidth: '150px', maxWidth: '300px' }}>
              <label htmlFor="systolic" style={{ 
                display: 'block', 
                marginBottom: '8px', 
                color: '#ccc',
                fontSize: '14px' 
              }}>
                Systolic (mmHg)
              </label>
              <input
                type="number"
                id="systolic"
                value={formData.bloodPressure.systolic}
                onChange={(e) => handleInputChange('bloodPressure', 'systolic', e.target.value)}
                placeholder="120"
                min="60"
                max="250"
                style={{
                  width: 'calc(100% - 24px)',
                  padding: '12px',
                  border: `1px solid ${validationErrors.bloodPressure ? '#ff5252' : '#4a5568'}`,
                  borderRadius: '6px',
                  backgroundColor: validationErrors.bloodPressure ? 'rgba(255, 82, 82, 0.05)' : 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  fontSize: '16px',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            <div style={{ flex: '1', minWidth: '150px', maxWidth: '300px' }}>
              <label htmlFor="diastolic" style={{ 
                display: 'block', 
                marginBottom: '8px', 
                color: '#ccc',
                fontSize: '14px' 
              }}>
                Diastolic (mmHg)
              </label>
              <input
                type="number"
                id="diastolic"
                value={formData.bloodPressure.diastolic}
                onChange={(e) => handleInputChange('bloodPressure', 'diastolic', e.target.value)}
                placeholder="80"
                min="30"
                max="150"
                style={{
                  width: 'calc(100% - 24px)',
                  padding: '12px',
                  border: `1px solid ${validationErrors.bloodPressure ? '#ff5252' : '#4a5568'}`,
                  borderRadius: '6px',
                  backgroundColor: validationErrors.bloodPressure ? 'rgba(255, 82, 82, 0.05)' : 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  fontSize: '16px',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>
        </div>
        )}

        {showTemperature && (
        <div style={{
          backgroundColor: 'rgba(255,255,255,0.05)',
          borderRadius: '8px',
          padding: '20px',
          border: '1px solid #4a5568'
        }}>
          <h3 style={{ color: '#fff', marginBottom: '20px', fontSize: '18px' }}>Temperature</h3>
          <div style={{ maxWidth: '250px' }}>
            <label htmlFor="body-temp" style={{ 
              display: 'block', 
              marginBottom: '8px', 
              color: '#ccc',
              fontSize: '14px' 
            }}>
              Body Temperature (°F)
            </label>
            <input
              type="number"
              id="body-temp"
              value={formData.temperature.body}
              onChange={(e) => handleInputChange('temperature', 'body', e.target.value)}
              placeholder="98.6"
              step="0.1"
              min="95"
              max="105"
              style={{
                width: 'calc(100% - 24px)',
                padding: '12px',
                border: '1px solid #4a5568',
                borderRadius: '6px',
                backgroundColor: 'rgba(255,255,255,0.1)',
                color: '#fff',
                fontSize: '16px',
                boxSizing: 'border-box'
              }}
            />
          </div>
        </div>
        )}

      {showNutrition && (
        <div style={{
          backgroundColor: 'rgba(255,255,255,0.05)',
          borderRadius: '8px',
          padding: '20px',
          border: '1px solid #4a5568'
        }}>
          <h3 style={{ color: '#fff', marginBottom: '20px', fontSize: '18px' }}>Nutrition</h3>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ flex: '1', minWidth: '150px', maxWidth: '300px' }}>
              <label htmlFor="calories" style={{ 
                display: 'block', 
                marginBottom: '8px', 
                color: '#ccc',
                fontSize: '14px' 
              }}>Calories</label>
              <input
                type="number"
                id="calories"
                value={formData.nutrition.calories}
                onChange={(e) => handleInputChange('nutrition', 'calories', e.target.value)}
                placeholder="2000"
                min="0"
                style={{
                  width: 'calc(100% - 24px)',
                  padding: '12px',
                  border: '1px solid #4a5568',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  fontSize: '16px',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            <div style={{ flex: '1', minWidth: '150px', maxWidth: '300px' }}>
              <label htmlFor="water" style={{ 
                display: 'block', 
                marginBottom: '8px', 
                color: '#ccc',
                fontSize: '14px' 
              }}>Water (mL)</label>
              <input
                type="number"
                id="water"
                value={formData.nutrition.water}
                onChange={(e) => handleInputChange('nutrition', 'water', e.target.value)}
                placeholder="2000"
                min="0"
                style={{
                  width: 'calc(100% - 24px)',
                  padding: '12px',
                  border: '1px solid #4a5568',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  fontSize: '16px',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>
        </div>
      )}

      {showWeight && (
        <div style={{
          backgroundColor: 'rgba(255,255,255,0.05)',
          borderRadius: '8px',
          padding: '20px',
          border: '1px solid #4a5568'
        }}>
          <h3 style={{ color: '#fff', marginBottom: '20px', fontSize: '18px' }}>Weight</h3>
          <div style={{ maxWidth: '250px' }}>
            <label htmlFor="weight" style={{ 
              display: 'block', 
              marginBottom: '8px', 
              color: '#ccc',
              fontSize: '14px' 
            }}>Weight (lbs)</label>
            <input
              type="number"
              id="weight"
              value={formData.weight}
              onChange={(e) => handleInputChange(null, 'weight', e.target.value)}
              placeholder="150"
              step="0.1"
              min="0"
              style={{
                width: 'calc(100% - 24px)',
                padding: '12px',
                border: '1px solid #4a5568',
                borderRadius: '6px',
                backgroundColor: 'rgba(255,255,255,0.1)',
                color: '#fff',
                fontSize: '16px',
                boxSizing: 'border-box'
              }}
            />
          </div>
        </div>
      )}

      {showBathroom && (
        <div style={{
          backgroundColor: 'rgba(255,255,255,0.05)',
          borderRadius: '8px',
          padding: '20px',
          border: '1px solid #4a5568'
        }}>
          <h3 style={{ color: '#fff', marginBottom: '20px', fontSize: '18px' }}>Bathroom</h3>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ flex: '1', minWidth: '150px', maxWidth: '300px' }}>
              <label htmlFor="bathroom-type" style={{ 
                display: 'block', 
                marginBottom: '8px', 
                color: '#ccc',
                fontSize: '14px' 
              }}>Type</label>
              <select 
                id="bathroom-type" 
                value={formData.bathroom.type} 
                onChange={e => handleInputChange('bathroom', 'type', e.target.value)}
                style={{
                  width: 'calc(100% - 24px)',
                  padding: '12px',
                  border: '1px solid #4a5568',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  fontSize: '16px',
                  boxSizing: 'border-box'
                }}
              >
                <option value="">Select</option>
                <option value="dry">Dry</option>
                <option value="wet">Wet</option>
                <option value="solid">Solid</option>
                <option value="mix">Mix</option>
              </select>
            </div>
            <div style={{ flex: '1', minWidth: '150px', maxWidth: '300px' }}>
              <label htmlFor="bathroom-size" style={{ 
                display: 'block', 
                marginBottom: '8px', 
                color: '#ccc',
                fontSize: '14px' 
              }}>Size</label>
              <select 
                id="bathroom-size" 
                value={formData.bathroom.size} 
                onChange={e => handleInputChange('bathroom', 'size', e.target.value)}
                style={{
                  width: 'calc(100% - 24px)',
                  padding: '12px',
                  border: '1px solid #4a5568',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  fontSize: '16px',
                  boxSizing: 'border-box'
                }}
              >
                <option value="">Select</option>
                <option value="smear">Smear</option>
                <option value="s">Small</option>
                <option value="m">Medium</option>
                <option value="l">Large</option>
                <option value="xl">Extra Large</option>
              </select>
            </div>
          </div>
        </div>
      )}

      <div style={{
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: '8px',
        padding: '20px',
        border: '1px solid #4a5568'
      }}>
        <h3 style={{ color: '#fff', marginBottom: '20px', fontSize: '18px' }}>Notes (Optional)</h3>
        <div>
          <label htmlFor="notes" style={{ 
            display: 'block', 
            marginBottom: '8px', 
            color: '#ccc',
            fontSize: '14px' 
          }}>Notes</label>
          <textarea
            id="notes"
            value={formData.notes}
            onChange={(e) => handleInputChange(null, 'notes', e.target.value)}
            placeholder="Any additional notes..."
            rows="3"
            style={{
              width: 'calc(100% - 24px)',
              padding: '12px',
              border: '1px solid #4a5568',
              borderRadius: '6px',
              backgroundColor: 'rgba(255,255,255,0.1)',
              color: '#fff',
              fontSize: '16px',
              resize: 'vertical',
              fontFamily: 'inherit',
              boxSizing: 'border-box'
            }}
          />
        </div>
      </div>

        {error && <div style={{ 
          padding: '12px', 
          backgroundColor: 'rgba(220, 53, 69, 0.2)', 
          border: '1px solid #dc3545',
          borderRadius: '6px',
          color: '#ff6b6b',
          fontSize: '14px'
        }}>{error}</div>}
        {success && <div style={{ 
          padding: '12px', 
          backgroundColor: 'rgba(40, 167, 69, 0.2)', 
          border: '1px solid #28a745',
          borderRadius: '6px',
          color: '#51cf66',
          fontSize: '14px'
        }}>Vitals saved successfully!</div>}
        <div style={{ 
          display: 'flex', 
          gap: '16px', 
          justifyContent: 'flex-end',
          paddingTop: '32px',
          marginTop: '24px',
          borderTop: '1px solid #4a5568'
        }}>
          <button 
            type="button" 
            onClick={onClose} 
            style={{
              padding: '12px 24px',
              border: '1px solid #4a5568',
              borderRadius: '6px',
              backgroundColor: 'rgba(255,255,255,0.1)',
              color: '#ccc',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            Cancel
          </button>
          <button 
            type="submit" 
            disabled={isSubmitting}
            style={{
              padding: '12px 24px',
              border: 'none',
              borderRadius: '6px',
              backgroundColor: isSubmitting ? '#4a5568' : '#28a745',
              color: '#fff',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            {isSubmitting ? 'Saving...' : 'Save Vitals'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default VitalsForm;
