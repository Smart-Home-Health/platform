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

const TemperatureCard = ({ tempHistory = [] }) => {
  // Format data for the chart
  const validTempData = [...(tempHistory || [])]
    .filter(temp => 
      (temp.body !== null && temp.body !== 0)
    )
    .slice(-5) // Only take last 5 entries
    .map((temp, index) => ({
      index,
      body: temp.body,
      skin: temp.skin // Include skin data for tooltip
    }));

  const sortedTempHistory = [...(tempHistory || [])]
    .filter(temp =>
      (temp.body !== null && temp.body !== 0)
    )
    .sort((a, b) => {
      if (!a.datetime) return 1;
      if (!b.datetime) return -1;
      return new Date(a.datetime) - new Date(b.datetime); // Changed to oldest first
    })
    .slice(0, 5);

  const formatDateTime = (dateTimeStr) => {
    if (!dateTimeStr) return "Unknown";
    try {
      const date = new Date(dateTimeStr);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch {
      return "Invalid Date";
    }
  };

  const formatTemp = (temp) => {
    if (temp === null || temp === undefined) return "--";
    return temp.toFixed(1);
  };

  // Calculate Y domain based on actual temperature values
  const calculateYDomain = () => {
    if (validTempData.length === 0) return [90, 105]; // Default range for temps (°F)
    
    const allTemps = [];
    validTempData.forEach(d => {
      if (d.body !== null && d.body !== undefined) allTemps.push(d.body);
    });
    
    if (allTemps.length === 0) return [90, 105];
    
    let min = Math.min(...allTemps);
    let max = Math.max(...allTemps);
    
    // Add padding (5% for temperature since values are usually in narrow range)
    const padding = (max - min) * 0.05;
    min = Math.max(min - padding, 80); // Don't go below reasonable temp
    max = Math.min(max + padding, 110); // Don't go above reasonable temp
    
    return [min, max];
  };

  return (
    <div className="temp-card">
      <h3 className="temp-title">Temperature History</h3>

      <div className="temp-content">
        {/* Chart section - 40% height */}
        <div className="temp-chart-container">
          {validTempData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={validTempData} margin={{ top: 10, right: 5, bottom: 30, left: 5 }}>
                <XAxis 
                  dataKey="index" 
                  hide 
                />
                <YAxis 
                  domain={calculateYDomain()}
                  axisLine={false} 
                  tickLine={false}
                  tick={false}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#161e2e', border: '1px solid #333', borderRadius: '4px' }}
                  itemStyle={{ color: '#fff' }}
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div style={{ backgroundColor: '#161e2e', border: '1px solid #333', borderRadius: '4px', padding: '8px' }}>
                          <p style={{ color: '#9c56b8', margin: '0 0 4px 0' }}>
                            Body Temp: {data.body?.toFixed(1)}°F
                          </p>
                          {data.skin !== null && data.skin !== undefined && (
                            <p style={{ color: '#ffd54f', margin: '0' }}>
                              Skin Temp: {data.skin?.toFixed(1)}°F
                            </p>
                          )}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="body" 
                  stroke="#9c56b8" // Purple for body temp
                  dot={{ fill: '#9c56b8', r: 4 }}
                  strokeWidth={2}
                  activeDot={{ fill: '#9c56b8', stroke: '#fff', strokeWidth: 2, r: 6 }}
                  isAnimationActive={false}
                  name="Body" // Set proper name for tooltip
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="no-data">No temperature data available</div>
          )}
        </div>

        {/* Table section - 60% height */}
        <div className="temp-table-container">
          <table className="temp-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Body °F</th>
                <th>Skin °F</th>
              </tr>
            </thead>
            <tbody>
              {sortedTempHistory.length > 0 ? (
                sortedTempHistory.map((temp, index) => (
                  <tr key={index}>
                    <td>{formatDateTime(temp.datetime)}</td>
                    <td className="body-temp">{formatTemp(temp.body)}</td>
                    <td className="skin-temp">{formatTemp(temp.skin)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="no-data-row">No data available</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default TemperatureCard;