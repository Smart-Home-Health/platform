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
// Intake and output history, opened from the Overview rather than living in
// the nav. They are records to look back through, not places to start from —
// logging happens on the Overview, so there is no Add action here.
//
// Owns its own date range and fetch: the range only matters while the history
// is open, and the page it opens from is showing a single day.
import { useCallback, useEffect, useState } from 'react';
import EntityModal from '../../../components/vc/EntityModal';
import NutritionIntakeTab from './NutritionIntakeTab';
import NutritionOutputTab from './NutritionOutputTab';
import config from '../../../config';

const DEFAULT_DAYS = 7;

const isoDay = (date) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const defaultRange = () => {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - (DEFAULT_DAYS - 1));
  return { start: isoDay(start), end: isoDay(end) };
};

export default function NutritionHistoryModal({
  open,
  kind,                 // 'intake' | 'output'
  onOpenChange,
  patient,
  canUpdate,
  canDelete,
  onEditIntake,
  onEditOutput,
  onDeleteIntake,
  onDeleteOutputEvent,
  formatDateTime,
  refreshKey,           // bump to refetch after an edit
}) {
  const [range, setRange] = useState(defaultRange);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) setRange(defaultRange());
  }, [open, kind]);

  const fetchRows = useCallback(async () => {
    if (!open || !patient) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (range.start) params.set('start_date', new Date(`${range.start}T00:00:00`).toISOString());
      if (range.end) params.set('end_date', new Date(`${range.end}T23:59:59`).toISOString());
      const path = kind === 'intake'
        ? `/api/patients/${patient.id}/nutrition-intake`
        : `/api/nutrition/outputs/patient/${patient.id}`;
      const res = await fetch(`${config.apiUrl}${path}?${params}`, { credentials: 'include' });
      if (res.ok) setRows(await res.json());
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [open, patient, kind, range.start, range.end]);

  useEffect(() => { fetchRows(); }, [fetchRows, refreshKey]);

  const dateRange = {
    start: range.start,
    end: range.end,
    onStartChange: (start) => setRange((r) => ({ ...r, start })),
    onEndChange: (end) => setRange((r) => ({ ...r, end })),
    onClear: () => setRange({ start: '', end: '' }),
  };

  return (
    <EntityModal
      open={open}
      onOpenChange={onOpenChange}
      wide
      title={kind === 'intake' ? 'Intake history' : 'Output history'}
    >
      <div className="em-form nhist">
        {kind === 'intake' ? (
          <NutritionIntakeTab
            intakes={rows}
            loading={loading}
            // Logging lives on the Overview; this view is for looking back.
            canCreate={false}
            canUpdate={canUpdate}
            canDelete={canDelete}
            onEdit={onEditIntake}
            onDelete={onDeleteIntake}
            formatDateTime={formatDateTime}
            dateRange={dateRange}
          />
        ) : (
          <NutritionOutputTab
            outputs={rows}
            loading={loading}
            canCreate={false}
            canUpdate={canUpdate}
            canDelete={canDelete}
            onEdit={onEditOutput}
            onDeleteEvent={onDeleteOutputEvent}
            formatDateTime={formatDateTime}
            dateRange={dateRange}
          />
        )}

        <div className="em-footer">
          <button type="button" className="em-cancel" onClick={() => onOpenChange(false)}>
            Close
          </button>
        </div>
      </div>
    </EntityModal>
  );
}
