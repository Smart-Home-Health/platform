import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

export default function VirtualKeyboard({ show }) {
  const { activeInput } = useActiveInput();
  const [layoutName, setLayoutName] = useState('default');
  const [collapsed, setCollapsed] = useState(false);
  const lastInputRef = useRef(activeInput);
  if (activeInput) lastInputRef.current = activeInput;
  const rootRef = useRef(null);

  const numericMode = isNumericTarget(activeInput);

  // When the focused input's mode changes, swap the layout. Use 'numpad'
  // for numeric targets; otherwise reset to the alpha default.
  useEffect(() => {
    setLayoutName(numericMode ? 'numpad' : 'default');
  }, [numericMode]);

  useEffect(() => {
    const root = document.documentElement;
    if (!show) {
      root.style.setProperty('--vkb-height', '0px');
      return;
    }
    const el = rootRef.current;
    if (!el) return;
    const update = () => {
      root.style.setProperty('--vkb-height', `${el.offsetHeight}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.setProperty('--vkb-height', '0px');
    };
  }, [show, collapsed]);

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

  // Globally disabled, or no input is focused → render nothing. This makes
  // the keyboard auto-show on focus and disappear on blur.
  if (!show || !activeInput) return null;

  return (
    <div
      ref={rootRef}
      className={`vkb-root${collapsed ? ' vkb-collapsed' : ''}${numericMode ? ' vkb-numpad' : ''}`}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="vkb-toolbar">
        <button
          type="button"
          className="vkb-toolbar-button"
          onClick={() => setCollapsed((c) => !c)}
          data-vkb-ignore="true"
        >
          {collapsed ? 'Show keyboard' : 'Hide'}
        </button>
      </div>
      {!collapsed && (
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
      )}
    </div>
  );
}
