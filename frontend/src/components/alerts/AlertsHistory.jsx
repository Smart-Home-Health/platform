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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

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

  const summaryCards = analysis ? [
    { title: 'Time Logged', value: `${analysis.time_logged_hours}h`, valueClass: 'text-ring',
      subtitle: `(${analysis.time_logged_minutes} minutes)` },
    { title: 'Total Readings', value: analysis.total_readings.toLocaleString(), valueClass: 'text-success',
      subtitle: `(${analysis.valid_spo2_readings} valid SpO₂${analysis.error_spo2_readings > 0 ? `, ${analysis.error_spo2_readings} errors` : ''})` },
    { title: 'Average SpO₂', value: `${analysis.avg_spo2}%`, valueClass: 'text-warning',
      subtitle: `Range: ${analysis.min_spo2}% - ${analysis.max_spo2}%` },
    { title: 'Average BPM', value: analysis.avg_bpm, valueClass: 'text-ring',
      subtitle: `Range: ${analysis.min_bpm} - ${analysis.max_bpm}` },
  ] : [];

  return (
    <div className="tw flex flex-col gap-4 text-foreground">
      {/* Header + date picker (stacks on mobile) */}
      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="m-0 text-xl font-semibold">Pulse Oximetry Analysis</h2>
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2.5">
          <Label htmlFor="date-select" className="text-muted-foreground">Select Date:</Label>
          <Select
            value={selectedDate || undefined}
            onValueChange={handleDateChange}
            disabled={loading}
          >
            <SelectTrigger id="date-select" className="w-full sm:w-auto sm:min-w-[240px]">
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

      {error && <Alert variant="destructive">{error}</Alert>}

      {loading && (
        <div className="flex items-center justify-center gap-3 py-10 text-muted-foreground">
          <span className="h-6 w-6 animate-spin rounded-full border-[3px] border-muted border-t-ring" />
          Loading analysis…
        </div>
      )}

      {analysis && !loading && (
        <div className="flex flex-col gap-5 rounded-xl border border-border bg-card p-4 sm:p-5">
          <h3 className="m-0 text-center text-lg font-semibold">
            Pulse Oximetry Analysis for {formatDate(analysis.date)}
          </h3>

          {/* Summary cards */}
          <div className="grid gap-3 sm:gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            {summaryCards.map(card => (
              <div key={card.title} className="rounded-xl border border-border bg-muted/40 p-4 text-center">
                <div className="mb-2 text-sm font-medium text-muted-foreground">{card.title}</div>
                <div className={cn('text-2xl font-bold', card.valueClass)}>{card.value}</div>
                <div className="mt-1 text-xs text-muted-foreground">{card.subtitle}</div>
              </div>
            ))}
          </div>

          {/* SpO₂ distribution */}
          <div className="rounded-xl border border-border bg-muted/30 p-4 sm:p-5">
            <h4 className="m-0 mb-4 text-center text-base font-semibold">SpO₂ Distribution</h4>
            <div className="flex flex-col gap-3">
              {analysis.spo2_distribution && Object.entries(analysis.spo2_distribution).map(([category, data]) => (
                <div
                  key={category}
                  className="flex flex-col gap-1.5 sm:grid sm:grid-cols-[minmax(140px,200px)_1fr_auto] sm:items-center sm:gap-4 sm:gap-y-0"
                >
                  {/* Label (+ inline stats on mobile) */}
                  <div className="flex items-center justify-between gap-2 sm:justify-start">
                    <div className="flex items-center gap-2 font-medium">
                      <span className="h-3.5 w-3.5 shrink-0 rounded" style={{ backgroundColor: getSpo2Color(category) }} />
                      <span className="text-sm">{getCategoryLabel(category)}</span>
                    </div>
                    <div className="flex items-baseline gap-1.5 sm:hidden">
                      <span className="text-sm font-semibold text-foreground">{data.percentage}%</span>
                      <span className="text-xs text-muted-foreground">({data.count.toLocaleString()})</span>
                    </div>
                  </div>

                  {/* Bar */}
                  <div className="h-2.5 overflow-hidden rounded-full bg-muted sm:h-5">
                    <div
                      className="h-full rounded-full transition-[width] duration-300"
                      style={{ width: `${Math.max(data.percentage, 0.5)}%`, minWidth: 2, backgroundColor: getSpo2Color(category) }}
                    />
                  </div>

                  {/* Stats (desktop column) */}
                  <div className="hidden flex-col items-end gap-0.5 sm:flex">
                    <span className="text-sm font-semibold text-foreground">{data.percentage}%</span>
                    <span className="text-xs text-muted-foreground">({data.count.toLocaleString()})</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!analysis && !loading && selectedDate && (
        <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground">
          No pulse oximetry data found for {formatDate(selectedDate)}
        </div>
      )}

      {!selectedDate && !loading && (
        <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground">
          Please select a date to view pulse oximetry analysis
        </div>
      )}
    </div>
  );
};

export default AlertsHistory;
