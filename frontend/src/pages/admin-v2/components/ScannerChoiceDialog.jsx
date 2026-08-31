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
// "How do you want to scan?" — asked before every scan so the camera and a
// paired Bluetooth (keyboard-wedge) scanner coexist. The last-used answer is
// remembered per device and preselected, so continuing is a single tap.
import { useState } from 'react';
import EntityModal from '../../../components/vc/EntityModal';
import { CameraIcon, BarcodeIcon } from '../../../components/Icons';
import './scan-dialogs.css';

export const SCANNER_CHOICE_KEY = 'adminV2ScannerChoice'; // 'camera' | 'external'

const readLastChoice = () => {
  try {
    const v = localStorage.getItem(SCANNER_CHOICE_KEY);
    return v === 'external' ? 'external' : 'camera';
  } catch {
    return 'camera';
  }
};

export default function ScannerChoiceDialog({
  open,
  onClose,
  onChoose,
  title = 'How do you want to scan?',
}) {
  const [last, setLast] = useState(readLastChoice);

  const choose = (mode) => {
    try { localStorage.setItem(SCANNER_CHOICE_KEY, mode); } catch { /* best effort */ }
    setLast(mode);
    onChoose?.(mode);
  };

  if (!open) return null;

  const options = [
    { mode: 'camera', label: 'Use the camera', icon: <CameraIcon size={16} /> },
    { mode: 'external', label: 'Use an external scanner', icon: <BarcodeIcon size={16} /> },
  ];

  return (
    <EntityModal open onOpenChange={(o) => { if (!o) onClose?.(); }} title={title}>
      <div className="em-form">
        {options.map(({ mode, label, icon }) => {
          const preselected = mode === last;
          return (
            <div key={mode} className="scd-choice">
              <button
                type="button"
                className={preselected ? 'em-submit' : 'em-cancel'}
                autoFocus={preselected}
                data-preselected={preselected || undefined}
                onClick={() => choose(mode)}
              >
                {icon} {label}
              </button>
              {preselected && <span className="scd-last">Last used</span>}
            </div>
          );
        })}
        <button type="button" className="em-cancel" onClick={() => onClose?.()}>Cancel</button>
      </div>
    </EntityModal>
  );
}
