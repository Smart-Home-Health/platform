import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const ActiveInputContext = createContext({
  activeInput: null,
  setActiveInput: () => {},
  clearActiveInput: () => {},
});

const TYPEABLE_TYPES = new Set([
  'text', 'search', 'email', 'url', 'tel', 'password', 'number', 'date', 'datetime-local', 'time', 'month', 'week',
]);

function isTypeableElement(el) {
  if (!el) return false;
  if (el.dataset && el.dataset.vkbIgnore === 'true') return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA') return !el.disabled && !el.readOnly;
  if (tag === 'INPUT') {
    const type = (el.type || 'text').toLowerCase();
    return TYPEABLE_TYPES.has(type) && !el.disabled && !el.readOnly;
  }
  return false;
}

export function ActiveInputProvider({ children }) {
  const [activeInput, setActiveInputState] = useState(null);
  const blurTimer = useRef(null);

  const setActiveInput = useCallback((el) => {
    if (blurTimer.current) {
      clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
    setActiveInputState(el);
  }, []);

  const clearActiveInput = useCallback(() => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    blurTimer.current = setTimeout(() => {
      setActiveInputState(null);
      blurTimer.current = null;
    }, 150);
  }, []);

  useEffect(() => {
    const onFocusIn = (e) => {
      if (isTypeableElement(e.target)) setActiveInput(e.target);
    };
    const onFocusOut = (e) => {
      if (e.target === activeInput || isTypeableElement(e.target)) clearActiveInput();
    };
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      if (blurTimer.current) clearTimeout(blurTimer.current);
    };
  }, [activeInput, setActiveInput, clearActiveInput]);

  return (
    <ActiveInputContext.Provider value={{ activeInput, setActiveInput, clearActiveInput }}>
      {children}
    </ActiveInputContext.Provider>
  );
}

export function useActiveInput() {
  return useContext(ActiveInputContext);
}
