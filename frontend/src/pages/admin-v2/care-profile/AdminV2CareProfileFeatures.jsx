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
// Care profile → Features. Read-only on purpose: nothing stores a per-profile
// feature switch yet, so this page says so plainly rather than showing toggles
// that do not toggle.
import { useParams } from 'react-router-dom';
import { CheckIcon } from '../../../components/Icons';
import { Card, CardContent } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import CareProfileSection from './CareProfileSection';
import { STATUS_META, featuresSummary } from './careProfileSections';
import useCareProfile from './useCareProfile';

// The areas of the app a profile can appear in. Mirrors the side navigation.
const APP_AREAS = [
  { id: 'medications', label: 'Medications', blurb: 'Doses, schedules, and the undo log.' },
  { id: 'nutrition', label: 'Nutrition', blurb: 'Intake, plans, and daily targets.' },
  { id: 'care_tasks', label: 'Care tasks', blurb: 'Recurring tasks and their schedule.' },
  { id: 'equipment', label: 'Equipment', blurb: 'Devices, supplies, and deliveries.' },
  { id: 'monitoring', label: 'Monitoring', blurb: 'Alerts, timeline, ventilator, environment.' },
  { id: 'symptoms', label: 'Symptoms', blurb: 'Symptom log and active episodes.' },
];

export default function AdminV2CareProfileFeatures() {
  const { patientId } = useParams();
  const { patient, loading, error } = useCareProfile(patientId);
  const firstName = patient?.first_name || 'this profile';

  return (
    <CareProfileSection
      patientId={patientId}
      patient={patient}
      title="Features"
      description={`Which parts of Smart Home Health are used for ${firstName}.`}
      status={STATUS_META[featuresSummary().status]}
      loading={loading}
      error={error}
    >
      <Alert>
        Every area below is available for every care profile today. Turning them on
        and off per profile is not built yet — this page will grow the switches when
        it is.
      </Alert>

      <Card>
        <CardContent className="flex flex-col gap-0 p-0">
          {APP_AREAS.map((area) => (
            <div
              key={area.id}
              className="flex items-start gap-3 border-b border-border p-4 last:border-b-0"
            >
              <span className="mt-0.5 text-success" aria-hidden><CheckIcon size={18} /></span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{area.label}</p>
                <p className="text-sm text-muted-foreground">{area.blurb}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </CareProfileSection>
  );
}
