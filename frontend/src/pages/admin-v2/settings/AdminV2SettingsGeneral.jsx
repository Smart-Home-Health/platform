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
import React, { useState, useEffect } from 'react';
import AdminV2Layout from '../AdminV2Layout';
import { useAdminPatient } from '../../../contexts/AdminPatientContext';
import { getSettings, setSetting, updateSettings } from '../../../services/settings';
import config from '../../../config';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert } from '@/components/ui/alert';
import { Field, FormRow } from '@/components/ui/field';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import '../AdminV2.css';

// Radix Select forbids an empty-string value, so use a sentinel for "no vital".
const NONE = '__none__';

// Section header used inside each settings Card.
const SectionHeader = ({ icon, title, subtitle, saved }) => (
  <CardHeader>
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="text-xl" aria-hidden>{icon}</span>
        <div className="flex flex-col gap-0.5">
          <CardTitle>{title}</CardTitle>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {saved && <span className="text-sm font-medium text-[#3fb950]">Saved!</span>}
    </div>
  </CardHeader>
);

// A labelled group within a settings Card.
const SettingsGroup = ({ title, description, children }) => (
  <div className="flex flex-col gap-4 border-b border-border pb-6 last:border-b-0 last:pb-0">
    <div className="flex flex-col gap-1">
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
    {children}
  </div>
);

/**
 * General Settings page for Admin V2
 * Separates app-wide settings from patient-specific settings
 */
