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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Keyboard from 'react-simple-keyboard';
import 'react-simple-keyboard/build/css/index.css';
import { useActiveInput } from '../../contexts/ActiveInputContext';
import './VirtualKeyboard.css';

const inputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
const textareaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;

function setNativeValue(el, value) {
  const setter = el.tagName === 'TEXTAREA' ? textareaValueSetter : inputValueSetter;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function applyKey(el, key) {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const before = el.value.slice(0, start);
  const after = el.value.slice(end);

  let next = el.value;
  let caret = start;

  if (key === '{bksp}') {
    if (start === end && start > 0) {
      next = before.slice(0, -1) + after;
      caret = start - 1;
    } else {
      next = before + after;
      caret = start;
    }
  } else if (key === '{space}') {
    next = before + ' ' + after;
    caret = start + 1;
  } else if (key === '{tab}') {
    next = before + '\t' + after;
    caret = start + 1;
  } else if (key === '{enter}') {
    if (el.tagName === 'TEXTAREA') {
      next = before + '\n' + after;
      caret = start + 1;
    } else {
      // Submit-like behavior on inputs: just blur to dismiss without forced submit
      el.blur();
      return;
    }
  } else if (/^\{.+\}$/.test(key)) {
    return; // ignore unhandled function keys (shift, lock, etc. handled by layoutName)
  } else {
    next = before + key + after;
    caret = start + key.length;
  }

  setNativeValue(el, next);
  // Restore caret after React commits
  requestAnimationFrame(() => {
    if (typeof el.setSelectionRange === 'function') {
      try { el.setSelectionRange(caret, caret); } catch { /* number inputs etc. */ }
    }
  });
}

// Pick a layout based on the focused element. Anything numeric-flavored
// (input[type=number], or any input/textarea with inputMode=numeric|decimal)
// gets the numpad; everything else gets the alpha layout.
function isNumericTarget(el) {
  if (!el) return false;
  if (el.tagName === 'TEXTAREA') return false;
  const type = (el.type || '').toLowerCase();
  if (type === 'number') return true;
  const mode = (el.inputMode || el.getAttribute?.('inputmode') || '').toLowerCase();
  if (mode === 'numeric' || mode === 'decimal') return true;
  return false;
}

export default function VirtualKeyboard({ show, onShowChange }) {
  const { activeInput, setActiveInput, clearActiveInput } = useActiveInput();
  const [layoutName, setLayoutName] = useState('default');
  const lastInputRef = useRef(activeInput);
  if (activeInput) lastInputRef.current = activeInput;
  const rootRef = useRef(null);

  const numericMode = isNumericTarget(activeInput);

  // When the focused input's mode changes, swap the layout. Use 'numpad'
  // for numeric targets; otherwise reset to the alpha default.
  useEffect(() => {
    setLayoutName(numericMode ? 'numpad' : 'default');
  }, [numericMode]);

  // The keyboard only renders while an input is focused, so the height
  // publisher must key on that too — with [show] alone the root
  // did not exist yet on the first run and --vkb-height stayed 0, leaving
  // the docked panels (and dialogs) underneath the keyboard.
  const visible = show && !!activeInput;
  useEffect(() => {
    const root = document.documentElement;
    if (!visible) {
      root.style.setProperty('--vkb-height', '0px');
      return undefined;
    }
    const el = rootRef.current;
    if (!el) return undefined;
    const update = () => {
      root.style.setProperty('--vkb-height', `${el.offsetHeight}px`);
      // The auth shell's bottom clearance lets an
      // obscured PIN/password move above the keyboard; docked app panels
      // already manage their own keyboard space and scrolling.
      const authShell = activeInput?.closest('.vc-auth');
      if (authShell) {
        const overlap = activeInput.getBoundingClientRect().bottom - el.getBoundingClientRect().top + 16;
        if (overlap > 0) authShell.scrollBy(0, overlap);
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.setProperty('--vkb-height', '0px');
    };
  }, [visible, activeInput]);

  const onKeyPress = useCallback((button) => {
    const target = activeInput || lastInputRef.current;
    if (!target) return;

    if (button === '{shift}' || button === '{lock}') {
      // Shift only toggles within the alpha layout.
      setLayoutName((l) => (l === 'default' ? 'shift' : l === 'shift' ? 'default' : l));
      return;
    }

    // <input type="number"> silently rejects partial values like "12." and
    // clears the field. When the user types '.' (or '-') on a number input,
    // promote it to text+inputMode so the partial value sticks. The form's
    // submit handler reads .value as a string and parses it anyway, so the
    // controlled component keeps working.
    if (target.tagName === 'INPUT' && (target.type || '').toLowerCase() === 'number'
        && (button === '.' || button === '-')) {
      try {
        target.type = 'text';
        target.setAttribute('inputmode', 'decimal');
      } catch { /* some browsers/elements may refuse */ }
    }

    applyKey(target, button);

    if (layoutName === 'shift' && !/^\{.+\}$/.test(button)) {
      setLayoutName('default');
    }
  }, [activeInput, layoutName]);

  const layout = useMemo(() => ({
    default: [
      '1 2 3 4 5 6 7 8 9 0 {bksp}',
      'q w e r t y u i o p',
      'a s d f g h j k l',
      '{shift} z x c v b n m , . {shift}',
      '@ {space} - _ {enter}',
    ],
    shift: [
      '! @ # $ % ^ & * ( ) {bksp}',
      'Q W E R T Y U I O P',
      'A S D F G H J K L',
      '{shift} Z X C V B N M ; : {shift}',
      '@ {space} - _ {enter}',
    ],
    numpad: [
      '1 2 3 {bksp}',
      '4 5 6 {enter}',
      '7 8 9 -',
      '. 0',
    ],
  }), []);

  const display = useMemo(() => ({
    '{bksp}': '⌫',
    '{enter}': '⏎',
    '{shift}': '⇧',
    '{space}': 'space',
    '{tab}': '⇥',
  }), []);

  // Offer the control wherever text can be entered, including login and
  // dialogs, without changing the URL (which HA ingress does not expose).
  if (!activeInput) return null;

  return (
    <div
      ref={rootRef}
      className={`vkb-root${show ? (numericMode ? ' vkb-numpad' : '') : ' vkb-launcher'}`}
      onPointerDown={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
      // Tab navigation into the control should retain the input it edits.
      // Pointer presses retain input focus; keyboard focus cancels its blur.
      onFocus={() => setActiveInput(activeInput)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget) && e.relatedTarget !== activeInput) clearActiveInput();
      }}
    >
      <div className="vkb-toolbar">
        <button
          type="button"
          className="vkb-toolbar-button"
          onClick={() => onShowChange(!show)}
          aria-expanded={show}
          aria-controls={show ? 'vkb-keys' : undefined}
          data-vkb-ignore="true"
        >
          {show ? 'Hide keyboard' : 'Show keyboard'}
        </button>
      </div>
      {show && (
        <div id="vkb-keys">
          <Keyboard
            layoutName={layoutName}
            layout={layout}
            display={display}
            onKeyPress={onKeyPress}
            preventMouseDownDefault
            stopMouseDownPropagation
            physicalKeyboardHighlight={false}
            useButtonTag
          />
        </div>
      )}
    </div>
  );
}
