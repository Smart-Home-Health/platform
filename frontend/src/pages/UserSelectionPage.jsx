import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import logoImage from '../assets/logo2.png';
import './LoginPage.css';

export default function UserSelectionPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { 
    account, 
    isAuthenticated, 
    isAccountAuthenticated, 
    getAccountUsers, 
    selectUser,
    logout 
  } = useAuth();
  
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [usePassword, setUsePassword] = useState(false);

  // Get the intended destination from location state or default to /care
  const fromLocation = location.state?.from;
  const from = fromLocation?.pathname
    ? `${fromLocation.pathname}${fromLocation.search || ''}`
    : '/care';
  const openLiveModal = location.state?.openLiveModal || null;

  // If already fully authenticated, redirect to intended destination
  useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true, state: openLiveModal ? { openLiveModal } : {} });
    } else if (!isAccountAuthenticated) {
      // No account logged in - redirect to login
      navigate('/login', { state: { from: location.state?.from }, replace: true });
    }
  }, [isAuthenticated, isAccountAuthenticated, navigate, from, location.state]);

  // Fetch users for the account
  useEffect(() => {
    if (isAccountAuthenticated && !isAuthenticated) {
      fetchAccountUsers();
    }
  }, [isAccountAuthenticated, isAuthenticated]);

  const fetchAccountUsers = async () => {
    const data = await getAccountUsers();
    setUsers(data);
  };

  const handleUserSelect = (user) => {
    setSelectedUser(user);
    setPassword('');
    setPin('');
    setError('');
    setUsePassword(user.requires_full_password || !user.has_pin);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    let result;
    
    if (usePassword || !selectedUser.has_pin) {
      // Full password login
      result = await selectUser(selectedUser.id, null, password);
    } else {
      // PIN verification
      result = await selectUser(selectedUser.id, pin, null);

      if (result.requiresPassword) {
        setUsePassword(true);
        setError('Full password required (daily requirement)');
        setLoading(false);
        return;
      }
    }

    // Forced first-login: route to the password reset screen, carrying the
    // just-entered password (if any) so the user doesn't have to retype it.
    if (result.requiresPasswordReset) {
      navigate('/first-login', {
        state: {
          userId: selectedUser.id,
          fullName: selectedUser.full_name || selectedUser.username,
          currentPassword: usePassword ? password : null,
          from: fromLocation,
          openLiveModal,
        },
      });
      setLoading(false);
      return;
    }

    if (result.success) {
      // Redirect to intended destination
      navigate(from, { replace: true, state: openLiveModal ? { openLiveModal } : {} });
    } else {
      setError(result.error || 'Authentication failed');
    }

    setLoading(false);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <Link to="/" className="login-logo">
          <img src={logoImage} alt="Smart Home Health Logo" />
          <span>Smart Home Health</span>
        </Link>

        <div className="login-card">
          <div className="login-header">
            <h2>Select User</h2>
            <p>
              {account?.name ? `Account: ${account.name}` : 'Choose your profile to continue'}
            </p>
          </div>

          {!selectedUser ? (
            <div className="user-selection">
              {users.length === 0 ? (
                <div className="no-users-message">
                  <p>No users available. Please contact an administrator.</p>
                </div>
              ) : (
                users.map((user) => (
                  <button
                    key={user.id}
                    className="user-card"
                    onClick={() => handleUserSelect(user)}
                  >
                    <div className="user-avatar">
                      {(user.full_name || user.username).charAt(0).toUpperCase()}
                    </div>
                    <div className="user-info">
                      <div className="user-name">{user.full_name || user.username}</div>
                      <div className="user-roles">
                        {user.roles?.map(r => r.display_name || r.name).join(', ') || 'User'}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="login-form">
              <div className="selected-user">
                <div className="user-avatar large">
                  {(selectedUser.full_name || selectedUser.username).charAt(0).toUpperCase()}
                </div>
                <div className="user-name">{selectedUser.full_name || selectedUser.username}</div>
                <button
                  type="button"
                  className="change-user-button"
                  onClick={() => setSelectedUser(null)}
                >
                  Change User
                </button>
              </div>

              {error && <div className="error-message">{error}</div>}

              {usePassword ? (
                <div className="form-group">
                  <label htmlFor="password">Password</label>
                  <input
                    type="password"
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    autoFocus
                    required
                  />
                </div>
              ) : (
                <div className="form-group">
                  <label htmlFor="pin">PIN</label>
                  <input
                    type="password"
                    id="pin"
                    inputMode="numeric"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="Enter your PIN"
                    maxLength={8}
                    pattern="\d*"
                    autoFocus
                    required
                  />
                </div>
              )}

              <button type="submit" className="submit-button" disabled={loading}>
                {loading ? 'Signing in...' : 'Sign In'}
              </button>

              {selectedUser.has_pin && (
                <button
                  type="button"
                  className="toggle-auth-method"
                  onClick={() => {
                    setUsePassword(!usePassword);
                    setPassword('');
                    setPin('');
                    setError('');
                  }}
                >
                  {usePassword ? 'Use PIN instead' : 'Use password instead'}
                </button>
              )}
            </form>
          )}
        </div>

        <div className="login-footer">
          <button className="back-link" onClick={handleLogout} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            ← Sign Out / Change Account
          </button>
        </div>
      </div>
    </div>
  );
}
