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
import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

const EventChart = ({ title, yLabel, color, dataset, minThreshold, maxThreshold }) => {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  useEffect(() => {
    // Debug logging
    console.log(`EventChart: Rendering ${title} chart with ${dataset?.length || 0} data points`);
    
    if (!chartRef.current || !dataset || dataset.length === 0) {
      return;
    }

    // Cleanup previous chart if it exists
    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const ctx = chartRef.current.getContext('2d');
    
    // Create chart configuration
    const chartConfig = {
      type: 'line',
      data: {
        datasets: [{
          label: title,
          data: dataset.map(point => ({
            x: point.timestamp,
            y: point.value
          })),
          borderColor: color,
          backgroundColor: `${color}20`,
          borderWidth: 2,
          fill: true,
          tension: 0.2,
          pointRadius: 3,
          pointHoverRadius: 5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
              title: function(tooltipItems) {
                return new Date(tooltipItems[0].parsed.x).toLocaleString();
              }
            }
          },
          legend: {
            display: false
          }
        },
        scales: {
          x: {
            type: 'time',
            time: {
              displayFormats: {
                second: 'h:mm:ss a',
                minute: 'h:mm a'
              },
              unit: 'minute'
            },
            title: {
              display: true,
              text: 'Time',
              color: '#a0aec0'
            },
            ticks: {
              color: '#a0aec0'
            },
            grid: {
              color: 'rgba(160, 174, 192, 0.1)'
            }
          },
          y: {
            title: {
              display: true,
              text: yLabel,
              color: '#a0aec0'
            },
            ticks: {
              color: '#a0aec0',
              precision: 0
            },
            grid: {
              color: 'rgba(160, 174, 192, 0.1)'
            }
          }
        }
      }
    };

    // Add min/max thresholds as horizontal lines if provided
    if (minThreshold !== undefined) {
      if (!chartConfig.options.plugins.annotation) {
        chartConfig.options.plugins.annotation = { annotations: {} };
      }
      
      chartConfig.options.plugins.annotation.annotations.minLine = {
        type: 'line',
        yMin: minThreshold,
        yMax: minThreshold,
        borderColor: 'rgba(255, 159, 64, 0.5)',
        borderWidth: 1,
        borderDash: [5, 5],
        label: {
          enabled: true,
          content: `Min: ${minThreshold}`,
          position: 'start'
        }
      };
    }

    if (maxThreshold !== undefined) {
      if (!chartConfig.options.plugins.annotation) {
        chartConfig.options.plugins.annotation = { annotations: {} };
      }
      
      chartConfig.options.plugins.annotation.annotations.maxLine = {
        type: 'line',
        yMin: maxThreshold,
        yMax: maxThreshold,
        borderColor: 'rgba(255, 159, 64, 0.5)',
        borderWidth: 1,
        borderDash: [5, 5],
        label: {
          enabled: true,
          content: `Max: ${maxThreshold}`,
          position: 'start'
        }
      };
    }

    // Create the chart
    chartInstance.current = new Chart(ctx, chartConfig);
    
    console.log(`EventChart: ${title} chart created`);

    // Cleanup on unmount
    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
        chartInstance.current = null;
      }
    };
  }, [dataset, title, yLabel, color, minThreshold, maxThreshold]);

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <canvas ref={chartRef}></canvas>
    </div>
  );
};

export default EventChart;