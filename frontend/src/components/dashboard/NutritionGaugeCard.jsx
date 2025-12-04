import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, LabelList } from 'recharts';
import config from '../../config';

/**
 * NutritionGaugeCard displays bar charts for calories and water intake
 * Shows actual consumption vs daily targets with scheduled progress indicators
 */
const NutritionGaugeCard = () => {
  const [nutritionData, setNutritionData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchNutritionData();
    // Refresh every 30 seconds
    const interval = setInterval(fetchNutritionData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchNutritionData = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/nutrition/dashboard`);
      if (!response.ok) {
        throw new Error('Failed to fetch nutrition data');
      }
      const data = await response.json();
      setNutritionData(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching nutrition data:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ color: '#ffffff', fontSize: '14px' }}>Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ height: '100%' }}>
        <div style={{ color: '#fc8181', fontSize: '14px' }}>Error: {error}</div>
      </div>
    );
  }

  if (!nutritionData) {
    return null;
  }

  const {
    total_calories,
    total_water_ml,
    target_calories,
    target_water_ml,
    scheduled_calories,
    scheduled_water_ml
  } = nutritionData;

  // Prepare data for bar charts
  const caloriesData = [
    {
      name: 'Calories',
      actual: total_calories,
      expected: scheduled_calories,  // This is the sum of scheduled feedings that have passed
      target: target_calories
    }
  ];

  const waterData = [
    {
      name: 'Water',
      actual: total_water_ml,
      expected: scheduled_water_ml,  // This is the sum of scheduled feedings that have passed
      target: target_water_ml
    }
  ];

  // Use the maximum of expected or target for chart domain
  const caloriesMax = Math.max(scheduled_calories, target_calories);
  const waterMax = Math.max(scheduled_water_ml, target_water_ml);

  // Custom label for bars
  const renderCustomLabel = (props) => {
    const { x, y, width, height, value } = props;
    return (
      <text
        x={x + width / 2}
        y={y + height / 2}
        fill="#ffffff"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="14"
        fontWeight="600"
      >
        {Math.round(value)}
      </text>
    );
  };

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      gap: '20px',
      padding: '10px 0'
    }}>
      {/* Calories Bar Chart */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <div style={{
          color: '#e2e8f0',
          fontSize: '0.875rem',
          fontWeight: '500',
          marginBottom: '8px',
          textAlign: 'center'
        }}>
          Calories
        </div>
        <ResponsiveContainer width="100%" height="80%">
          <BarChart data={caloriesData} layout="vertical" margin={{ top: 5, right: 120, left: 30, bottom: 5 }}>
            <XAxis type="number" domain={[0, caloriesMax]} hide />
            <YAxis type="category" dataKey="name" hide />
            
            {/* Target bar (daily target - shown for reference) */}
            <Bar dataKey="target" fill="#4a5568" radius={[4, 4, 4, 4]} isAnimationActive={false}>
              <LabelList 
                dataKey="target" 
                position="right" 
                content={(props) => {
                  const { x, y, width, value } = props;
                  return (
                    <text x={x + width + 5} y={y + 10} fill="#4a5568" fontSize="11" fontWeight="500">
                      Target: {Math.round(value)} cal
                    </text>
                  );
                }}
              />
            </Bar>
            
            {/* Expected bar (sum of scheduled feedings that have passed) */}
            <Bar dataKey="expected" fill="#f6ad55" radius={[4, 4, 4, 4]} isAnimationActive={false}>
              <LabelList 
                dataKey="expected" 
                position="right" 
                content={(props) => {
                  const { x, y, width, value } = props;
                  return (
                    <text x={x + width + 5} y={y + 10} fill="#f6ad55" fontSize="11" fontWeight="500">
                      Expected: {Math.round(value)} cal
                    </text>
                  );
                }}
              />
            </Bar>
            
            {/* Actual bar (current progress) */}
            <Bar dataKey="actual" radius={[4, 4, 4, 4]} isAnimationActive={false}>
              <LabelList content={renderCustomLabel} />
              <LabelList 
                dataKey="actual" 
                position="right" 
                content={(props) => {
                  const { x, y, width, value } = props;
                  const data = caloriesData[0];
                  const color = data.actual >= data.target ? '#48bb78' : data.actual >= data.expected ? '#4299e1' : '#ecc94b';
                  return (
                    <text x={x + width + 5} y={y + 10} fill={color} fontSize="11" fontWeight="500">
                      Actual: {Math.round(value)} cal
                    </text>
                  );
                }}
              />
              {caloriesData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={entry.actual >= entry.target ? '#48bb78' : entry.actual >= entry.expected ? '#4299e1' : '#ecc94b'} 
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Water Bar Chart */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <div style={{
          color: '#e2e8f0',
          fontSize: '0.875rem',
          fontWeight: '500',
          marginBottom: '8px',
          textAlign: 'center'
        }}>
          Water Intake
        </div>
        <ResponsiveContainer width="100%" height="80%">
          <BarChart data={waterData} layout="vertical" margin={{ top: 5, right: 120, left: 30, bottom: 5 }}>
            <XAxis type="number" domain={[0, waterMax]} hide />
            <YAxis type="category" dataKey="name" hide />
            
            {/* Target bar (daily target - shown for reference) */}
            <Bar dataKey="target" fill="#4a5568" radius={[4, 4, 4, 4]} isAnimationActive={false}>
              <LabelList 
                dataKey="target" 
                position="right" 
                content={(props) => {
                  const { x, y, width, value } = props;
                  return (
                    <text x={x + width + 5} y={y + 10} fill="#4a5568" fontSize="11" fontWeight="500">
                      Target: {Math.round(value)} ml
                    </text>
                  );
                }}
              />
            </Bar>
            
            {/* Expected bar (sum of scheduled feedings that have passed) */}
            <Bar dataKey="expected" fill="#f6ad55" radius={[4, 4, 4, 4]} isAnimationActive={false}>
              <LabelList 
                dataKey="expected" 
                position="right" 
                content={(props) => {
                  const { x, y, width, value } = props;
                  return (
                    <text x={x + width + 5} y={y + 10} fill="#f6ad55" fontSize="11" fontWeight="500">
                      Expected: {Math.round(value)} ml
                    </text>
                  );
                }}
              />
            </Bar>
            
            {/* Actual bar (current progress) */}
            <Bar dataKey="actual" radius={[4, 4, 4, 4]} isAnimationActive={false}>
              <LabelList content={renderCustomLabel} />
              <LabelList 
                dataKey="actual" 
                position="right" 
                content={(props) => {
                  const { x, y, width, value } = props;
                  const data = waterData[0];
                  const color = data.actual >= data.target ? '#48bb78' : data.actual >= data.expected ? '#4299e1' : '#ecc94b';
                  return (
                    <text x={x + width + 5} y={y + 10} fill={color} fontSize="11" fontWeight="500">
                      Actual: {Math.round(value)} ml
                    </text>
                  );
                }}
              />
              {waterData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={entry.actual >= entry.target ? '#48bb78' : entry.actual >= entry.expected ? '#4299e1' : '#ecc94b'} 
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default NutritionGaugeCard;
