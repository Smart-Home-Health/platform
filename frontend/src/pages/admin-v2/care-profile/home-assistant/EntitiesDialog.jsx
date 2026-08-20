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
// What this profile actually publishes to Home Assistant, straight from the
// discovery planner — one row per entity, grouped by the section it came from.
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { MQTT_SECTIONS } from '../../mqttConstants';

const labelOf = (id) => MQTT_SECTIONS.find((s) => s.id === id)?.label || id;

export default function EntitiesDialog({ entities, patientName, open, onOpenChange }) {
  const bySection = (entities || []).reduce((acc, entity) => {
    (acc[entity.section] = acc[entity.section] || []).push(entity);
    return acc;
  }, {});

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Published entities</DialogTitle>
          <DialogDescription>
            {entities?.length
              ? `Home Assistant sees ${entities.length} ${entities.length === 1 ? 'entity' : 'entities'} for this profile.`
              : 'Nothing is published for this profile yet.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto">
          {Object.entries(bySection).map(([section, rows]) => (
            <div key={section} className="flex flex-col gap-1">
              <h4 className="cp-eyebrow">{labelOf(section)}</h4>
              <div className="divide-y divide-border/60 rounded-lg border border-border">
                {rows.map((entity) => (
                  <div key={entity.key} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="min-w-0">
                      <span className="block text-sm text-foreground">
                        {patientName ? `${patientName} ${entity.name}` : entity.name}
                      </span>
                      <span className="block font-mono text-xs text-muted-foreground">
                        {entity.key}
                      </span>
                    </span>
                    <Badge variant="muted">
                      {entity.type === 'binary_sensor' ? 'Binary sensor' : 'Sensor'}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
