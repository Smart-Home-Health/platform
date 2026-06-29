/*
 * Smart Home Health
 * Copyright (C) 2026 John Carty
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
import { useState } from 'react';
import config from '../config';

const VitalsForm = ({ onSave, onClose }) => {
  const [formData, setFormData] = useState({
    bloodPressure: { systolic: '', diastolic: '' },
    temperature: { body: '' },
    nutrition: { calories: '', water: '' },
    weight: '',
    notes: '',
    bathroom: { type: '', size: '' }
  });
  const [showNutrition, setShowNutrition] = useState(false);
  const [showWeight, setShowWeight] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
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
    const payload = { datetime: new Date().toISOString() };
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
    <form onSubmit={handleSubmit} className="vitals-form">
      <div className="expandable-buttons-row" style={{ marginBottom: 24 }}>
        <button type="button" className="expand-btn" onClick={() => setShowNutrition(v => !v)}>Nutrition {showNutrition ? '-' : '+'}</button>
        <button type="button" className="expand-btn" onClick={() => setShowWeight(v => !v)}>Weight {showWeight ? '-' : '+'}</button>
        <button type="button" className="expand-btn" onClick={() => setShowNotes(v => !v)}>Notes {showNotes ? '-' : '+'}</button>
        <button type="button" className="expand-btn" onClick={() => setShowBathroom(v => !v)}>Bathroom {showBathroom ? '-' : '+'}</button>
      </div>
      <div className="form-section">
        <h3>Blood Pressure</h3>
        {validationErrors.bloodPressure && (
          <div className="validation-error" style={{ 
            color: '#ff5252', 
            fontSize: '14px', 
            marginBottom: '10px',
            padding: '8px',
            backgroundColor: 'rgba(255, 82, 82, 0.1)',
            border: '1px solid rgba(255, 82, 82, 0.3)',
            borderRadius: '4px'
          }}>
            {validationErrors.bloodPressure}
          </div>
        )}
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="systolic">Systolic (mmHg)</label>
            <input
              type="number"
              id="systolic"
              value={formData.bloodPressure.systolic}
              onChange={(e) => handleInputChange('bloodPressure', 'systolic', e.target.value)}
              placeholder="120"
              min="60"
              max="250"
              style={{
                borderColor: validationErrors.bloodPressure ? '#ff5252' : undefined,
                backgroundColor: validationErrors.bloodPressure ? 'rgba(255, 82, 82, 0.05)' : undefined
              }}
            />
          </div>
          <div className="form-group">
            <label htmlFor="diastolic">Diastolic (mmHg)</label>
            <input
              type="number"
              id="diastolic"
              value={formData.bloodPressure.diastolic}
              onChange={(e) => handleInputChange('bloodPressure', 'diastolic', e.target.value)}
              placeholder="80"
              min="30"
              max="150"
              style={{
                borderColor: validationErrors.bloodPressure ? '#ff5252' : undefined,
                backgroundColor: validationErrors.bloodPressure ? 'rgba(255, 82, 82, 0.05)' : undefined
              }}
            />
          </div>
        </div>
      </div>
      <div className="form-section">
        <h3>Temperature</h3>
        <div className="form-group">
          <label htmlFor="body-temp">Body Temperature (°F)</label>
          <input
            type="number"
            id="body-temp"
            value={formData.temperature.body}
            onChange={(e) => handleInputChange('temperature', 'body', e.target.value)}
            placeholder="98.6"
            step="0.1"
            min="95"
            max="105"
          />
        </div>
      </div>
      {showNutrition && (
        <div className="form-section">
          <h3>Nutrition</h3>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="calories">Calories</label>
              <input
                type="number"
                id="calories"
                value={formData.nutrition.calories}
                onChange={(e) => handleInputChange('nutrition', 'calories', e.target.value)}
                placeholder="2000"
                min="0"
              />
            </div>
            <div className="form-group">
              <label htmlFor="water">Water (mL)</label>
              <input
                type="number"
                id="water"
                value={formData.nutrition.water}
                onChange={(e) => handleInputChange('nutrition', 'water', e.target.value)}
                placeholder="2000"
                min="0"
              />
            </div>
          </div>
        </div>
      )}
      {showWeight && (
        <div className="form-section">
          <h3>Weight</h3>
          <div className="form-group">
            <label htmlFor="weight">Weight (lbs)</label>
            <input
              type="number"
              id="weight"
              value={formData.weight}
              onChange={(e) => handleInputChange(null, 'weight', e.target.value)}
              placeholder="150"
              step="0.1"
              min="0"
            />
          </div>
        </div>
      )}
      {showNotes && (
        <div className="form-section">
          <h3>Notes</h3>
          <div className="form-group">
            <label htmlFor="notes">Notes</label>
            <textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => handleInputChange(null, 'notes', e.target.value)}
              placeholder="Any additional notes..."
              rows="3"
            ></textarea>
          </div>
        </div>
      )}
      {showBathroom && (
        <div className="form-section">
          <h3>Bathroom</h3>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="bathroom-type">Type</label>
              <select id="bathroom-type" value={formData.bathroom.type} onChange={e => handleInputChange('bathroom', 'type', e.target.value)}>
                <option value="">Select</option>
                <option value="dry">Dry</option>
                <option value="wet">Wet</option>
                <option value="solid">Solid</option>
                <option value="mix">Mix</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="bathroom-size">Size</label>
              <select id="bathroom-size" value={formData.bathroom.size} onChange={e => handleInputChange('bathroom', 'size', e.target.value)}>
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
      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">Vitals saved successfully!</div>}
      <div className="form-actions">
        <button type="button" onClick={onClose} className="button secondary">Cancel</button>
        <button type="submit" className="button primary" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Save Vitals'}
        </button>
      </div>
    </form>
  );
};

export default VitalsForm;