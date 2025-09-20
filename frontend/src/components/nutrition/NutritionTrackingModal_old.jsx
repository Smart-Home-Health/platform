import React, { useState, useEffect } from 'react';
import config from '../../config';

const NutritionTrackingModal = ({ 
  isOpen, 
  onClose, 
  careTaskLogId, 
  careTaskName = "Nutrition Task",
  nutritionData = null, // Add nutrition data for prefilling
  onSave 
}) => {
  const [formData, setFormData] = useState({
    item_name: '',
    item_type: 'food',
    amount: '',
    amount_unit: 'ml',
    calories: '',
    protein_grams: '',
    carbs_grams: '',
    fat_grams: '',
    sodium_mg: '',
    meal_type: 'snack',
    notes: '',
    consumed_at: new Date().toISOString().slice(0, 16) // for datetime-local input
  });

  const [presets, setPresets] = useState(null);
  const [selectedPreset, setSelectedPreset] = useState('');
  const [loading, setLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Add CSS for animations if not already present
  useEffect(() => {
    if (!document.getElementById('nutrition-modal-styles')) {
      const style = document.createElement('style');
      style.id = 'nutrition-modal-styles';
      style.textContent = `
        @keyframes slideUp {
          0% { 
            opacity: 0;
            transform: translateY(20px);
          }
          100% { 
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes fadeIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  // Load nutrition presets on component mount
  useEffect(() => {
    if (isOpen) {
      fetchPresets();
    }
  }, [isOpen]);

  // Prefill form data when nutritionData is provided
  useEffect(() => {
    if (isOpen && nutritionData) {
      setFormData(prevData => ({
        ...prevData,
        item_name: nutritionData.item_name || '',
        item_type: nutritionData.item_type || 'food',
        amount: nutritionData.amount ? nutritionData.amount.toString() : '',
        amount_unit: nutritionData.amount_unit || 'ml',
        calories: nutritionData.calories ? nutritionData.calories.toString() : '',
        // Keep other fields as they were
        consumed_at: new Date().toISOString().slice(0, 16)
      }));
    }
  }, [isOpen, nutritionData]);

  const fetchPresets = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/nutrition-presets`);
      if (response.ok) {
        const data = await response.json();
        setPresets(data);
      }
    } catch (error) {
      console.error('Error fetching nutrition presets:', error);
    }
  };

  const handlePresetChange = (presetValue) => {
    if (!presetValue || !presets) {
      setSelectedPreset('');
      return;
    }

    setSelectedPreset(presetValue);
    const [category, index] = presetValue.split('-');
    
    if (category === 'liquids') {
      const preset = presets.liquids[parseInt(index)];
      setFormData(prev => ({
        ...prev,
        item_name: preset.name,
        item_type: preset.item_type,
        amount_unit: preset.default_unit,
        calories: '', // Will be calculated based on amount
      }));
    } else if (category === 'foods') {
      const preset = presets.foods[parseInt(index)];
      setFormData(prev => ({
        ...prev,
        item_name: preset.name,
        item_type: preset.item_type,
        amount_unit: preset.default_unit,
        calories: preset.calories_per_serving || '',
        carbs_grams: preset.carbs_per_serving || '',
        protein_grams: preset.protein_per_serving || '',
        fiber_grams: preset.fiber_per_serving || ''
      }));
    }
  };

  const calculateCaloriesFromPreset = () => {
    if (!selectedPreset || !presets || !formData.amount) return;

    const [category, index] = selectedPreset.split('-');
    
    if (category === 'liquids') {
      const preset = presets.liquids[parseInt(index)];
      const amount = parseFloat(formData.amount);
      
      if (preset.calories_per_ml && amount) {
        const calculatedCalories = (amount * preset.calories_per_ml).toFixed(1);
        const calculatedProtein = preset.protein_per_ml ? (amount * preset.protein_per_ml).toFixed(1) : '';
        const calculatedCarbs = preset.carbs_per_ml ? (amount * preset.carbs_per_ml).toFixed(1) : '';
        const calculatedFat = preset.fat_per_ml ? (amount * preset.fat_per_ml).toFixed(1) : '';
        
        setFormData(prev => ({
          ...prev,
          calories: calculatedCalories,
          protein_grams: calculatedProtein,
          carbs_grams: calculatedCarbs,
          fat_grams: calculatedFat
        }));
      }
    }
  };

  // Auto-calculate when amount changes for presets
  useEffect(() => {
    calculateCaloriesFromPreset();
  }, [formData.amount, selectedPreset]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const submitData = {
        ...formData,
        care_task_log_id: careTaskLogId,
        consumed_at: new Date(formData.consumed_at).toISOString(),
        amount: parseFloat(formData.amount),
        calories: formData.calories ? parseFloat(formData.calories) : null,
        protein_grams: formData.protein_grams ? parseFloat(formData.protein_grams) : null,
        carbs_grams: formData.carbs_grams ? parseFloat(formData.carbs_grams) : null,
        fat_grams: formData.fat_grams ? parseFloat(formData.fat_grams) : null,
        sodium_mg: formData.sodium_mg ? parseFloat(formData.sodium_mg) : null,
        recorded_by: 'Web Interface'
      };

      const response = await fetch(`${config.apiUrl}/nutrition-intake`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(submitData)
      });

      if (response.ok) {
        const result = await response.json();
        onSave && onSave(result);
        onClose();
        // Reset form
        setFormData({
          item_name: '',
          item_type: 'food',
          amount: '',
          amount_unit: 'ml',
          calories: '',
          protein_grams: '',
          carbs_grams: '',
          fat_grams: '',
          sodium_mg: '',
          meal_type: 'snack',
          notes: '',
          consumed_at: new Date().toISOString().slice(0, 16)
        });
        setSelectedPreset('');
      } else {
        console.error('Failed to save nutrition intake');
        alert('Failed to save nutrition data. Please try again.');
      }
    } catch (error) {
      console.error('Error saving nutrition intake:', error);
      alert('Error saving nutrition data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
        <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1200,
        animation: 'fadeIn 0.3s ease',
        padding: '20px',
        overflowY: 'auto'
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        backgroundColor: '#1e1e1e',
        borderRadius: '16px',
        padding: '32px',
        maxWidth: '600px',
        width: '100%',
        maxHeight: '90vh',
        overflowY: 'auto',
        animation: 'slideUp 0.3s ease',
        position: 'relative',
        border: '1px solid #333',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)'
      }}>
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          marginBottom: '32px',
          paddingBottom: '24px',
          borderBottom: '2px solid #333'
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #007bff 0%, #0056b3 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: '16px',
            color: '#fff',
            fontSize: '20px',
            fontWeight: 'bold'
          }}>
            N
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ 
              margin: '0', 
              color: '#fff', 
              fontSize: '24px', 
              fontWeight: '600'
            }}>
              Nutrition Tracking
            </h3>
            <p style={{ 
              margin: '8px 0 0 0', 
              color: '#888', 
              fontSize: '14px'
            }}>
              Record nutrition intake for: <span style={{ color: '#007bff', fontWeight: '500' }}>{careTaskName}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: '#333',
              border: '1px solid #555',
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              fontSize: '18px',
              cursor: 'pointer',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => {
              e.target.style.background = '#dc3545';
              e.target.style.borderColor = '#dc3545';
            }}
            onMouseOut={(e) => {
              e.target.style.background = '#333';
              e.target.style.borderColor = '#555';
            }}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Quick Presets */}
          {presets && (
            <div style={{ marginBottom: '24px' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '8px', 
                fontWeight: '500', 
                color: '#fff',
                fontSize: '14px'
              }}>
                Quick Select (Optional)
              </label>
              <select
                value={selectedPreset}
                onChange={(e) => handlePresetChange(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: '1px solid #555',
                  borderRadius: '8px',
                  fontSize: '14px',
                  backgroundColor: '#2a2a2a',
                  color: '#fff',
                  outline: 'none'
                }}
              >
                <option value="">Select a common item...</option>
                <optgroup label="Liquids & Supplements">
                  {presets.liquids?.map((item, index) => (
                    <option key={index} value={`liquids-${index}`}>
                      {item.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Foods">
                  {presets.foods?.map((item, index) => (
                    <option key={index} value={`foods-${index}`}>
                      {item.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
          )}

          {/* Item Details Section */}
          <div style={{ 
            background: '#2a2a2a',
            borderRadius: '12px',
            padding: '24px',
            marginBottom: '24px',
            border: '1px solid #444'
          }}>
            <h4 style={{ 
              margin: '0 0 20px 0', 
              color: '#fff', 
              fontSize: '16px', 
              fontWeight: '600'
            }}>
              Item Information
            </h4>
            
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px', 
                  fontWeight: '500', 
                  color: '#ddd',
                  fontSize: '14px'
                }}>
                  Item Name *
                </label>
                <input
                  type="text"
                  value={formData.item_name}
                  onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
                  placeholder="e.g., Peptamen, Water, Apple"
                  required
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid #555',
                    borderRadius: '8px',
                    fontSize: '14px',
                    backgroundColor: '#333',
                    color: '#fff',
                    outline: 'none'
                  }}
                />
              </div>
              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px', 
                  fontWeight: '500', 
                  color: '#ddd',
                  fontSize: '14px'
                }}>
                  Type *
                </label>
                <select
                  value={formData.item_type}
                  onChange={(e) => setFormData({ ...formData, item_type: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid #555',
                    borderRadius: '8px',
                    fontSize: '14px',
                    backgroundColor: '#333',
                    color: '#fff',
                    cursor: 'pointer',
                    outline: 'none'
                  }}
                >
                  <option value="food">Food</option>
                  <option value="liquid">Liquid</option>
                  <option value="supplement">Supplement</option>
                </select>
              </div>
            </div>
          </div>

          {/* Amount & Timing Section */}
          <div style={{ 
            background: '#2a2a2a',
            borderRadius: '12px',
            padding: '24px',
            marginBottom: '24px',
            border: '1px solid #444'
          }}>
            <h4 style={{ 
              margin: '0 0 20px 0', 
              color: '#fff', 
              fontSize: '16px', 
              fontWeight: '600'
            }}>
              Amount & Details
            </h4> 
              color: '#f57c00', 
              fontSize: '16px', 
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span style={{ fontSize: '18px' }}>⚖️</span>
              Amount & Details
            </h4>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px', 
                  fontWeight: '600', 
                  color: '#e65100',
                  fontSize: '14px'
                }}>
                  Amount *
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  placeholder="250"
                  required
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    border: '2px solid #ffcc02',
                    borderRadius: '10px',
                    fontSize: '15px',
                    backgroundColor: '#fff',
                    textAlign: 'center',
                    fontWeight: '600',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                  }}
                />
              </div>
              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px', 
                  fontWeight: '600', 
                  color: '#e65100',
                  fontSize: '14px'
                }}>
                  Unit *
                </label>
                <select
                  value={formData.amount_unit}
                  onChange={(e) => setFormData({ ...formData, amount_unit: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    border: '2px solid #ffcc02',
                    borderRadius: '10px',
                    fontSize: '15px',
                    backgroundColor: '#fff',
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                  }}
                >
                  <option value="ml">ml</option>
                  <option value="oz">oz</option>
                  <option value="cups">cups</option>
                  <option value="liters">liters</option>
                  <option value="grams">grams</option>
                  <option value="servings">servings</option>
                  <option value="pieces">pieces</option>
                </select>
              </div>
              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px', 
                  fontWeight: '600', 
                  color: '#e65100',
                  fontSize: '14px'
                }}>
                  Meal Type
                </label>
                <select
                  value={formData.meal_type}
                  onChange={(e) => setFormData({ ...formData, meal_type: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    border: '2px solid #ffcc02',
                    borderRadius: '10px',
                    fontSize: '15px',
                    backgroundColor: '#fff',
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                  }}
                >
                  <option value="breakfast">🌅 Breakfast</option>
                  <option value="lunch">☀️ Lunch</option>
                  <option value="dinner">🌙 Dinner</option>
                  <option value="snack">🍪 Snack</option>
                  <option value="supplement">💊 Supplement</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ 
                display: 'block', 
                marginBottom: '8px', 
                fontWeight: '600', 
                color: '#e65100',
                fontSize: '14px'
              }}>
                Consumed At
              </label>
              <input
                type="datetime-local"
                value={formData.consumed_at}
                onChange={(e) => setFormData({ ...formData, consumed_at: e.target.value })}
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  border: '2px solid #ffcc02',
                  borderRadius: '10px',
                  fontSize: '15px',
                  backgroundColor: '#fff',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                }}
              />
            </div>
          </div>

          {/* Advanced Nutritional Info Toggle */}
          <div style={{ marginBottom: '20px', textAlign: 'center' }}>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              style={{
                background: showAdvanced ? '#007bff' : 'transparent',
                border: '2px solid #007bff',
                color: showAdvanced ? '#fff' : '#007bff',
                padding: '12px 24px',
                borderRadius: '25px',
                fontSize: '14px',
                cursor: 'pointer',
                fontWeight: '600',
                transition: 'all 0.3s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                margin: '0 auto'
              }}
            >
              <span style={{ fontSize: '16px' }}>🔬</span>
              {showAdvanced ? '▼ Hide' : '▶ Show'} Advanced Nutritional Info
            </button>
          </div>

          {/* Advanced Fields */}
          {showAdvanced && (
            <div style={{ 
              background: 'linear-gradient(135deg, #e8f5e8 0%, #c8e6c9 100%)',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '24px',
              border: '1px solid #81c784',
              animation: 'slideUp 0.3s ease-out'
            }}>
              <h4 style={{ 
                margin: '0 0 16px 0', 
                color: '#2e7d32', 
                fontSize: '16px', 
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span style={{ fontSize: '18px' }}>📊</span>
                Detailed Nutrition Facts
              </h4>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '8px', 
                    fontWeight: '600', 
                    color: '#1b5e20',
                    fontSize: '14px'
                  }}>
                    Calories
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.calories}
                    onChange={(e) => setFormData({ ...formData, calories: e.target.value })}
                    placeholder="375"
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '2px solid #66bb6a',
                      borderRadius: '10px',
                      fontSize: '14px',
                      backgroundColor: '#fff',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                    }}
                  />
                </div>
                <div>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '8px', 
                    fontWeight: '600', 
                    color: '#1b5e20',
                    fontSize: '14px'
                  }}>
                    Protein (g)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.protein_grams}
                    onChange={(e) => setFormData({ ...formData, protein_grams: e.target.value })}
                    placeholder="10"
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '2px solid #66bb6a',
                      borderRadius: '10px',
                      fontSize: '14px',
                      backgroundColor: '#fff',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                    }}
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '8px', 
                    fontWeight: '600', 
                    color: '#1b5e20',
                    fontSize: '14px'
                  }}>
                    Carbs (g)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.carbs_grams}
                    onChange={(e) => setFormData({ ...formData, carbs_grams: e.target.value })}
                    placeholder="31.75"
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '2px solid #66bb6a',
                      borderRadius: '10px',
                      fontSize: '14px',
                      backgroundColor: '#fff',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                    }}
                  />
                </div>
                <div>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '8px', 
                    fontWeight: '600', 
                    color: '#1b5e20',
                    fontSize: '14px'
                  }}>
                    Fat (g)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.fat_grams}
                    onChange={(e) => setFormData({ ...formData, fat_grams: e.target.value })}
                    placeholder="14.5"
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '2px solid #66bb6a',
                      borderRadius: '10px',
                      fontSize: '14px',
                      backgroundColor: '#fff',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                    }}
                  />
                </div>
              </div>
              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px', 
                  fontWeight: '600', 
                  color: '#1b5e20',
                  fontSize: '14px'
                }}>
                  Sodium (mg)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.sodium_mg}
                  onChange={(e) => setFormData({ ...formData, sodium_mg: e.target.value })}
                  placeholder="250"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '2px solid #66bb6a',
                    borderRadius: '10px',
                    fontSize: '14px',
                    backgroundColor: '#fff',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                  }}
                />
              </div>
            </div>
          )}

          {/* Notes Section */}
          <div style={{ 
            background: 'linear-gradient(135deg, #f3e5f5 0%, #e1bee7 100%)',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '24px',
            border: '1px solid #ce93d8'
          }}>
            <h4 style={{ 
              margin: '0 0 12px 0', 
              color: '#7b1fa2', 
              fontSize: '16px', 
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span style={{ fontSize: '18px' }}>📝</span>
              Additional Notes
            </h4>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Any additional notes about this intake..."
              rows={3}
              style={{
                width: '100%',
                padding: '14px 16px',
                border: '2px solid #ba68c8',
                borderRadius: '10px',
                fontSize: '14px',
                resize: 'vertical',
                backgroundColor: '#fff',
                fontFamily: 'inherit',
                boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
              }}
            />
          </div>

          {/* Action Buttons */}
          <div style={{ 
            display: 'flex', 
            gap: '16px', 
            paddingTop: '24px',
            borderTop: '2px solid #f8f9fa'
          }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: '16px 24px',
                border: '2px solid #dc3545',
                borderRadius: '12px',
                backgroundColor: '#fff',
                color: '#dc3545',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '15px',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
              onMouseOver={(e) => {
                e.target.style.backgroundColor = '#dc3545';
                e.target.style.color = '#fff';
              }}
              onMouseOut={(e) => {
                e.target.style.backgroundColor = '#fff';
                e.target.style.color = '#dc3545';
              }}
            >
              <span style={{ fontSize: '16px' }}>❌</span>
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                flex: 2,
                padding: '16px 24px',
                border: 'none',
                borderRadius: '12px',
                background: loading ? 
                  'linear-gradient(135deg, #ccc 0%, #999 100%)' : 
                  'linear-gradient(135deg, #28a745 0%, #20c997 100%)',
                color: '#fff',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontWeight: '700',
                fontSize: '15px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: loading ? 'none' : '0 4px 12px rgba(40, 167, 69, 0.3)',
                transition: 'all 0.2s ease'
              }}
              onMouseOver={(e) => {
                if (!loading) {
                  e.target.style.transform = 'translateY(-2px)';
                  e.target.style.boxShadow = '0 6px 16px rgba(40, 167, 69, 0.4)';
                }
              }}
              onMouseOut={(e) => {
                if (!loading) {
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = '0 4px 12px rgba(40, 167, 69, 0.3)';
                }
              }}
            >
              {loading ? (
                <>
                  <div style={{
                    width: '18px',
                    height: '18px',
                    border: '3px solid rgba(255, 255, 255, 0.3)',
                    borderTop: '3px solid #fff',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                  }}></div>
                  Saving...
                </>
              ) : (
                <>
                  <span style={{ fontSize: '18px' }}>💾</span>
                  Save Nutrition Data
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NutritionTrackingModal;
