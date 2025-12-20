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
    pin: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters');
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
      pin: formData.pin || null
    };

    const result = await completeFirstRunSetup(setupData);

    if (!result.success) {
      setError(result.error);
      setLoading(false);
    }
  };

  return (
    <div className="first-run-container">
      <div className="first-run-background">
        <Dashboard />
      </div>
      <div className="first-run-card">
        <div className="first-run-header">
          <h1>Welcome to Smart Home Health Hub</h1>
          <p>Let's set up your administrator account</p>
        </div>

        <form onSubmit={handleSubmit} className="first-run-form">
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <div className="form-grid">
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
              <label htmlFor="password">Password *</label>
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
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm Password *</label>
              <input
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                minLength={8}
                placeholder="Re-enter your password"
              />
            </div>
          </div>

          <button
            type="submit"
            className="submit-button"
            disabled={loading}
          >
            {loading ? 'Creating Account...' : 'Create Administrator Account'}
          </button>
        </form>

        <div className="first-run-footer">
          <p>This account will have full system access</p>
        </div>
      </div>
    </div>
  );
}
