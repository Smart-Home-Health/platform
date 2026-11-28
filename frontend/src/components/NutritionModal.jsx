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
import { useEffect, useState } from 'react';
import ModalBase from './ModalBase';
import { DailySchedule } from '../pages/admin-v2/AdminV2Schedule';
import { useAuth } from '../contexts/AuthContext';
import { hasSchedulePermission } from './schedule/schedulePermissions';
import { getCurrentLocalDateTime } from '../utils/timezone';
import IntakeSheet from './nutrition/IntakeSheet';
import OutputSheet from './nutrition/OutputSheet';
import IntakeForm from './nutrition/IntakeForm';
import { useModalDock } from '../contexts/ModalDockContext';
import { XIcon } from './Icons';
import PanelViewSwitcher from './section-panel/PanelViewSwitcher';
import './section-panel/section-panel.css';

const NutritionModal = ({ patient: selectedPatient, onClose }) => {
  const { user } = useAuth();
  const canAddRecord = selectedPatient && hasSchedulePermission(user, 'nutrition.create');
  const { docked, expanded, setExpanded } = useModalDock();
  const [prnMode, setPrnMode] = useState(null);
  const [prnDefaultDateTime, setPrnDefaultDateTime] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  // Anchor body-portalled sheets (PRN Output) over the docked panel instead
  // of centering them on the wall-sized screen — same pattern as the capture
  // panel's ld-capture-docked classes.
  useEffect(() => {
    if (!docked) return undefined;
    document.body.classList.add('ld-nutrition-docked');
    document.body.classList.toggle('ld-nutrition-wide', expanded);
    return () => {
      document.body.classList.remove('ld-nutrition-docked', 'ld-nutrition-wide');
    };
  }, [docked, expanded]);

  const openPrn = (mode) => {
    setPrnDefaultDateTime(getCurrentLocalDateTime());
    // Docked, the intake form lives in the side pane — no centered dialog on
    // a wall-sized screen. Output (and everything on mobile) keeps the sheet.
    if (mode === 'intake' && docked) {
      if (!expanded) setExpanded?.(true);
    }
    setPrnMode(mode);
  };

  const closePrn = () => setPrnMode(null);

  const onPrnSaved = () => {
    closePrn();
    setRefreshKey(value => value + 1);
  };

  // ===== Render =====
  return (
    <>
      <ModalBase isOpen={true} onClose={onClose} title={
        <span className="mp-modal-title">
          <span>Nutrition</span>
          <span className="mp-modal-title-sub">
            {selectedPatient
              ? `${selectedPatient.first_name} ${selectedPatient.last_name} \u00b7 Schedule`
              : 'No patient selected'}
          </span>
        </span>
      }>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {!selectedPatient && (
            <div className="ld-dose-empty">No patient selected</div>
          )}

          {/* Two entry points rather than one PRN: intake and output are
              different records, and the extra pick dialog was a tap with
              nothing else in it. */}
          <PanelViewSwitcher
            views={[{ value: 'scheduled', label: 'Scheduled' }]}
            value="scheduled"
            actions={[
              { label: 'Intake', onClick: () => openPrn('intake'), disabled: !canAddRecord,
                title: 'Log an ad-hoc intake' },
              { label: 'Output', onClick: () => openPrn('output'), disabled: !canAddRecord,
                title: 'Log an output' },
            ]}
          />

          <div className="ld-panel-scroll">
            {selectedPatient && (
              <div hidden={prnMode === 'intake' && docked}>
                <DailySchedule patient={selectedPatient} category="nutrition" active={!(prnMode === 'intake' && docked)}
                  refreshKey={refreshKey} />
              </div>
            )}
            {prnMode === 'intake' && docked && (
              <div className="em-inline">
                <div className="ld-dose-detail-head">
                  <h3 className="ld-dose-detail-name">Log intake</h3>
                  <button type="button" className="ld-dose-btn ghost" onClick={closePrn} aria-label="Close intake form">
                    <XIcon size={16} />
                  </button>
                </div>
                <IntakeForm active patient={selectedPatient} defaultDateTime={prnDefaultDateTime}
                  onClose={closePrn} onSaved={onPrnSaved} />
              </div>
            )}
          </div>
        </div>
      </ModalBase>
      {/* Shared AdminV2 intake form — modal only where there is no side
          pane to host it (mobile / undocked). */}
      <IntakeSheet
        open={prnMode === 'intake' && !docked}
        onClose={closePrn}
        onSaved={onPrnSaved}
        patient={selectedPatient}
        defaultDateTime={prnDefaultDateTime}
      />

      {/* Shared AdminV2 output form */}
      <OutputSheet
        open={prnMode === 'output'}
        onClose={closePrn}
        onSaved={onPrnSaved}
        patient={selectedPatient}
        defaultDateTime={prnDefaultDateTime}
      />
    </>
  );
};

export default NutritionModal;
