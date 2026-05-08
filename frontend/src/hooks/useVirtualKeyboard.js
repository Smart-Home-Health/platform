import { useEffect, useState } from 'react';

const STORAGE_KEY = 'vkb';

function readFlag() {
  return typeof window !== 'undefined' && window.localStorage.getItem(STORAGE_KEY) === '1';
}

export function useVirtualKeyboard() {
  const [showVKB, setShowVKB] = useState(readFlag);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const vkbParam = params.get('vkb');

    if (vkbParam === '1') {
      window.localStorage.setItem(STORAGE_KEY, '1');
      setShowVKB(true);
    } else if (vkbParam === '0') {
      window.localStorage.removeItem(STORAGE_KEY);
      setShowVKB(false);
    }

    const onStorage = (e) => {
      if (e.key === STORAGE_KEY) setShowVKB(readFlag());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return { showVKB };
}
