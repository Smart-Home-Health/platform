import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import ModalBase from '../ModalBase';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Global PIN re-auth challenge. Two steps:
 *   1. User picker — full list of active users on the account.
 *   2. PIN entry (or password if the user hasn't full-auth'd in 24h).
 *
 * Posts to /api/auth/user/select via AuthContext.selectUser, so on success
 * AuthContext is updated with the new user and downstream actions log under
 * that user_id.
 *
 * Portaled to document.body so transform/perspective ancestors (e.g. the
 * flipping DynamicVitalsCard) can't trap its position: fixed overlay.
 */
export default function PinChallengeModal({ open, onSuccess, onCancel }) {
  const { getAccountUsers, selectUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selected, setSelected] = useState(null);   // user object once picked
  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');
  const [requirePassword, setRequirePassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Reload + reset every time the modal opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSelected(null);
    setPin('');
    setPassword('');
    setRequirePassword(false);
    setError(null);
    setLoadingUsers(true);
    (async () => {
      try {
        const list = await getAccountUsers();
        if (!cancelled) setUsers(Array.isArray(list) ? list : []);
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load users');
      } finally {
        if (!cancelled) setLoadingUsers(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, getAccountUsers]);

  const handlePickUser = (u) => {
    setSelected(u);
    setRequirePassword(!!u.requires_full_password || !u.has_pin);
    setPin('');
    setPassword('');
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await selectUser(
        selected.id,
        requirePassword ? null : pin,
        requirePassword ? password : null
      );
      if (result.success) {
        onSuccess();
        return;
      }
      if (result.requiresPassword) {
        setRequirePassword(true);
        setError('Password required (PIN unavailable until full login refreshed)');
      } else {
        setError(result.error || 'Authentication failed');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <ModalBase isOpen={true} onClose={onCancel} title="Verify Caregiver">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, color: '#e6edf3' }}>
        {error && (
          <div role="alert" style={{
            padding: '10px 12px', borderRadius: 6,
            background: 'rgba(220,53,69,0.15)',
            border: '1px solid rgba(220,53,69,0.5)',
            color: '#f8d7da', fontSize: 13,
          }}>{error}</div>
        )}

        {!selected ? (
          <>
            <p style={{ margin: 0, color: '#a0aec0', fontSize: 13 }}>
              Confirm who is at the device. Saves and actions will be logged under
              this user until the next 5-minute idle window.
            </p>
            {loadingUsers ? (
              <div style={{ textAlign: 'center', padding: 24, color: '#a0aec0' }}>Loading…</div>
            ) : users.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 24, color: '#a0aec0' }}>
                No active users available.
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 10,
              }}>
                {users.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => handlePickUser(u)}
                    style={{
                      padding: '14px 16px', borderRadius: 10,
                      border: '1px solid rgba(255,255,255,0.15)',
                      background: '#161b22', color: '#e6edf3',
                      cursor: 'pointer', textAlign: 'left',
                      display: 'flex', flexDirection: 'column', gap: 4,
                      fontSize: 14, fontWeight: 600,
                    }}
                  >
                    <span>{u.full_name || u.username}</span>
                    {u.requires_full_password && (
                      <span style={{ color: '#f0883e', fontSize: 11, fontWeight: 500 }}>
                        Password required
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{
              padding: '8px 12px', borderRadius: 8,
              background: 'rgba(88,166,255,0.08)',
              border: '1px solid rgba(88,166,255,0.3)',
              color: '#58a6ff', fontSize: 13, fontWeight: 600,
            }}>
              {selected.full_name || selected.username}
            </div>

            {requirePassword ? (
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600 }}>
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                  required
                  style={{
                    width: '100%', padding: 12, fontSize: 16,
                    background: '#0d1117', color: '#fff',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 6, boxSizing: 'border-box',
                  }}
                />
              </div>
            ) : (
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600 }}>
                  PIN
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  maxLength={8}
                  pattern="\d*"
                  autoFocus
                  required
                  style={{
                    width: '100%', padding: 12, fontSize: 18,
                    background: '#0d1117', color: '#fff',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 6, boxSizing: 'border-box',
                    textAlign: 'center', letterSpacing: '0.5em',
                  }}
                />
              </div>
            )}

            <div style={{
              display: 'flex', justifyContent: 'space-between',
              gap: 8, alignItems: 'center',
            }}>
              <button
                type="button"
                onClick={() => { setSelected(null); setError(null); }}
                style={{
                  padding: '8px 12px', borderRadius: 6,
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: 'transparent', color: '#c9d1d9',
                  cursor: 'pointer', fontSize: 13,
                }}
              >← Change user</button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={onCancel}
                  style={{
                    padding: '9px 16px', borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.15)',
                    background: 'transparent', color: '#e6edf3',
                    cursor: 'pointer', fontSize: 14,
                  }}
                >Cancel</button>
                <button
                  type="submit"
                  disabled={submitting || (requirePassword ? !password : !pin)}
                  style={{
                    padding: '9px 18px', borderRadius: 6, border: 'none',
                    background: '#238636', color: '#fff',
                    cursor: submitting ? 'default' : 'pointer',
                    fontSize: 14, fontWeight: 600,
                    opacity: submitting ? 0.6 : 1,
                  }}
                >{submitting ? 'Verifying…' : 'Verify'}</button>
              </div>
            </div>
          </form>
        )}
      </div>
    </ModalBase>,
    document.body
  );
}
