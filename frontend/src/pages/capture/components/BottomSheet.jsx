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
// Bottom sheet on Radix Dialog primitives. Local to the capture surface —
// intentionally not in components/ui (single consumer, custom chrome).
// Focus is NOT auto-moved into the sheet: the keypad has no focusable input,
// which also keeps the opt-in VirtualKeyboard (?vkb=1) from popping.
import { useRef } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';

export default function BottomSheet({ open, onOpenChange, title, children, onSwipeDown }) {
  const touchStartY = useRef(null);

  const handleTouchStart = (e) => {
    touchStartY.current = e.touches[0].clientY;
  };
  const handleTouchEnd = (e) => {
    if (touchStartY.current === null) return;
    const delta = e.changedTouches[0].clientY - touchStartY.current;
    touchStartY.current = null;
    if (delta > 60) onSwipeDown?.();
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="vc-sheet-overlay" />
        <DialogPrimitive.Content
          className="vc-sheet"
          // The per-field prompt below the title serves as the description;
          // it's plain content rather than a Radix Description slot.
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
          // Escape/overlay-dismiss route through onOpenChange(false); the
          // parent decides whether a typed value needs a discard confirm.
        >
          <div
            className="vc-grabber"
            aria-hidden="true"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          />
          <DialogPrimitive.Title className="vc-sheet-title">{title}</DialogPrimitive.Title>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
