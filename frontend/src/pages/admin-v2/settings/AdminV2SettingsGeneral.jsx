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
import { useState, useEffect } from 'react';
import AdminV2Layout from '../AdminV2Layout';
import { useAdminPatient } from '../../../contexts/AdminPatientContext';
import { getSettings, setSetting, updateSettings } from '../../../services/settings';
import config from '../../../config';
import { ConfigIcon, PatientsIcon, InfoIcon } from '../../../components/Icons';
import { EmField, EmSelect } from '../../../components/vc/EntityModal';
import { CfgSection, CfgGroup, CfgFields } from './CfgSection';
import '../../../components/vc/entity-card.css';
import '../AdminV2.css';
import './settings-page.css';

// The native select needs a sentinel rather than an empty value so "no vital"
// is a real option rather than a blank first row.
const NONE = '__none__';

/**
 * General Settings page for Admin V2
 * Separates app-wide settings from patient-specific settings
 */
const AdminV2SettingsGeneral = () => {
  const { selectedPatient } = useAdminPatient();

  // App-wide settings
  const [appSettings, setAppSettings] = useState({
    show_statistics: true,
    perfusion_as_percent: false,
    dashboard_chart_1_vital: '',
    dashboard_chart_2_vital: '',
    day_start_hour: 7,
    idle_lock_target: 'select-user',
  });

  // Patient-specific settings (thresholds)
  const [patientSettings, setPatientSettings] = useState({
    min_spo2: 90,
    max_spo2: 100,
    min_bpm: 55,
    max_bpm: 155,
    daily_calories: 2000,
    daily_water: 2000,
  });

  const [availableVitals, setAvailableVitals] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingApp, setIsSavingApp] = useState(false);
  const [isSavingPatient, setIsSavingPatient] = useState(false);
  const [error, setError] = useState(null);
  const [successApp, setSuccessApp] = useState(false);
  const [successPatient, setSuccessPatient] = useState(false);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch helper is recreated each render; effect runs once on mount
  }, []);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Load settings and available vitals in parallel
      const [settingsResponse, vitalsResponse, nutritionCheckResponse] = await Promise.all([
        getSettings(),
        fetch(`${config.apiUrl}/api/vitals/types`, { credentials: 'include' }),
        fetch(`${config.apiUrl}/api/nutrition/has-data`, { credentials: 'include' })
      ]);

      // Process vitals response
      let vitalsData = [];
      if (vitalsResponse.ok) {
        vitalsData = await vitalsResponse.json();
      }

      // Add default vital types that are always available
      const defaultVitals = ['blood_pressure', 'temperature'];
      const allVitals = [...new Set([...defaultVitals, ...vitalsData])];

      // Add nutrition if there's data
      if (nutritionCheckResponse.ok) {
        const nutritionCheck = await nutritionCheckResponse.json();
        if (nutritionCheck.has_data) {
          allVitals.push('nutrition');
        }
      }

      setAvailableVitals(allVitals);

      // Parse settings into app-wide and patient-specific
      const newAppSettings = { ...appSettings };
      const newPatientSettings = { ...patientSettings };

      for (const [key, value] of Object.entries(settingsResponse)) {
        let processedValue = value;

        // Convert string boolean values to actual booleans
        if (processedValue === "True" || processedValue === "true") {
          processedValue = true;
        } else if (processedValue === "False" || processedValue === "false") {
          processedValue = false;
        }

        // App-wide settings
        if (key in newAppSettings) {
          newAppSettings[key] = processedValue;
        }

        // Patient-specific settings
        if (key in newPatientSettings) {
          newPatientSettings[key] = processedValue;
        }
      }

      setAppSettings(newAppSettings);
      setPatientSettings(newPatientSettings);

    } catch (err) {
      console.error("Error loading settings:", err);
      setError("Failed to load settings. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAppInputChange = (key, value) => {
    setAppSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handlePatientInputChange = (key, value) => {
    setPatientSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Helper function to get available options for each chart dropdown
  const getAvailableVitalsForChart = (chartNumber) => {
    const otherChartKey = chartNumber === 1 ? 'dashboard_chart_2_vital' : 'dashboard_chart_1_vital';
    const otherChartValue = appSettings[otherChartKey];

    return availableVitals.filter(vital => vital !== otherChartValue || vital === '');
  };

  // Helper function to format vital display names
  const formatVitalDisplayName = (vital) => {
    const displayNames = {
      'blood_pressure': 'Blood Pressure',
      'temperature': 'Temperature',
      'bathroom': 'Bathroom',
      'weight': 'Weight',
      'calories': 'Calories',
      'water': 'Water Intake',
      'nutrition': 'Nutrition (Calories & Water)'
    };

    return displayNames[vital] || vital.charAt(0).toUpperCase() + vital.slice(1);
  };

  const saveAppSettings = async () => {
    setError(null);
    setSuccessApp(false);
    setIsSavingApp(true);

    try {
      const settingsToUpdate = {
        show_statistics: appSettings.show_statistics,
        perfusion_as_percent: appSettings.perfusion_as_percent,
        dashboard_chart_1_vital: appSettings.dashboard_chart_1_vital,
        dashboard_chart_2_vital: appSettings.dashboard_chart_2_vital,
        day_start_hour: parseInt(appSettings.day_start_hour),
        idle_lock_target: appSettings.idle_lock_target,
      };

      await updateSettings(settingsToUpdate);

      setSuccessApp(true);
      setTimeout(() => setSuccessApp(false), 3000);
    } catch (err) {
      console.error("Error saving app settings:", err);
      setError("Failed to save app settings. Please try again.");
    } finally {
      setIsSavingApp(false);
    }
  };

  const savePatientSettings = async () => {
    setError(null);
    setSuccessPatient(false);
    setIsSavingPatient(true);

    try {
      // Save each setting individually with proper data type
      const savePromises = [
        setSetting('min_spo2', parseInt(patientSettings.min_spo2), 'int', 'Minimum SpO2 threshold'),
        setSetting('max_spo2', parseInt(patientSettings.max_spo2), 'int', 'Maximum SpO2 threshold'),
        setSetting('min_bpm', parseInt(patientSettings.min_bpm), 'int', 'Minimum heart rate threshold'),
        setSetting('max_bpm', parseInt(patientSettings.max_bpm), 'int', 'Maximum heart rate threshold'),
        setSetting('daily_calories', parseInt(patientSettings.daily_calories), 'int', 'Daily calorie target in kcal'),
        setSetting('daily_water', parseInt(patientSettings.daily_water), 'int', 'Daily water target in ml'),
        setSetting('target_calories', parseInt(patientSettings.daily_calories), 'int', 'Daily calorie target in kcal (alias)'),
        setSetting('target_water', parseInt(patientSettings.daily_water), 'int', 'Daily water target in ml (alias)'),
      ];

      await Promise.all(savePromises);

      setSuccessPatient(true);
      setTimeout(() => setSuccessPatient(false), 3000);
    } catch (err) {
      console.error("Error saving patient settings:", err);
      setError("Failed to save patient settings. Please try again.");
    } finally {
      setIsSavingPatient(false);
    }
  };

  if (isLoading) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-page">
          <p className="cfg-loading">Loading settings...</p>
        </div>
      </AdminV2Layout>
    );
  }

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        <div className="cfg">
          {error && <p className="em-error" role="alert">{error}</p>}

          <CfgSection
            icon={<ConfigIcon size={16} />}
            title="Application Settings"
            subtitle="These settings apply to the entire application"
            saved={successApp}
            actions={
              <button type="button" className="em-submit" onClick={saveAppSettings} disabled={isSavingApp}>
                {isSavingApp ? 'Saving...' : 'Save Application Settings'}
              </button>
            }
          >
            <CfgGroup title="Dashboard Display">
              <CfgFields narrow>
                <EmField
                  label="Day Start Hour"
                  htmlFor="cfg-day-start"
                  hint="When daily tracking (calories, water) resets"
                >
                  <EmSelect
                    id="cfg-day-start"
                    value={String(appSettings.day_start_hour)}
                    onChange={(e) => handleAppInputChange('day_start_hour', e.target.value)}
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={String(i)}>
                        {i === 0 ? '12:00 AM' : i < 12 ? `${i}:00 AM` : i === 12 ? '12:00 PM' : `${i - 12}:00 PM`}
                      </option>
                    ))}
                  </EmSelect>
                </EmField>

                <EmField
                  label="Inactivity Lock"
                  htmlFor="cfg-idle-lock"
                  hint="Where the admin UI returns after 5 minutes of inactivity"
                >
                  <EmSelect
                    id="cfg-idle-lock"
                    value={appSettings.idle_lock_target}
                    onChange={(e) => handleAppInputChange('idle_lock_target', e.target.value)}
                  >
                    <option value="select-user">Lock to User Select</option>
                    <option value="live">Lock to Live Dashboard</option>
                  </EmSelect>
                </EmField>
              </CfgFields>

              <div className="cfg-checks">
                <label className="em-check-row">
                  <input
                    type="checkbox"
                    className="em-check"
                    checked={appSettings.show_statistics}
                    onChange={(e) => handleAppInputChange('show_statistics', e.target.checked)}
                  />
                  <span className="em-check-label">Show Value Statistics (Min/Max/Avg)</span>
                </label>
                <label className="em-check-row">
                  <input
                    type="checkbox"
                    className="em-check"
                    checked={appSettings.perfusion_as_percent}
                    onChange={(e) => handleAppInputChange('perfusion_as_percent', e.target.checked)}
                  />
                  <span className="em-check-label">Display Perfusion as Percent (%)</span>
                </label>
              </div>
            </CfgGroup>

            <CfgGroup
              title="Dashboard Sub-Charts"
              hint="Choose which vitals to display in the two sub-charts below the main dashboard. Each vital can only be used once."
            >
              <CfgFields narrow>
                {[1, 2].map((n) => {
                  const key = `dashboard_chart_${n}_vital`;
                  return (
                    <EmField key={n} label={`Chart ${n} - Vital Type`} htmlFor={`cfg-chart-${n}`}>
                      <EmSelect
                        id={`cfg-chart-${n}`}
                        value={appSettings[key] || NONE}
                        onChange={(e) => handleAppInputChange(key, e.target.value === NONE ? '' : e.target.value)}
                      >
                        <option value={NONE}>Select a vital type...</option>
                        {getAvailableVitalsForChart(n).map((vital) => (
                          <option key={vital} value={vital}>{formatVitalDisplayName(vital)}</option>
                        ))}
                      </EmSelect>
                    </EmField>
                  );
                })}
              </CfgFields>
            </CfgGroup>
          </CfgSection>

          <CfgSection
            icon={<PatientsIcon size={16} />}
            title="Patient Settings"
            subtitle={selectedPatient
              ? `Settings for ${selectedPatient.first_name} ${selectedPatient.last_name}`
              : 'Default settings applied to all patients'}
            saved={successPatient}
            actions={
              <button type="button" className="em-submit" onClick={savePatientSettings} disabled={isSavingPatient}>
                {isSavingPatient ? 'Saving...' : 'Save Patient Settings'}
              </button>
            }
          >
            <CfgGroup
              title="Vital Sign Alert Thresholds"
              hint="Alerts will trigger when readings fall outside these ranges"
            >
              <CfgFields>
                <EmField label="Min SpO₂ (%)" htmlFor="cfg-min-spo2">
                  <input id="cfg-min-spo2" className="em-input" type="number" min="80" max="100"
                    value={patientSettings.min_spo2}
                    onChange={(e) => handlePatientInputChange('min_spo2', e.target.value)} />
                </EmField>
                <EmField label="Max SpO₂ (%)" htmlFor="cfg-max-spo2">
                  <input id="cfg-max-spo2" className="em-input" type="number" min="80" max="100"
                    value={patientSettings.max_spo2}
                    onChange={(e) => handlePatientInputChange('max_spo2', e.target.value)} />
                </EmField>
                <EmField label="Min Heart Rate (BPM)" htmlFor="cfg-min-bpm">
                  <input id="cfg-min-bpm" className="em-input" type="number" min="30" max="200"
                    value={patientSettings.min_bpm}
                    onChange={(e) => handlePatientInputChange('min_bpm', e.target.value)} />
                </EmField>
                <EmField label="Max Heart Rate (BPM)" htmlFor="cfg-max-bpm">
                  <input id="cfg-max-bpm" className="em-input" type="number" min="30" max="250"
                    value={patientSettings.max_bpm}
                    onChange={(e) => handlePatientInputChange('max_bpm', e.target.value)} />
                </EmField>
              </CfgFields>
            </CfgGroup>

            <CfgGroup title="Daily Nutrition Targets">
              <CfgFields narrow>
                <EmField label="Daily Calories (kcal)" htmlFor="cfg-daily-cal" hint="Target daily calorie intake">
                  <input id="cfg-daily-cal" className="em-input" type="number" min="500" max="5000" step="100"
                    value={patientSettings.daily_calories}
                    onChange={(e) => handlePatientInputChange('daily_calories', e.target.value)} />
                </EmField>
                <EmField label="Daily Water (ml)" htmlFor="cfg-daily-water" hint="Target daily water intake">
                  <input id="cfg-daily-water" className="em-input" type="number" min="500" max="5000" step="100"
                    value={patientSettings.daily_water}
                    onChange={(e) => handlePatientInputChange('daily_water', e.target.value)} />
                </EmField>
              </CfgFields>
            </CfgGroup>
          </CfgSection>

          <CfgSection icon={<InfoIcon size={16} />} title="About" subtitle="Smart Home Health">
            <CfgGroup>
              <div className="cfg-prose">
                <p>
                  This software is free and open source, licensed under the{' '}
                  <strong>GNU Affero General Public License v3.0</strong>. Under AGPL section 13,
                  the complete source code for this application is available to you:
                </p>
                <p>
                  <a
                    className="cfg-link"
                    href="https://github.com/Smart-Home-Health/smart-home-health-hub"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    github.com/Smart-Home-Health/smart-home-health-hub
                  </a>
                </p>
              </div>
            </CfgGroup>
          </CfgSection>
        </div>
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2SettingsGeneral;
