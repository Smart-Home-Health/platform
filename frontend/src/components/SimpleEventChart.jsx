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
import { useEffect, useRef, useState, memo } from 'react';
import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';

// Resolve a theme token (e.g. "--muted-foreground") to its computed color,
// falling back to a sensible default so the chart still renders if unset.
const themeColor = (token, fallback) => {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return v || fallback;
};

// Use React.memo to prevent re-renders when props don't change
const SimpleEventChart = memo(({ title, color, data, unit, xType = 'category' }) => {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const canvasId = useRef(`chart-${Math.random().toString(36).substr(2, 9)}`);

  // Store the data/theme used for the last render so we can skip needless rebuilds.
  const prevDataRef = useRef(null);
  const prevThemeRef = useRef(null);

  // Bump on light/dark switches so the canvas re-renders with theme-aware colors.
  const [themeVersion, setThemeVersion] = useState(0);
  useEffect(() => {
    const observer = new MutationObserver(() => setThemeVersion(v => v + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    // Don't try to render if we don't have data
    if (!data || data.length === 0 || !chartRef.current) {
      console.log(`No data available for ${title} chart`);
      return;
    }

    // Rebuild when the data OR the theme changes.
    const dataChanged = prevDataRef.current !== data ||
                        JSON.stringify(prevDataRef.current) !== JSON.stringify(data);
    const themeChanged = prevThemeRef.current !== themeVersion;

    if (chartInstance.current && !dataChanged && !themeChanged) {
      console.log(`Skipping ${title} chart update - data & theme unchanged`);
      return;
    }

    // Update the data/theme references
    prevDataRef.current = data;
    prevThemeRef.current = themeVersion;
    
    console.log(`Rendering ${title} chart with ${data.length} data points`);
    
    // Always destroy any existing chart instance first
    if (chartInstance.current) {
      console.log(`Destroying existing ${title} chart instance`);
      chartInstance.current.destroy();
      chartInstance.current = null;
    }

    // Create a new chart
    try {
      const ctx = chartRef.current.getContext('2d');

      // Theme-aware axis/grid colors resolved from the active palette.
      const tickColor = themeColor('--muted-foreground', '#a0aec0');
      const titleColor = themeColor('--foreground', '#e6edf3');
      const gridColor = themeColor('--border', 'rgba(160, 174, 192, 0.2)');

      chartInstance.current = new Chart(ctx, {
        type: 'line',
        data: {
          datasets: [{
            label: title,
            data: data,
            borderColor: color,
            backgroundColor: `${color}20`,
            fill: true,
            tension: 0.2,
            pointRadius: 3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false, // Disable animations for better performance
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              mode: 'index',
              intersect: false
            }
          },
          scales: {
            x: {
              // 'time' uses chartjs-adapter-date-fns to map real Date x values.
              // 'category' (the legacy default) treats each x as a string label,
              // which collapses Date instances to one bucket — keep that for
              // pre-stringified-time consumers like AlertDetailModal.
              type: xType,
              ...(xType === 'time' ? {
                time: { tooltipFormat: 'PPpp' },
              } : {}),
              title: {
                display: true,
                text: 'Time',
                color: titleColor
              },
              ticks: {
                color: tickColor,
                maxRotation: 0,
                autoSkip: true,
                maxTicksLimit: 8,
              },
              grid: {
                color: gridColor
              }
            },
            y: {
              title: {
                display: true,
                text: unit,
                color: titleColor
              },
              ticks: {
                color: tickColor
              },
              grid: {
                color: gridColor
              }
            }
          }
        }
      });
      
      console.log(`${title} chart created successfully`);
    } catch (error) {
      console.error(`Error creating ${title} chart:`, error);
    }

    // Clean up function
    return () => {
      if (chartInstance.current) {
        console.log(`Cleaning up ${title} chart`);
        chartInstance.current.destroy();
        chartInstance.current = null;
      }
    };
  }, [title, color, data, unit, xType, themeVersion]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <canvas id={canvasId.current} ref={chartRef}></canvas>
    </div>
  );
});

export default SimpleEventChart;