import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Dashboard from '../pages/Dashboard';
import './FirstRunSetup.css';

export default function FirstRunSetup() {
  const { completeFirstRunSetup } = useAuth();
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    full_name: '',
    email: '',
    pin: '',
    account_name: '',
    account_password: '',
    confirmAccountPassword: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);
  const [accountSlug, setAccountSlug] = useState('');

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validation
    if (formData.account_password !== formData.confirmAccountPassword) {
      setError('Account passwords do not match');
      return;
    }

    if (formData.account_password.length < 8) {
      setError('Account password must be at least 8 characters');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('User passwords do not match');
      return;
    }

    if (formData.password.length < 8) {
      setError('User password must be at least 8 characters');
      return;
    }

    if (formData.pin && (formData.pin.length < 4 || formData.pin.length > 8)) {
      setError('PIN must be between 4 and 8 digits');
      return;
    }

    if (formData.pin && !/^\d+$/.test(formData.pin)) {
      setError('PIN must contain only numbers');
      return;
    }

    setLoading(true);

    const setupData = {
      username: formData.username,
      password: formData.password,
      full_name: formData.full_name,
      email: formData.email || null,
      pin: formData.pin || null,
      account_name: formData.account_name || null,
      account_password: formData.account_password
    };

    const result = await completeFirstRunSetup(setupData);

    if (!result.success) {
      setError(result.error);
      setLoading(false);
    } else {
      // Show success message with account slug before redirecting
      setAccountSlug(result.data.account_slug);
      setSetupComplete(true);
      setLoading(false);
      // Auto-continue after 5 seconds
      setTimeout(() => {
        window.location.reload();
      }, 5000);
    }
  };

  // Show success screen with account slug
  if (setupComplete) {
    return (
      <div className="first-run-container">
        <div className="first-run-background">
          <Dashboard />
        </div>
        <div className="first-run-card">
          <div className="first-run-header">
            <h1>✓ Setup Complete!</h1>
            <p>Your account has been created successfully</p>
          </div>
          
          <div className="success-info">
            <div className="account-slug-display">
              <label>Your Account Login ID:</label>
              <div className="slug-value">{accountSlug}</div>
              <small>Use this to log into your account in the future</small>
            </div>
            
            <p className="redirect-message">
              Redirecting to dashboard in 5 seconds...
            </p>
            
            <button 
              className="submit-button"
              onClick={() => window.location.reload()}
            >
              Continue Now
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="first-run-container">
      <div className="first-run-background">
        <Dashboard />
      </div>
      <div className="first-run-card">
        <div className="first-run-header">
          <h1>Welcome to Smart Home Health Hub</h1>
          <p>Let's set up your account and administrator profile</p>
        </div>

        <form onSubmit={handleSubmit} className="first-run-form">
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="account_name">Account Name (Optional)</label>
              <input
                type="text"
                id="account_name"
                name="account_name"
                value={formData.account_name}
                onChange={handleChange}
                placeholder="Smith Family"
              />
              <small className="form-hint">
                Name for your account (defaults to your full name)
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="account_password">Account Password *</label>
              <input
                type="password"
                id="account_password"
                name="account_password"
                value={formData.account_password}
                onChange={handleChange}
                required
                minLength={8}
                placeholder="Minimum 8 characters"
              />
              <small className="form-hint">
                Password for logging into the account
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="confirmAccountPassword">Confirm Account Password *</label>
              <input
                type="password"
                id="confirmAccountPassword"
                name="confirmAccountPassword"
                value={formData.confirmAccountPassword}
                onChange={handleChange}
                required
                minLength={8}
                placeholder="Re-enter account password"
              />
            </div>

            <div className="form-group">
              <label htmlFor="full_name">Full Name *</label>
              <input
                type="text"
                id="full_name"
                name="full_name"
                value={formData.full_name}
                onChange={handleChange}
                required
                placeholder="John Doe"
                autoFocus
              />
            </div>

            <div className="form-group">
              <label htmlFor="username">Username *</label>
              <input
                type="text"
                id="username"
                name="username"
                value={formData.username}
                onChange={handleChange}
                required
                minLength={3}
                placeholder="admin"
              />
            </div>

            <div className="form-group">
              <label htmlFor="email">Email (Optional)</label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="admin@example.com"
              />
            </div>

            <div className="form-group">
              <label htmlFor="pin">PIN (Optional - for quick login)</label>
              <input
                type="text"
                id="pin"
                name="pin"
                value={formData.pin}
                onChange={handleChange}
                pattern="\d{4,8}"
                placeholder="4-8 digit PIN"
                maxLength={8}
              />
              <small className="form-hint">
                Set a PIN for quick re-authentication after entering your password
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="password">User Password *</label>
              <input
                type="password"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                minLength={8}
                placeholder="Minimum 8 characters"
              />
              <small className="form-hint">
                Password for your user profile
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm User Password *</label>
              <input
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                minLength={8}
                placeholder="Re-enter user password"
              />
            </div>
          </div>

          <button
            type="submit"
            className="submit-button"
            disabled={loading}
          >
            {loading ? 'Creating Account...' : 'Create Account & Administrator'}
          </button>
        </form>

        <div className="first-run-footer">
          <p>This will create your account and an administrator profile with full system access</p>
        </div>
      </div>
    </div>
  );
}
