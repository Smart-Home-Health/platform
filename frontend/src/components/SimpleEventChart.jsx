import { useEffect, useRef, memo } from 'react';
import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';

// Use React.memo to prevent re-renders when props don't change
const SimpleEventChart = memo(({ title, color, data, unit, xType = 'category' }) => {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const canvasId = useRef(`chart-${Math.random().toString(36).substr(2, 9)}`);
  
  // Store the data in a ref to compare with future renders
  const prevDataRef = useRef(null);

  useEffect(() => {
    // Don't try to render if we don't have data
    if (!data || data.length === 0 || !chartRef.current) {
      console.log(`No data available for ${title} chart`);
      return;
    }
    
    // Check if data has actually changed to avoid unnecessary updates
    const dataChanged = prevDataRef.current !== data || 
                        JSON.stringify(prevDataRef.current) !== JSON.stringify(data);
    
    // If data hasn't changed, don't recreate the chart
    if (chartInstance.current && !dataChanged) {
      console.log(`Skipping ${title} chart update - data unchanged`);
      return;
    }
    
    // Update the data reference
    prevDataRef.current = data;
    
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
                text: 'Time'
              },
              ticks: {
                color: '#a0aec0',
                maxRotation: 0,
                autoSkip: true,
                maxTicksLimit: 8,
              },
              grid: {
                color: 'rgba(160, 174, 192, 0.1)'
              }
            },
            y: {
              title: {
                display: true,
                text: unit
              },
              ticks: {
                color: '#a0aec0'
              },
              grid: {
                color: 'rgba(160, 174, 192, 0.1)'
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
  }, [title, color, data, unit, xType]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <canvas id={canvasId.current} ref={chartRef}></canvas>
    </div>
  );
});

export default SimpleEventChart;