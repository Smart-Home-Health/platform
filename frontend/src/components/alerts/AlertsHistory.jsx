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
import { useState, useEffect } from 'react';
import config from '../../config';
import { Alert } from '@/components/ui/alert';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';

const AlertsHistory = ({ patientId }) => {
  const [availableDates, setAvailableDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setAnalysis(null);
    fetchAvailableDates();
  }, [patientId]);

  const fetchAvailableDates = async () => {
    try {
      let url = `${config.apiUrl}/api/monitoring/history/dates`;
      if (patientId != null) {
        url += `?patient_id=${patientId}`;
      }
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch dates');
      const data = await response.json();
      console.log('Received dates data:', data);
      setAvailableDates(data.dates || []);
      
      // Auto-select the most recent date
      if (data.dates && data.dates.length > 0) {
        setSelectedDate(data.dates[0]);
      }
    } catch (err) {
      console.error('Error fetching available dates:', err);
      setError('Failed to load available dates');
    }
  };

  const fetchAnalysis = async (date) => {
    setLoading(true);
    setError(null);
    try {
      let url = `${config.apiUrl}/api/monitoring/history/analyze/${date}`;
      if (patientId != null) {
        url += `?patient_id=${patientId}`;
      }
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch analysis');
      const data = await response.json();
      console.log('Received analysis data:', data);
      setAnalysis(data);
    } catch (err) {
      console.error('Error fetching analysis:', err);
      setError('Failed to load analysis data');
    } finally {
      setLoading(false);
    }
  };

  const handleDateChange = (date) => {
    setSelectedDate(date);
    if (date) {
      fetchAnalysis(date);
    }
  };

  // Auto-load analysis for initial date
  useEffect(() => {
    if (selectedDate) {
      fetchAnalysis(selectedDate);
    }
  }, [selectedDate, patientId]);

  const formatDate = (dateString) => {
    // Parse as local date to avoid timezone conversion
    const [year, month, day] = dateString.split('-');
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getSpo2Color = (category) => {
    const colors = {
      'high_90s_97_plus': '#059669',     // Dark Green
      'mid_90s_94_96': '#22c55e',        // Green
      'low_90s_90_93': '#65a30d',        // Lime Green
      'high_eighties_85_89': '#eab308',  // Yellow
      'low_eighties_80_84': '#f59e0b',   // Amber
      'seventies_70_79': '#f97316',      // Orange
      'sixties_60_69': '#ea580c',        // Dark Orange
      'fifties_50_59': '#ef4444',        // Red
      'forties_40_49': '#dc2626',        // Dark Red
      'thirties_30_39': '#b91c1c',       // Darker Red
      'twenties_20_29': '#991b1b',       // Very Dark Red
      'below_twenty': '#7c2d12',         // Darkest Red
      'zero_errors': '#6b7280'           // Gray
    };
    return colors[category] || '#6b7280';
  };

  const getCategoryLabel = (category) => {
    const labels = {
      'high_90s_97_plus': 'High 90s (97%+)',
      'mid_90s_94_96': 'Mid 90s (94-96%)',
      'low_90s_90_93': 'Low 90s (90-93%)',
      'high_eighties_85_89': 'High 80s (85-89%)',
      'low_eighties_80_84': 'Low 80s (80-84%)',
      'seventies_70_79': '70s (70-79%)',
      'sixties_60_69': '60s (60-69%)',
      'fifties_50_59': '50s (50-59%)',
      'forties_40_49': '40s (40-49%)',
      'thirties_30_39': '30s (30-39%)',
      'twenties_20_29': '20s (20-29%)',
      'below_twenty': 'Below 20%',
      'zero_errors': 'Sensor Errors (0%)'
    };
    return labels[category] || category;
  };

  return (
    <div className="alerts-history">
      <div className="history-header">
        <h2>Pulse Oximetry Analysis</h2>
        <div className="date-selector tw">
          <label htmlFor="date-select">Select Date:</label>
          <Select
            value={selectedDate || undefined}
            onValueChange={handleDateChange}
            disabled={loading}
          >
            <SelectTrigger id="date-select" className="w-auto min-w-[240px]">
              <SelectValue placeholder="Choose a date..." />
            </SelectTrigger>
            <SelectContent>
              {availableDates.map(date => (
                <SelectItem key={date} value={date}>
                  {formatDate(date)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && (
        <div className="tw"><Alert variant="destructive">{error}</Alert></div>
      )}

      {loading && (
        <div className="loading">
          <div className="spinner"></div>
          Loading analysis...
        </div>
      )}

      {analysis && !loading && (
        <div className="analysis-results">
          <div className="analysis-header">
            <h3>Pulse Oximetry Analysis for {formatDate(analysis.date)}</h3>
          </div>

          {/* Summary Cards */}
          <div className="summary-cards">
            <div className="summary-card">
              <div className="card-title">Time Logged</div>
              <div className="card-value primary">{analysis.time_logged_hours}h</div>
              <div className="card-subtitle">({analysis.time_logged_minutes} minutes)</div>
            </div>

            <div className="summary-card">
              <div className="card-title">Total Readings</div>
              <div className="card-value success">{analysis.total_readings.toLocaleString()}</div>
              <div className="card-subtitle">
                ({analysis.valid_spo2_readings} valid SpO₂
                {analysis.error_spo2_readings > 0 && `, ${analysis.error_spo2_readings} errors`})
              </div>
            </div>

            <div className="summary-card">
              <div className="card-title">Average SpO₂</div>
              <div className="card-value warning">{analysis.avg_spo2}%</div>
              <div className="card-subtitle">Range: {analysis.min_spo2}% - {analysis.max_spo2}%</div>
            </div>

            <div className="summary-card">
              <div className="card-title">Average BPM</div>
              <div className="card-value info">{analysis.avg_bpm}</div>
              <div className="card-subtitle">Range: {analysis.min_bpm} - {analysis.max_bpm}</div>
            </div>
          </div>

          {/* SpO2 Distribution */}
          <div className="distribution-section">
            <h4>SpO₂ Distribution</h4>
            <div className="distribution-chart">
              {analysis.spo2_distribution && Object.entries(analysis.spo2_distribution).map(([category, data]) => (
                <div key={category} className="distribution-row">
                  <div className="distribution-label">
                    <div 
                      className="color-indicator" 
                      style={{ backgroundColor: getSpo2Color(category) }}
                    ></div>
                    <span>{getCategoryLabel(category)}</span>
                  </div>
                  <div className="distribution-bar">
                    <div 
                      className="bar-fill" 
                      style={{ 
                        width: `${Math.max(data.percentage, 0.5)}%`,
                        backgroundColor: getSpo2Color(category)
                      }}
                    ></div>
                  </div>
                  <div className="distribution-stats">
                    <span className="percentage">{data.percentage}%</span>
                    <span className="count">({data.count.toLocaleString()})</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!analysis && !loading && selectedDate && (
        <div className="no-data">
          No pulse oximetry data found for {formatDate(selectedDate)}
        </div>
      )}

      {!selectedDate && !loading && (
        <div className="no-selection">
          Please select a date to view pulse oximetry analysis
        </div>
      )}
    </div>
  );
};

export default AlertsHistory;
