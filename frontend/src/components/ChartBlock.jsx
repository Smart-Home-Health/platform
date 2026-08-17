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
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { CHART_CHROME } from "../contexts/DashboardThemeContext";

export default function ChartBlock({ yLabel, color, dataset, showXaxis = true, showYaxis = true, chrome = CHART_CHROME, windowMs = 5 * 60 * 1000 }) {
  // Series colors follow the vc state tokens (literals — recharts needs them)
  const getColor = (colorName) => {
    switch (colorName.toLowerCase()) {
      case 'blue':
        return '#4da7bd';
      case 'green':
        return '#3fbf6a';
      case 'orange':
        return '#f0a52e';
      default:
        return colorName;
    }
  };
  
  const chartColor = getColor(color);
  
  // Filter dataset to the chart's time window
  const windowStart = Date.now() - windowMs;
  const filteredData = dataset.filter(point => point.x >= windowStart);
  // Seconds only add noise once a tick spans minutes
  const coarseTicks = windowMs > 60 * 60 * 1000;
  
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
      backgroundColor: chrome.bg,
      borderRadius: "0px"
    }}>
      {/* Removed the title div that was here */}

      {filteredData.length === 0 ? (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100%',
          color: chrome.axis
        }}>
          Waiting for data...
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={filteredData} margin={{ top: 5, right: 22, bottom: 5, left: 0 }}>
            {showXaxis && (
              <XAxis
                dataKey="x"
                type="number"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(unixTime) => {
                  const d = new Date(unixTime);
                  const hm = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
                  return coarseTicks ? hm : `${hm}:${d.getSeconds().toString().padStart(2, '0')}`;
                }}
                axisLine={{ stroke: chrome.grid }}
                tickLine={{ stroke: chrome.grid }}
                tick={{ fill: chrome.axis, fontSize: 10 }}
              />
            )}
            {showYaxis && (
              <YAxis
                domain={calculateYDomain()}
                label={{ value: yLabel, angle: -90, position: 'insideLeft', fill: chrome.axis, fontSize: 12 }}
                axisLine={{ stroke: chrome.grid }}
                tickLine={{ stroke: chrome.grid }}
                tick={{ fill: chrome.axis, fontSize: 10 }}
              />
            )}
            <Tooltip
              labelFormatter={(unixTime) => new Date(unixTime).toLocaleTimeString()}
              contentStyle={{ backgroundColor: chrome.tooltipBg, border: `1px solid ${chrome.tooltipBorder}`, borderRadius: '4px' }}
              itemStyle={{ color: chartColor }}
              labelStyle={{ color: chrome.tooltipText }}
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