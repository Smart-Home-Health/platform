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
import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CameraIcon, BarcodeIcon } from '../../../components/Icons';

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
    <Dialog open onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent className="sm:max-w-[440px]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {options.map(({ mode, label, icon }) => {
            const preselected = mode === last;
            return (
              <div key={mode} className="flex flex-col gap-1">
                <Button
                  size="lg"
                  variant={preselected ? 'default' : 'secondary'}
                  autoFocus={preselected}
                  data-preselected={preselected || undefined}
                  onClick={() => choose(mode)}
                >
                  {icon} {label}
                </Button>
                {preselected && (
                  <span className="text-center text-xs text-muted-foreground">Last used</span>
                )}
              </div>
            );
          })}
          <Button variant="ghost" onClick={() => onClose?.()}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
