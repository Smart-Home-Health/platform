/*
 * Smart Home Health Hub
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
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export default function ChartBlock({ title, yLabel, color, dataset, showXaxis = true, showYaxis = true }) {
  // Map colors to match value displays
  const getColor = (colorName) => {
    switch (colorName.toLowerCase()) {
      case 'blue':
        return '#1565C0';
      case 'green':
        return '#2E7D32';
      case 'orange':
        return '#EF6C00';
      default:
        return colorName;
    }
  };
  
  const chartColor = getColor(color);
  
  // Filter dataset to show only the last 5 minutes of data
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  const filteredData = dataset.filter(point => point.x >= fiveMinutesAgo);
  
  // Calculate min and max values for auto-scaling Y axis
  const calculateYDomain = () => {
    if (filteredData.length === 0) return [0, 10]; // Default values if no data
    
    const yValues = filteredData.map(d => d.y);
    let min = Math.min(...yValues);
    let max = Math.max(...yValues);
    
    // Add some padding to the min/max values for better visualization
    const padding = (max - min) * 0.1; // 10% padding
    min = Math.max(0, min - padding); // Don't go below 0 for most medical metrics
    max = max + padding;
    
    return [min, max];
  };
  
  return (
    <div style={{ 
      width: "100%", 
      height: "100%", 
      position: "relative", 
      backgroundColor: "#161e2e",
      borderRadius: "0px"
    }}>
      {/* Removed the title div that was here */}

      {filteredData.length === 0 ? (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100%',
          color: '#999'
        }}>
          Waiting for data...
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={filteredData}>
            {showXaxis && (
              <XAxis
                dataKey="x"
                type="number"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(unixTime) => {
                  const d = new Date(unixTime);
                  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
                }}
                axisLine={{ stroke: '#333' }}
                tickLine={{ stroke: '#333' }}
                tick={{ fill: '#999', fontSize: 10 }}
              />
            )}
            {showYaxis && (
              <YAxis 
                domain={calculateYDomain()}
                label={{ value: yLabel, angle: -90, position: 'insideLeft', fill: '#999', fontSize: 12 }} 
                axisLine={{ stroke: '#333' }}
                tickLine={{ stroke: '#333' }}
                tick={{ fill: '#999', fontSize: 10 }}
              />
            )}
            <Tooltip 
              labelFormatter={(unixTime) => new Date(unixTime).toLocaleTimeString()} 
              contentStyle={{ backgroundColor: '#161e2e', border: '1px solid #333', borderRadius: '4px' }}
              itemStyle={{ color: chartColor }}
              labelStyle={{ color: '#fff' }}
            />
            <Line 
              type="monotone" 
              dataKey="y" 
              stroke={chartColor}
              dot={false}
              isAnimationActive={false}
              strokeWidth={2.5} // Keep only one strokeWidth property
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );}