import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL } from '../config';
import './LoginModal.css';

export default function LoginModal() {
  const { showAuthModal, login, verifyPin, setShowAuthModal } = useAuth();
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [usePassword, setUsePassword] = useState(false);

  useEffect(() => {
    if (showAuthModal) {
      fetchAvailableUsers();
    }
  }, [showAuthModal]);

  const fetchAvailableUsers = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/users/available`, {
        credentials: 'include'
      });
      const data = await res.json();
      setUsers(data);
    } catch (error) {
      console.error('Error fetching users:', error);
      setError('Failed to load users');
    }
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
      result = await login(selectedUser.username, password);
    } else {
      // PIN verification
      result = await verifyPin(selectedUser.id, pin);
      
      if (result.requiresPassword) {
        setUsePassword(true);
        setError('Full password required (daily requirement)');
        setLoading(false);
        return;
      }
    }

    if (!result.success) {
      setError(result.error || 'Authentication failed');
    }

    setLoading(false);
  };

  if (!showAuthModal) return null;

  return (
    <div className="login-modal-overlay">
      <div className="login-modal">
        <div className="login-header">
          <h2>Sign In</h2>
          <p>Select your account to continue</p>
        </div>

        {!selectedUser ? (
          <div className="user-selection">
            {users.map((user) => (
              <button
                key={user.id}
                className="user-card"
                onClick={() => handleUserSelect(user)}
              >
                <div className="user-avatar">
                  {user.full_name.charAt(0).toUpperCase()}
                </div>
                <div className="user-info">
                  <div className="user-name">{user.full_name}</div>
                  <div className="user-roles">
                    {user.role_names.join(', ')}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="login-form">
            <div className="selected-user">
              <div className="user-avatar large">
                {selectedUser.full_name.charAt(0).toUpperCase()}
              </div>
              <div className="user-name">{selectedUser.full_name}</div>
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
              {loading ? 'Signing In...' : 'Sign In'}
            </button>

            {selectedUser.has_pin && !selectedUser.requires_full_password && (
              <button
                type="button"
                className="toggle-auth-button"
                onClick={() => setUsePassword(!usePassword)}
              >
                {usePassword ? 'Use PIN instead' : 'Use password instead'}
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