const AdminV2SettingsGeneral = () => {
  const { selectedPatient } = useAdminPatient();

  // App-wide settings
  const [appSettings, setAppSettings] = useState({
    chart_time_range: '5m',
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
        chart_time_range: appSettings.chart_time_range,
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
          <div className="admin-v2-loading">Loading settings...</div>
        </div>
      </AdminV2Layout>
    );
  }

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        <div className="tw space-y-6">
          {error && <Alert variant="destructive">{error}</Alert>}

          {/* Application Settings */}
          <Card>
            <SectionHeader
              icon="⚙️"
              title="Application Settings"
              subtitle="These settings apply to the entire application"
              saved={successApp}
            />
            <CardContent className="flex flex-col gap-6">
              <SettingsGroup title="Dashboard Display">
                <FormRow>
                  <Field
                    label="Chart Time Range"
                    hint="Amount of historical data shown in SpO₂, Heart Rate, and Perfusion charts"
                  >
                    <Select
                      value={appSettings.chart_time_range}
                      onValueChange={(v) => handleAppInputChange('chart_time_range', v)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1m">1 Minute</SelectItem>
                        <SelectItem value="3m">3 Minutes</SelectItem>
                        <SelectItem value="5m">5 Minutes</SelectItem>
                        <SelectItem value="10m">10 Minutes</SelectItem>
                        <SelectItem value="30m">30 Minutes</SelectItem>
                        <SelectItem value="1h">1 Hour</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field label="Day Start Hour" hint="When daily tracking (calories, water) resets">
                    <Select
                      value={String(appSettings.day_start_hour)}
                      onValueChange={(v) => handleAppInputChange('day_start_hour', v)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 24 }, (_, i) => (
                          <SelectItem key={i} value={String(i)}>
                            {i === 0 ? '12:00 AM' : i < 12 ? `${i}:00 AM` : i === 12 ? '12:00 PM' : `${i - 12}:00 PM`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </FormRow>

                <FormRow>
                  <Field
                    label="Inactivity Lock"
                    hint="Where the admin UI returns after 5 minutes of inactivity"
                  >
                    <Select
                      value={appSettings.idle_lock_target}
                      onValueChange={(v) => handleAppInputChange('idle_lock_target', v)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="select-user">Lock to User Select</SelectItem>
                        <SelectItem value="live">Lock to Live Dashboard</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </FormRow>

                <div className="flex flex-col gap-3 sm:flex-row sm:gap-8">
                  <label className="flex cursor-pointer items-center gap-2">
                    <Checkbox
                      checked={appSettings.show_statistics}
                      onCheckedChange={(v) => handleAppInputChange('show_statistics', v === true)}
                    />
                    <span className="text-sm text-foreground">Show Value Statistics (Min/Max/Avg)</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <Checkbox
                      checked={appSettings.perfusion_as_percent}
                      onCheckedChange={(v) => handleAppInputChange('perfusion_as_percent', v === true)}
                    />
                    <span className="text-sm text-foreground">Display Perfusion as Percent (%)</span>
                  </label>
                </div>
              </SettingsGroup>

              <SettingsGroup
                title="Dashboard Sub-Charts"
                description="Choose which vitals to display in the two sub-charts below the main dashboard. Each vital can only be used once."
              >
                <FormRow>
                  {[1, 2].map((n) => {
                    const key = `dashboard_chart_${n}_vital`;
                    return (
                      <Field key={n} label={`Chart ${n} - Vital Type`}>
                        <Select
                          value={appSettings[key] || NONE}
                          onValueChange={(v) => handleAppInputChange(key, v === NONE ? '' : v)}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>Select a vital type...</SelectItem>
                            {getAvailableVitalsForChart(n).map((vital) => (
                              <SelectItem key={vital} value={vital}>
                                {formatVitalDisplayName(vital)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    );
                  })}
                </FormRow>
              </SettingsGroup>
            </CardContent>
            <CardFooter>
              <Button onClick={saveAppSettings} disabled={isSavingApp}>
                {isSavingApp ? 'Saving...' : 'Save Application Settings'}
              </Button>
            </CardFooter>
          </Card>

          {/* Patient Settings */}
          <Card>
            <SectionHeader
              icon="👤"
              title="Patient Settings"
              subtitle={selectedPatient
                ? `Settings for ${selectedPatient.first_name} ${selectedPatient.last_name}`
                : 'Default settings applied to all patients'}
              saved={successPatient}
            />
            <CardContent className="flex flex-col gap-6">
              <SettingsGroup
                title="Vital Sign Alert Thresholds"
                description="Alerts will trigger when readings fall outside these ranges"
              >
                <FormRow cols={4}>
                  <Field label="Min SpO₂ (%)">
                    <Input type="number" min="80" max="100" value={patientSettings.min_spo2}
                      onChange={(e) => handlePatientInputChange('min_spo2', e.target.value)} />
                  </Field>
                  <Field label="Max SpO₂ (%)">
                    <Input type="number" min="80" max="100" value={patientSettings.max_spo2}
                      onChange={(e) => handlePatientInputChange('max_spo2', e.target.value)} />
                  </Field>
                  <Field label="Min Heart Rate (BPM)">
                    <Input type="number" min="30" max="200" value={patientSettings.min_bpm}
                      onChange={(e) => handlePatientInputChange('min_bpm', e.target.value)} />
                  </Field>
                  <Field label="Max Heart Rate (BPM)">
                    <Input type="number" min="30" max="250" value={patientSettings.max_bpm}
                      onChange={(e) => handlePatientInputChange('max_bpm', e.target.value)} />
                  </Field>
                </FormRow>
              </SettingsGroup>

              <SettingsGroup title="Daily Nutrition Targets">
                <FormRow>
                  <Field label="Daily Calories (kcal)" hint="Target daily calorie intake">
                    <Input type="number" min="500" max="5000" step="100" value={patientSettings.daily_calories}
                      onChange={(e) => handlePatientInputChange('daily_calories', e.target.value)} />
                  </Field>
                  <Field label="Daily Water (ml)" hint="Target daily water intake">
                    <Input type="number" min="500" max="5000" step="100" value={patientSettings.daily_water}
                      onChange={(e) => handlePatientInputChange('daily_water', e.target.value)} />
                  </Field>
                </FormRow>
              </SettingsGroup>
            </CardContent>
            <CardFooter>
              <Button onClick={savePatientSettings} disabled={isSavingPatient}>
                {isSavingPatient ? 'Saving...' : 'Save Patient Settings'}
              </Button>
            </CardFooter>
          </Card>

          {/* About */}
          <Card>
            <SectionHeader icon="ℹ️" title="About" subtitle="Smart Home Health Hub" />
            <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
              <p>
                This software is free and open source, licensed under the{' '}
                <strong className="text-foreground">GNU Affero General Public License v3.0</strong>. Under
                AGPL section 13, the complete source code for this application is available to you:
              </p>
              <p>
                <a
                  className="text-ring underline-offset-4 hover:underline"
                  href="https://github.com/Smart-Home-Health/smart-home-health-hub"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  github.com/Smart-Home-Health/smart-home-health-hub
                </a>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2SettingsGeneral;
