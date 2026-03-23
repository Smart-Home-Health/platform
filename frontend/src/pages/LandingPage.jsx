import React from 'react';
import { Link } from 'react-router-dom';
import logoImage from '../assets/logo2.png';
import {
  VitalsChartIcon,
  PillIcon,
  ChecklistIcon,
  BellAlertIcon,
  HospitalIcon,
  TabletIcon
} from '../components/Icons';
import './LandingPage.css';

export default function LandingPage() {
  return (
    <div className="landing-page">
      <header className="landing-header">
        <div className="landing-logo">
          <img src={logoImage} alt="Smart Home Health Logo" />
          <span>Smart Home Health</span>
        </div>
        <nav className="landing-nav">
          <Link to="/login" className="landing-btn landing-btn-primary">
            Sign In
          </Link>
        </nav>
      </header>

      <main className="landing-main">
        <section className="landing-hero">
          <h1>Real-Time Health Monitoring</h1>
          <p className="landing-subtitle">
            Comprehensive patient monitoring for home healthcare. 
            Track vitals, manage medications, and coordinate care — all in one place.
          </p>
          <div className="landing-cta">
            <Link to="/login" className="landing-btn landing-btn-large landing-btn-primary">
              Get Started
            </Link>
          </div>
        </section>

        <section className="landing-features">
          <div className="landing-feature">
            <div className="landing-feature-icon">
              <VitalsChartIcon size={32} />
            </div>
            <h3>Real-Time Vitals</h3>
            <p>Monitor SpO2, heart rate, temperature, and more with continuous sensor integration.</p>
          </div>
          <div className="landing-feature">
            <div className="landing-feature-icon">
              <PillIcon size={32} />
            </div>
            <h3>Medication Management</h3>
            <p>Schedule medications, track administration, and never miss a dose.</p>
          </div>
          <div className="landing-feature">
            <div className="landing-feature-icon">
              <ChecklistIcon size={32} />
            </div>
            <h3>Care Task Tracking</h3>
            <p>Coordinate care tasks between caregivers with scheduling and logging.</p>
          </div>
          <div className="landing-feature">
            <div className="landing-feature-icon">
              <BellAlertIcon size={32} />
            </div>
            <h3>Smart Alerts</h3>
            <p>Receive notifications when vitals fall outside safe ranges.</p>
          </div>
          <div className="landing-feature">
            <div className="landing-feature-icon">
              <HospitalIcon size={32} />
            </div>
            <h3>Provider Network</h3>
            <p>Manage healthcare providers, businesses, and care team contacts.</p>
          </div>
          <div className="landing-feature">
            <div className="landing-feature-icon">
              <TabletIcon size={32} />
            </div>
            <h3>Touch Dashboard</h3>
            <p>Optimized for bedside tablets with large, easy-to-read displays.</p>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <p>&copy; {new Date().getFullYear()} Smart Home Health. All rights reserved.</p>
      </footer>
    </div>
  );
}
