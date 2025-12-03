import React, { useState } from 'react';
import { LineChart, Line, ResponsiveContainer, YAxis, Tooltip } from "recharts";
import NutritionGaugeCard from './dashboard/NutritionGaugeCard';

const DynamicVitalsCard = ({ vitalType, data = [], title }) => {
  const [isFlipped, setIsFlipped] = useState(false);

  // Special case for nutrition - render dedicated gauge component
  if (vitalType === 'nutrition') {
    return <NutritionGaugeCard />;
  }

  // Format the data for the chart based on vital type
  const formatChartData = (data, vitalType) => {
    if (!data || data.length === 0) return [];
    
    // For bathroom vitals, we want to keep the numeric values for charting
    // but we may want to group by vital_group for different colors
    if (vitalType === 'bathroom') {
      return data.slice(-5).map((item, index) => ({
        index,
        value: item.value, // Keep numeric value for chart
        originalItem: item,
        group: item.vital_group || 'unknown' // Add group for potential color coding
      }));
    }
    
    return data.slice(-5).map((item, index) => {
      let value = item.value;
      
      // Handle different data structures
      if (vitalType === 'blood_pressure') {
        // For blood pressure, use MAP for charting, but show systolic/diastolic in table
        value = item.map || item.value; // Use MAP if available, fallback to value
      } else if (vitalType === 'temperature') {
        // For temperature, use body temp for charting
        value = item.body || item.value; // Use body temp if available, fallback to value
      }
      
      return {
        index,
        value: value,
        originalItem: item
      };
    });
  };

  const chartData = formatChartData(data, vitalType);
  
  // Custom tooltip for chart hover
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload.originalItem;
      if (!data) return null;
      
      return (
        <div style={{
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          padding: '8px 12px',
          borderRadius: '4px',
          border: '1px solid #333',
          color: '#fff',
          fontSize: '12px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)'
        }}>
          <div style={{ marginBottom: '4px', fontWeight: '500' }}>
            {formatDisplayValue(data, vitalType)}
          </div>
          <div style={{ color: '#ccc', fontSize: '10px' }}>
            {formatDateTime(data.datetime)}
          </div>
          {vitalType === 'bathroom' && data.vital_group && (
            <div style={{ 
              color: getChartColor(vitalType, data.vital_group), 
              fontSize: '10px',
              marginTop: '2px'
            }}>
              {getGroupDisplay(data.vital_group)}
            </div>
          )}
        </div>
      );
    }
    return null;
  };
  
  // Bathroom size mapping for display
  const getBathroomSizeDisplay = (value, vitalGroup) => {
    // Check if this is a bathroom-related group
    const bathroomGroups = ['bathroom', 'mix', 'wet', 'dry', 'solid', 'liquid'];
    const isBathroomGroup = vitalGroup && bathroomGroups.includes(vitalGroup.toLowerCase());
    
    if (isBathroomGroup && value !== null && value !== undefined && typeof value === 'number') {
      const sizeMap = {
        0: 'Smear',
        1: 'Small',
        2: 'Medium', 
        3: 'Large',
        4: 'Extra Large'
      };
      return sizeMap[value] || value;
    }
    return value;
  };

  // Group display formatting
  const getGroupDisplay = (vitalGroup) => {
    if (!vitalGroup) return '-';
    return vitalGroup.charAt(0).toUpperCase() + vitalGroup.slice(1);
  };

  // Format display value based on vital type
  const formatDisplayValue = (item, vitalType) => {
    if (!item) return '--';
    
    switch (vitalType) {
      case 'blood_pressure':
        if (item.systolic && item.diastolic) {
          // Show "systolic/diastolic (MAP)" format
          return `${item.systolic}/${item.diastolic}${item.map ? ` (${item.map})` : ''}`;
        }
        return item.map ? `MAP: ${item.map}` : '--';
      case 'temperature':
        if (item.body) {
          return `${item.body}°F${item.skin ? ` (Skin: ${item.skin}°F)` : ''}`;
        }
        return item.value ? `${item.value}°F` : '--';
      case 'weight':
        return item.value ? `${item.value} lbs` : '--';
      case 'calories':
        return item.value ? `${item.value} cal` : '--';
      case 'water':
        return item.value ? `${item.value} ml` : '--';
      case 'bathroom':
        // For bathroom, show the mapped size
        return getBathroomSizeDisplay(item.value, item.vital_group) || '--';
      default:
        return item.value ? `${item.value}` : '--';
    }
  };

  // Format time display as time delta from now
  const formatDateTime = (dateTimeStr) => {
    if (!dateTimeStr) return "Unknown";
    
    try {
      let date;
      
      // Handle different datetime formats from backend
      if (typeof dateTimeStr === 'string') {
        // All datetime strings should now be consistent from backend
        date = new Date(dateTimeStr);
      } else if (typeof dateTimeStr === 'object' && dateTimeStr !== null) {
        // Handle objects (could be a Date or datetime-like object)
        if (dateTimeStr instanceof Date) {
          date = dateTimeStr;
        } else {
          // Try to extract date info from object structure
          date = new Date(dateTimeStr.toString());
        }
      } else if (typeof dateTimeStr === 'number') {
        // Handle timestamp
        date = new Date(dateTimeStr);
      } else {
        // Fallback: try direct conversion
        date = new Date(dateTimeStr);
      }
      
      // Ensure we have a valid date
      if (!date || isNaN(date.getTime())) {
        return "Unknown time";
      }
      
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      
      // Convert to different time units
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      // Return appropriate format based on time difference
      if (Math.abs(diffMinutes) < 1) {
        return "Just now";
      } else if (diffMinutes < 0) {
        // Future date
        return `In ${Math.abs(diffMinutes)}m`;
      } else if (diffMinutes < 60) {
        return `${diffMinutes}m ago`;
      } else if (diffHours < 24) {
        return `${diffHours}h ago`;
      } else {
        return `${diffDays}d ago`;
      }
    } catch (error) {
      return "Time error";
    }
  };

  // Calculate Y domain for chart
  const calculateYDomain = () => {
    if (chartData.length === 0) return [0, 100];
    
    const values = chartData.map(d => d.value).filter(v => v !== null && v !== undefined && !isNaN(v));
    if (values.length === 0) return [0, 100];
    
    let min = Math.min(...values);
    let max = Math.max(...values);
    
    // Special handling for different vital types
    if (vitalType === 'temperature') {
      // For temperature, use a more reasonable range around body temperature
      min = Math.max(95, min - 2); // Don't go below 95°F
      max = Math.min(110, max + 2); // Don't go above 110°F
    } else if (vitalType === 'bathroom') {
      // For bathroom vitals (0-4 scale), ensure we show the full range
      min = 0;
      max = Math.max(4, max);
    } else {
      // Add padding for other vital types
      const padding = (max - min) * 0.1 || 10;
      min = Math.max(0, min - padding);
      max = max + padding;
    }
    
    return [min, max];
  };

  // Get chart color based on vital type
  const getChartColor = (vitalType, group = null) => {
    if (vitalType === 'bathroom' && group) {
      // Use group-specific colors for bathroom vitals
      const groupColors = {
        'mix': '#8B4513',      // Brown
        'wet': '#4169E1',      // Royal Blue  
        'dry': '#DAA520',      // Goldenrod
        'solid': '#8B4513',    // Brown
        'liquid': '#4169E1',   // Royal Blue
        'bathroom': '#6B46C1', // Purple
        'unknown': '#6B7280'   // Gray
      };
      return groupColors[group.toLowerCase()] || '#6B7280';
    }
    
    const colors = {
      'blood_pressure': '#ff5252',
      'temperature': '#9c56b8',
      'weight': '#4caf50',
      'calories': '#ff9800',
      'water': '#2196f3',
      'bathroom': '#795548'
    };
    return colors[vitalType] || '#666';
  };

  const displayTitle = title || vitalType.charAt(0).toUpperCase() + vitalType.slice(1);
  
  // Get the primary group for bathroom vitals to determine title color
  const primaryGroup = vitalType === 'bathroom' && data && data.length > 0 ? 
    data[data.length - 1]?.vital_group : null;

  return (
    <div style={{
      position: 'relative',
      height: '100%',
      width: '100%',
      perspective: '1000px'
    }}>
      <div style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        transition: 'transform 0.6s',
        transformStyle: 'preserve-3d',
        transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
      }}>
        {/* Front side - Chart only */}
        <div style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          backfaceVisibility: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          cursor: 'pointer'
        }}
        onClick={() => setIsFlipped(true)}
        >
          <h3 style={{ 
            color: vitalType === 'bathroom' && primaryGroup ? 
              getChartColor(vitalType, primaryGroup) : 
              getChartColor(vitalType), 
            margin: '0 0 10px 0', 
            fontSize: '18px',
            fontWeight: '600',
            textAlign: 'center'
          }}>
            {displayTitle} History
          </h3>

          {/* Chart only view */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                  <YAxis 
                    domain={calculateYDomain()}
                    hide={true}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Line 
                    type="monotone" 
                    dataKey="value" 
                    stroke={vitalType === 'bathroom' && chartData[0]?.group ? 
                      getChartColor(vitalType, chartData[0].group) : 
                      getChartColor(vitalType)}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ 
                      r: 4, 
                      fill: vitalType === 'bathroom' && chartData[0]?.group ? 
                        getChartColor(vitalType, chartData[0].group) : 
                        getChartColor(vitalType),
                      stroke: '#fff',
                      strokeWidth: 2
                    }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ 
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: '#666',
                fontSize: '14px'
              }}>
                No {vitalType} data available
              </div>
            )}
          </div>
          
          {/* Click hint */}
          <div style={{
            textAlign: 'center',
            padding: '8px',
            fontSize: '11px',
            color: '#888',
            opacity: 0.7
          }}>
            Click to view details
          </div>
        </div>

        {/* Back side - Table only */}
        <div style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          backfaceVisibility: 'hidden',
          transform: 'rotateY(180deg)',
          display: 'flex',
          flexDirection: 'column',
          cursor: 'pointer'
        }}
        onClick={() => setIsFlipped(false)}
        >
          <h3 style={{ 
            color: vitalType === 'bathroom' && primaryGroup ? 
              getChartColor(vitalType, primaryGroup) : 
              getChartColor(vitalType), 
            margin: '0 0 10px 0', 
            fontSize: '18px',
            fontWeight: '600',
            textAlign: 'center'
          }}>
            {displayTitle} Data
          </h3>

          {/* Table only */}
          <div style={{ 
            flex: 1, 
            overflowY: 'auto'
          }}>
            <table style={{ 
              width: '100%', 
              borderCollapse: 'collapse',
              fontSize: '12px',
              color: '#fff'
            }}>
              <thead>
                <tr>
                  <th style={{ 
                    padding: '4px 8px', 
                    borderBottom: '1px solid #333',
                    fontSize: '10px',
                    color: '#ccc',
                    textAlign: 'left'
                  }}>
                    Time
                  </th>
                  {vitalType === 'bathroom' && (
                    <th style={{ 
                      padding: '4px 8px', 
                      borderBottom: '1px solid #333',
                      fontSize: '10px',
                      color: '#ccc',
                      textAlign: 'left'
                    }}>
                      Group
                    </th>
                  )}
                  <th style={{ 
                    padding: '4px 8px', 
                    borderBottom: '1px solid #333',
                    fontSize: '10px',
                    color: '#ccc',
                    textAlign: 'right'
                  }}>
                    Value
                  </th>
                </tr>
              </thead>
              <tbody>
                {data && data.length > 0 ? (
                  data.slice(-5).map((item, index) => (
                    <tr key={index}>
                      <td style={{ 
                        padding: '4px 8px', 
                        borderBottom: '1px solid #333',
                        fontSize: '11px',
                        color: '#ccc'
                      }}>
                        {formatDateTime(item.datetime)}
                      </td>
                      {vitalType === 'bathroom' && (
                        <td style={{ 
                          padding: '4px 8px', 
                          borderBottom: '1px solid #333',
                          fontSize: '11px',
                          color: getChartColor(vitalType, item.vital_group),
                          fontWeight: '500'
                        }}>
                          {getGroupDisplay(item.vital_group)}
                        </td>
                      )}
                      <td style={{ 
                        padding: '4px 8px', 
                        borderBottom: '1px solid #333',
                        fontSize: '11px',
                        color: '#fff',
                        textAlign: 'right',
                        fontWeight: '500'
                      }}>
                        {formatDisplayValue(item, vitalType)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={vitalType === 'bathroom' ? 3 : 2} style={{ 
                      textAlign: "center", 
                      padding: '20px',
                      color: '#666',
                      fontSize: '11px'
                    }}>
                      No data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          {/* Click hint */}
          <div style={{
            textAlign: 'center',
            padding: '8px',
            fontSize: '11px',
            color: '#888',
            opacity: 0.7
          }}>
            Click to hide details
          </div>
        </div>
      </div>
    </div>
  );
};

export default DynamicVitalsCard;
