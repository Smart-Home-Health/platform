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
import EntityModal from '../../../../components/vc/EntityModal';
import { CfgBadge } from '../../settings/CfgSection';
import { MQTT_SECTIONS } from '../../mqttConstants';
import '../care-profile.css';

const labelOf = (id) => MQTT_SECTIONS.find((s) => s.id === id)?.label || id;

export default function EntitiesDialog({ entities, patientName, open, onOpenChange }) {
  const bySection = (entities || []).reduce((acc, entity) => {
    (acc[entity.section] = acc[entity.section] || []).push(entity);
    return acc;
  }, {});

  return (
    <EntityModal open={open} onOpenChange={onOpenChange} title="Published entities">
      <div className="em-form">
        <p className="em-hint">
          {entities?.length
            ? `Home Assistant sees ${entities.length} ${entities.length === 1 ? 'entity' : 'entities'} for this profile.`
            : 'Nothing is published for this profile yet.'}
        </p>

        <div className="cp-scroll">
          {Object.entries(bySection).map(([section, rows]) => (
            <div key={section} className="cp-bounds">
              <h4 className="cp-eyebrow">{labelOf(section)}</h4>
              <div className="cp-rows boxed">
                {rows.map((entity) => (
                  <div key={entity.key} className="cp-list-row">
                    <span className="cp-list-main">
                      <span className="cp-row-title cp-row-title-plain">
                        {patientName ? `${patientName} ${entity.name}` : entity.name}
                      </span>
                      <span className="cp-list-mono">{entity.key}</span>
                    </span>
                    <CfgBadge>
                      {entity.type === 'binary_sensor' ? 'Binary sensor' : 'Sensor'}
                    </CfgBadge>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </EntityModal>
  );
}
