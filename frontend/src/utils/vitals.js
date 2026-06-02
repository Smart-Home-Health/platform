// Shared display-name helpers for vital types.
//
// vital_type slugs come from the DB as snake_case identifiers; the UI needs
// nicely capitalized labels everywhere it shows them. Centralizing this here
// keeps Dashboard, HistoryModal, RecordVitalsForm, and any future consumer
// rendering the same string for the same vital.

export const KNOWN_VITAL_LABELS = {
  blood_pressure: 'Blood Pressure',
  spo2: 'SpO₂',
  heart_rate: 'Heart Rate',
  respiratory_rate: 'Respiratory Rate',
  perfusion_index: 'Perfusion Index',
  body_temp: 'Body Temperature',
  skin_temp: 'Skin Temperature',
  temperature: 'Temperature',
  bathroom: 'Bathroom',
  weight: 'Weight',
  calories: 'Calories',
  water: 'Water Intake',
  nutrition: 'Nutrition',
  blood_glucose: 'Blood Glucose',
};

export function formatVitalDisplayName(slug) {
  if (!slug) return '';
  if (KNOWN_VITAL_LABELS[slug]) return KNOWN_VITAL_LABELS[slug];
  return slug
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
