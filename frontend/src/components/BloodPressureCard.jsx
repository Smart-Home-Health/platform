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

const BloodPressureCard = ({ bpHistory = [] }) => {
  // Sort and filter valid MAP data for the chart
  const validBpData = [...(bpHistory || [])]
    .filter(bp => bp.map !== null && bp.map !== undefined && bp.map !== 0)
    .slice(-5) // Only take last 5 entries
    .map((bp, index) => ({
      index,
      map: bp.map
    }));

  const sortedBpHistory = [...(bpHistory || [])]
    .filter(bp =>
      (bp.systolic !== null && bp.systolic !== 0) ||
      (bp.diastolic !== null && bp.diastolic !== 0) ||
      (bp.map !== null && bp.map !== 0)
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

  // Calculate Y domain based on actual MAP values
  const calculateYDomain = () => {
    if (validBpData.length === 0) return [0, 200]; // Default for BP
    
    const mapValues = validBpData.map(d => d.map);
    let min = Math.min(...mapValues);
    let max = Math.max(...mapValues);
    
    // Add padding (15% for BP since values can vary significantly)
    const padding = (max - min) * 0.15;
    min = Math.max(0, min - padding);
    max = max + padding;
    
    return [min, max];
  };

  return (
    <div className="bp-card">
      <h3 className="bp-title">Blood Pressure History</h3>
      
      <div className="bp-content">
        {/* Chart section - 40% height */}
        <div className="bp-chart-container">
          {validBpData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={validBpData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
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
                  itemStyle={{ color: '#ff5252' }}
                  formatter={(value) => [`MAP: ${value}`, '']}
                />
                <Line 
                  type="monotone" 
                  dataKey="map" 
                  stroke="#ff5252"
                  dot={{ fill: '#ff5252', r: 4 }}
                  strokeWidth={2}
                  activeDot={{ fill: '#ff5252', stroke: '#fff', strokeWidth: 2, r: 6 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="no-data">No BP data available</div>
          )}
        </div>

        {/* Table section - 60% height */}
        <div className="bp-table-container">
          <table className="bp-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Sys/Dia</th>
                <th>MAP</th>
              </tr>
            </thead>
            <tbody>
              {sortedBpHistory.length > 0 ? (
                sortedBpHistory.map((bp, index) => (
                  <tr key={index}>
                    <td>{formatDateTime(bp.datetime)}</td>
                    <td>
                      {bp.systolic !== null && bp.diastolic !== null
                        ? `${bp.systolic}/${bp.diastolic}`
                        : '--/--'}
                    </td>
                    <td>{bp.map !== null ? bp.map : '--'}</td>
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
}

export default BloodPressureCard;
