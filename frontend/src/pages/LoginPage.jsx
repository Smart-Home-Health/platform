import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import logoImage from '../assets/logo2.png';
import './LoginPage.css';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isAccountAuthenticated, accountAccess } = useAuth();

  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const from = location.state?.from?.pathname || '/care';

  useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true });
    } else if (isAccountAuthenticated) {
      navigate('/select-user', { state: { from: location.state?.from }, replace: true });
    }
  }, [isAuthenticated, isAccountAuthenticated, navigate, from, location.state]);

  const handleUnlockAndContinue = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await accountAccess(password);
    setLoading(false);
    if (result.success) {
      navigate('/select-user', { state: { from: location.state?.from }, replace: true });
    } else {
      setError(result.error || 'Invalid password');
    }
  };

  const handleContinueWithoutUnlock = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await accountAccess(null);
    setLoading(false);
    if (result.success) {
      navigate('/select-user', { state: { from: location.state?.from }, replace: true });
    } else {
      setError(result.error || 'Could not continue');
    }
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
            <h2>Sign In</h2>
            <p>Enter account password to view data, or continue without unlocking to log and record only.</p>
          </div>

          <form onSubmit={handleUnlockAndContinue} className="login-form">
            {error && <div className="error-message">{error}</div>}

            <div className="form-group">
              <label htmlFor="password">Account password</label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password to unlock"
                autoFocus
              />
            </div>

            <button type="submit" className="submit-button" disabled={loading}>
              {loading ? 'Signing in...' : 'Unlock and continue'}
            </button>
          </form>

          <div className="login-form login-form-secondary">
            <button
              type="button"
              className="submit-button submit-button-secondary"
              disabled={loading}
              onClick={handleContinueWithoutUnlock}
            >
              Continue without unlocking
            </button>
          </div>

          <div className="login-footer">
            <Link to="/" className="back-link">
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
