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
import React from 'react';
import {
  MinimalistVentIcon,
  MinimalistPulseOxIcon,
  HistoryIcon,
  MedicationIcon,
  NutritionIcon,
  CareTasksIcon,
  MessagesIcon,
  CameraIcon,
} from '../Icons';

export function buildTopBarActions({
  pulseOxAlerts, medicationDueCount, nutritionDueCount, careTaskDueCount, equipmentDueCount,
  hasCamera, modalOpen, handlers,
}) {
  return [
    { key: 'alerts', label: 'Alerts', icon: <MinimalistPulseOxIcon />, onClick: handlers.alerts, active: modalOpen.alerts, badge: pulseOxAlerts },
    { key: 'medications', label: 'Medications', icon: <MedicationIcon />, onClick: handlers.medications, active: modalOpen.medications, badge: medicationDueCount },
    { key: 'nutrition', label: 'Nutrition', icon: <NutritionIcon />, onClick: handlers.nutrition, active: modalOpen.nutrition, badge: nutritionDueCount },
    { key: 'careTasks', label: 'Care Tasks', icon: <CareTasksIcon />, onClick: handlers.careTasks, active: modalOpen.careTasks, badge: careTaskDueCount },
    { key: 'equipment', label: 'Equipment', icon: <MinimalistVentIcon />, onClick: handlers.equipment, active: modalOpen.equipment, badge: equipmentDueCount },
    { key: 'history', label: 'History', icon: <HistoryIcon />, onClick: handlers.history, active: modalOpen.history, badge: 0 },
    hasCamera
      ? { key: 'camera', label: 'Live Camera', icon: <CameraIcon />, onClick: handlers.camera, active: modalOpen.camera, badge: 0 }
      : { key: 'messages', label: 'Messages', icon: <MessagesIcon />, onClick: handlers.messages, active: modalOpen.messages, badge: 0 },
  ];
}

