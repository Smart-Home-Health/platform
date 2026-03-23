import { useState, useEffect, useMemo } from 'react';
import SimpleEventChart from './SimpleEventChart';
import config from '../config';
import ModalBase from './ModalBase';

const AlertDetailModal = ({ alert, onClose, onAcknowledge, initiateAcknowledge = false }) => {
  const [eventData, setEventData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showOxygenForm, setShowOxygenForm] = useState(initiateAcknowledge);
  const [oxygenUsed, setOxygenUsed] = useState(false);
  const [oxygenValue, setOxygenValue] = useState('');
  const [oxygenUnit, setOxygenUnit] = useState('L/min');
  const [acknowledgingAlert, setAcknowledgingAlert] = useState(false);

  useEffect(() => {
    fetchEventData();
  }, [alert.id]);

  useEffect(() => {
    if (initiateAcknowledge) {
      setShowOxygenForm(true);
    }
  }, [initiateAcknowledge]);

  const fetchEventData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${config.apiUrl}/api/monitoring/alerts/${alert.id}/data`, { credentials: 'include' });
      if (!response.ok) throw new Error(`Error fetching alert data: ${response.statusText}`);
      const data = await response.json();
      
      // Add debug logs to check the data
      console.log(`Received ${data.length} data points for alert ${alert.id}`);
      if (data.length > 0) {
        console.log(`First data point:`, data[0]);
        console.log(`Data has spo2: ${data[0].spo2 !== undefined}, bpm: ${data[0].bpm !== undefined}`);
      }
      
      setEventData(data);
    } catch (err) {
      console.error(`Error fetching data for alert ${alert.id}:`, err);
      setError('Failed to load event data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle initial acknowledge button click
  const handleAcknowledgeClick = () => {
    setShowOxygenForm(true);
  };
  
  // Handle final submission with oxygen data
  const handleSubmitAcknowledge = async () => {
    try {
      setAcknowledgingAlert(true);
      
      // Prepare the payload with oxygen usage data
      const payload = {
        oxygen_used: oxygenUsed ? 1 : 0,
        // Only include these fields if oxygen was used, otherwise send null explicitly
        oxygen_highest: oxygenUsed && oxygenValue ? parseFloat(oxygenValue) : null,
        oxygen_unit: oxygenUsed && oxygenValue ? oxygenUnit : null
      };
      
      console.log('Acknowledging alert with payload:', payload);
      
      const response = await fetch(`${config.apiUrl}/api/monitoring/alerts/${alert.id}/acknowledge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        credentials: 'include'
      });
      
      // Log the response for debugging
      const responseText = await response.text();
      console.log('Acknowledge response:', response.status, responseText);
      
      if (!response.ok) {
        throw new Error(`Failed to acknowledge alert: ${responseText}`);
      }
      
      // Call the parent component's handler to update the UI
      onAcknowledge(alert.id);
      
      // Close the modal
      onClose();
    } catch (err) {
      console.error('Error acknowledging alert:', err);
      setError(`Failed to acknowledge alert: ${err.message}`);
    } finally {
      setAcknowledgingAlert(false);
    }
  };

  // Reset form if cancelled
  const handleCancelOxygenForm = () => {
    setShowOxygenForm(false);
    setOxygenUsed(false);
    setOxygenValue('');
    setOxygenUnit('L/min');
  };

  const formatDateTime = (isoString) => {
    if (!isoString) return 'N/A';
    return new Date(isoString).toLocaleString();
  };

  const formatDuration = (start, end) => {
    if (!start || !end) return 'Ongoing';
    const durationMs = new Date(end) - new Date(start);
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  const spo2ChartData = useMemo(() => {
    if (!eventData || eventData.length === 0) return [];
    return eventData.map((point) => ({
      x: new Date(point.timestamp).toLocaleTimeString(),
      y: point.spo2
    }));
  }, [eventData]);

  const bpmChartData = useMemo(() => {
    if (!eventData || eventData.length === 0) return [];
    return eventData.map((point) => ({
      x: new Date(point.timestamp).toLocaleTimeString(),
      y: point.bpm
    }));
  }, [eventData]);

  // Render the oxygen usage form
  const renderOxygenUsageForm = () => {
    return (
      <div className="oxygen-form-overlay">
        <div className="oxygen-form">
          <h3>Acknowledge Alert</h3>
          <p className="form-instructions">
            Please confirm if oxygen was administered during this alert. If not, simply click "Submit".
          </p>
          
          <div className="form-group">
            <label className="checkbox-label">
              <input 
                type="checkbox" 
                checked={oxygenUsed} 
                onChange={(e) => setOxygenUsed(e.target.checked)} 
              />
              <span>Oxygen was administered during this alert</span>
            </label>
          </div>
          
          {oxygenUsed && (
            <>
              <div className="form-group">
                <label>Highest Flow Rate / Concentration:</label>
                <div className="input-with-unit">
                  <input 
                    type="number" 
                    value={oxygenValue} 
                    onChange={(e) => {
                      // Validate the input to ensure it's a valid number
                      const value = e.target.value;
                      if (value === '' || (!isNaN(parseFloat(value)) && parseFloat(value) >= 0)) {
                        setOxygenValue(value);
                      }
                    }}
                    step="0.1"
                    min="0"
                    required={oxygenUsed}
                    placeholder="Enter value"
                  />
                  <select 
                    value={oxygenUnit} 
                    onChange={(e) => setOxygenUnit(e.target.value)}
                  >
                    <option value="L/min">L/min</option>
                    <option value="%">%</option>
                  </select>
                </div>
              </div>
            </>
          )}
          
          <div className="form-actions">
            <button 
              className="secondary-button" 
              onClick={handleCancelOxygenForm}
              disabled={acknowledgingAlert}
            >
              Cancel
            </button>
            <button 
              className="primary-button" 
              onClick={handleSubmitAcknowledge}
              disabled={acknowledgingAlert || (oxygenUsed && !oxygenValue)}
            >
              {acknowledgingAlert ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <ModalBase isOpen={true} onClose={onClose} title="Alert Event Details">
      <div className="alert-detail-content">
        <div className="alert-info-grid">
            <div className="info-item">
              <span className="label">Start Time:</span>
              <span className="value">{formatDateTime(alert.start_time)}</span>
            </div>
            <div className="info-item">
              <span className="label">End Time:</span>
              <span className="value">{formatDateTime(alert.end_time) || 'Ongoing'}</span>
            </div>
            <div className="info-item">
              <span className="label">Duration:</span>
              <span className="value">{formatDuration(alert.start_time, alert.end_time)}</span>
            </div>
            <div className="info-item">
              <span className="label">Status:</span>
              <span className={`value status ${!alert.end_time ? 'active' : alert.acknowledged ? 'acknowledged' : 'unacknowledged'}`}>
                {!alert.end_time ? 'Active' : alert.acknowledged ? 'Acknowledged' : 'Unacknowledged'}
              </span>
            </div>
            <div className="info-item">
              <span className="label">Alarms Triggered:</span>
              <span className="value">
                {alert.alarm1_triggered ? 'Alarm1 ' : ''}
                {alert.alarm2_triggered ? 'Alarm2 ' : ''}
                {alert.spo2_alarm_triggered ? 'SpO₂ ' : ''}
                {alert.hr_alarm_triggered ? 'BPM ' : ''}
                {!alert.alarm1_triggered && !alert.alarm2_triggered && !alert.spo2_alarm_triggered && !alert.hr_alarm_triggered ? 'None' : ''}
              </span>
            </div>
          </div>

          <div className="metrics-grid">
            <div className="metric-card">
              <div className="metric-header">
                <h3>SpO<sub>2</sub> Range</h3>
                {alert.spo2_alarm_triggered && <div className="alarm-indicator">Alarm Triggered</div>}
              </div>
              <div className="metric-value">
                {alert.spo2_min !== null && alert.spo2_max !== null
                  ? `${alert.spo2_min} - ${alert.spo2_max}%`
                  : 'N/A'}
              </div>
            </div>
            
            <div className="metric-card">
              <div className="metric-header">
                <h3>Heart Rate Range</h3>
                {alert.hr_alarm_triggered ? 
                  <div className="alarm-indicator">Alarm Triggered</div> : 
                  <div className="safe-indicator">Safe</div>
                }
              </div>
              <div className="metric-value">
                {alert.bpm_min !== null && alert.bpm_max !== null
                  ? `${alert.bpm_min} - ${alert.bpm_max} BPM`
                  : 'N/A'}
              </div>
            </div>
          </div>

          {/* Charts - without "Event Data" header */}
          {loading ? (
            <div className="loading">Loading data...</div>
          ) : error ? (
            <div className="error-message">{error}</div>
          ) : !eventData || eventData.length === 0 ? (
            <div className="no-data">No data available for this event</div>
          ) : (
            <div className="charts-grid">
              <div className="chart-container">
                <div className="chart">
                  <SimpleEventChart
                    title="Blood Oxygen"
                    color="#48BB78"
                    unit="SpO₂ (%)"
                    data={spo2ChartData}
                  />
                </div>
              </div>
              
              <div className="chart-container">
                <div className="chart">
                  <SimpleEventChart
                    title="Pulse Rate"
                    color="#F56565"
                    unit="BPM"
                    data={bpmChartData}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          {!alert.acknowledged && (
            <button 
              onClick={handleAcknowledgeClick} 
              className="primary-button acknowledge-button"
            >
              Acknowledge
            </button>
          )}
          <button onClick={onClose} className="secondary-button">Close</button>
        </div>
        
        {/* Render the oxygen form if shown */}
        {showOxygenForm && renderOxygenUsageForm()}
      
    </ModalBase>
  );
};

export default AlertDetailModal;