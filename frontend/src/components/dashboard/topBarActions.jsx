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
import {
  MinimalistVentIcon,
  MinimalistPulseOxIcon,
  HistoryIcon,
  MedicationIcon,
  NutritionIcon,
  CareTasksIcon,
  MessagesIcon,
  CameraIcon,
  VitalsCaptureIcon,
} from '../Icons';

/* Nav groups, mirroring the admin sidebar's shape. The drawer renders from
 * this same list as the top bar, so the two can never drift — the capture
 * action had to be added in two places before this. */
export const NAV_GROUPS = [
  { key: 'record', label: 'Record' },
  { key: 'care', label: 'Care' },
  { key: 'monitoring', label: 'Monitoring' },
];

export function buildTopBarActions({
  pulseOxAlerts, medicationDueCount, nutritionDueCount, careTaskDueCount, equipmentDueCount,
  hasCamera, modalOpen, handlers,
}) {
  return [
    { key: 'alerts', group: 'monitoring', label: 'Alerts', icon: <MinimalistPulseOxIcon />, onClick: handlers.alerts, active: modalOpen.alerts, badge: pulseOxAlerts },
    { key: 'medications', group: 'care', label: 'Medications', icon: <MedicationIcon />, onClick: handlers.medications, active: modalOpen.medications, badge: medicationDueCount },
    { key: 'nutrition', group: 'care', label: 'Nutrition', icon: <NutritionIcon />, onClick: handlers.nutrition, active: modalOpen.nutrition, badge: nutritionDueCount },
    { key: 'careTasks', group: 'care', label: 'Care Tasks', icon: <CareTasksIcon />, onClick: handlers.careTasks, active: modalOpen.careTasks, badge: careTaskDueCount },
    { key: 'equipment', group: 'care', label: 'Equipment', icon: <MinimalistVentIcon />, onClick: handlers.equipment, active: modalOpen.equipment, badge: equipmentDueCount },
    // Capture sits next to History: one records a vital set, the other reads
    // the ones already recorded, and History no longer carries its own add
    // button. The drawer is grouped rather than ordered, so Capture still
    // heads its own Record group there.
    { key: 'capture', group: 'record', label: 'Capture Vitals', icon: <VitalsCaptureIcon />, onClick: handlers.capture, active: modalOpen.capture, badge: 0 },
    { key: 'history', group: 'monitoring', label: 'History', icon: <HistoryIcon />, onClick: handlers.history, active: modalOpen.history, badge: 0 },
    hasCamera
      ? { key: 'camera', group: 'monitoring', label: 'Live Camera', icon: <CameraIcon />, onClick: handlers.camera, active: modalOpen.camera, badge: 0 }
      : { key: 'messages', group: 'monitoring', label: 'Messages', icon: <MessagesIcon />, onClick: handlers.messages, active: modalOpen.messages, badge: 0 },
  ];
}

