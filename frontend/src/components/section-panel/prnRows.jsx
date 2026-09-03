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
// Section records -> PrnPicker rows. Medications describe strength and stock;
// care tasks describe a category. Keeping the mapping here means the picker
// itself never learns either shape.
import { DropletIcon, PillIcon, TabletPillIcon, CareTasksIcon } from '../Icons';
import { isLowStock } from './lowStock';

// A rough read of the form from the unit, only to give each row a recognisable
// silhouette — it is never the only thing distinguishing two medications.
function formIcon(med) {
  const unit = (med.quantity_unit || '').toLowerCase();
  if (unit.includes('ml') || unit.includes('unit') || unit.includes('spray')) return DropletIcon;
  if (unit.includes('capsule')) return PillIcon;
  return TabletPillIcon;
}

const onHandLabel = (med) => {
  const qty = med.quantity ?? 0;
  const unit = med.quantity_unit || '';
  return `${qty}${unit ? ` ${unit}` : ''} on hand`;
};

export function medicationRows(medications = []) {
  return medications.map((med) => ({
    id: med.id,
    name: med.name,
    meta: med.concentration || null,
    note: onHandLabel(med),
    tone: isLowStock(med) ? 'low' : null,
    icon: formIcon(med),
    record: med,
  }));
}

export function careTaskRows(tasks = []) {
  return tasks.map((task) => ({
    id: task.id,
    name: task.name,
    meta: task.category_name || null,
    // Care tasks have no stock to report, so the second line carries whatever
    // the task itself says rather than an invented metric.
    note: task.description || null,
    icon: CareTasksIcon,
    record: task,
  }));
}
