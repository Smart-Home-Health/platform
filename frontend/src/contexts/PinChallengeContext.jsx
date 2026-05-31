import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import PinChallengeModal from '../components/auth/PinChallengeModal';
import { useAuth } from './AuthContext';

/**
 * Idle-aware user-identity freshness for the live dashboard.
 *
 * The 24-hour account unlock is unchanged. On top of it, every time a
 * caregiver opens a modal on the live dashboard we need to confirm who is
 * actually at the device, so audit-logged actions get attributed correctly.
 *
 * Behavior:
 *   - `markPinVerified()` opens (or extends) a 5-minute freshness window.
 *   - While fresh, every touch / mouse / key event on `document` rolls the
 *     window forward another 5 minutes. Idle for 5 minutes → window expires.
 *   - `requirePinAuth()` resolves true immediately when fresh; otherwise
 *     opens the PIN challenge modal (full user picker → PIN) and resolves
 *     true on success, false on cancel.
 */

const FRESH_WINDOW_MS = 5 * 60 * 1000;

const PinChallengeContext = createContext({
  pinFresh: false,
  pinChallengeOpen: false,
  markPinVerified: () => {},
  requirePinAuth: async () => false,
});

export function PinChallengeProvider({ children }) {
  const { user } = useAuth();

  // Use a ref for the deadline so the activity listener doesn't trigger
  // re-renders. The derived boolean lives in state for consumers that care.
  const freshUntilRef = useRef(0);
  const [pinFresh, setPinFresh] = useState(false);

  // Modal state and the pending promise resolver. requirePinAuth() returns
  // a promise that resolves when the modal closes (success or cancel).
  const [challengeOpen, setChallengeOpen] = useState(false);
  const pendingResolverRef = useRef(null);

  const setFreshUntil = useCallback((until) => {
    freshUntilRef.current = until;
    setPinFresh(until > Date.now());
  }, []);

  const markPinVerified = useCallback(() => {
    setFreshUntil(Date.now() + FRESH_WINDOW_MS);
  }, [setFreshUntil]);

  // Auto-bump freshness whenever the active user changes (login, PIN flow on
  // /select-user, or our own challenge modal). This covers paths that don't
  // call markPinVerified() directly.
  useEffect(() => {
    if (user?.id) markPinVerified();
  }, [user?.id, markPinVerified]);

  // Bump the deadline on any user activity, but only while currently fresh
  // — we don't want background touches to silently re-arm after expiry.
  useEffect(() => {
    const onActivity = () => {
      if (freshUntilRef.current > Date.now()) {
        freshUntilRef.current = Date.now() + FRESH_WINDOW_MS;
        // No setState here — pinFresh is already true; avoid churn.
      }
    };
    document.addEventListener('mousedown', onActivity, { passive: true });
    document.addEventListener('touchstart', onActivity, { passive: true });
    document.addEventListener('keydown', onActivity);
    return () => {
      document.removeEventListener('mousedown', onActivity);
      document.removeEventListener('touchstart', onActivity);
      document.removeEventListener('keydown', onActivity);
    };
  }, []);

  // Tick once a minute to flip pinFresh false when the window quietly
  // expires (no activity events to trigger a recompute otherwise).
  useEffect(() => {
    const id = setInterval(() => {
      const stillFresh = freshUntilRef.current > Date.now();
      setPinFresh((prev) => (prev !== stillFresh ? stillFresh : prev));
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  const requirePinAuth = useCallback(() => {
    if (freshUntilRef.current > Date.now()) return Promise.resolve(true);
    return new Promise((resolve) => {
      pendingResolverRef.current = resolve;
      setChallengeOpen(true);
    });
  }, []);

  const handleChallengeSuccess = useCallback(() => {
    markPinVerified();
    setChallengeOpen(false);
    const resolver = pendingResolverRef.current;
    pendingResolverRef.current = null;
    if (resolver) resolver(true);
  }, [markPinVerified]);

  const handleChallengeCancel = useCallback(() => {
    setChallengeOpen(false);
    const resolver = pendingResolverRef.current;
    pendingResolverRef.current = null;
    if (resolver) resolver(false);
  }, []);

  return (
    <PinChallengeContext.Provider value={{ pinFresh, pinChallengeOpen: challengeOpen, markPinVerified, requirePinAuth }}>
      {children}
      <PinChallengeModal
        open={challengeOpen}
        onSuccess={handleChallengeSuccess}
        onCancel={handleChallengeCancel}
      />
    </PinChallengeContext.Provider>
  );
}

export function usePinChallenge() {
  return useContext(PinChallengeContext);
}
