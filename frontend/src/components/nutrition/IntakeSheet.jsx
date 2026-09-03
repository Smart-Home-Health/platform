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
// The modal wrapper around the intake logging form. All the behavior lives
// in IntakeForm; this exists for the flows that want a centered sheet (the
// phone pages, the mobile dashboard). The live dashboard's docked panel
// hosts IntakeForm inline in its side pane instead.
import EntityModal from '../vc/EntityModal';
import IntakeForm from './IntakeForm';

export default function IntakeSheet({
  open, onClose, onSaved, patient, editing, defaultDateTime,
  careTaskLogId, careTaskName, prefillFeed,
}) {
  if (!patient) return null;
  return (
    <EntityModal
      open={open}
      onOpenChange={(next) => { if (!next) onClose?.(); }}
      title={editing ? 'Edit intake' : (prefillFeed ? `Complete ${prefillFeed.name}` : 'Log intake')}
    >
      <IntakeForm
        active={open}
        onClose={onClose}
        onSaved={onSaved}
        patient={patient}
        editing={editing}
        defaultDateTime={defaultDateTime}
        careTaskLogId={careTaskLogId}
        careTaskName={careTaskName}
        prefillFeed={prefillFeed}
      />
    </EntityModal>
  );
}
