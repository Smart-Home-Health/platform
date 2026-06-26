/*
 * Smart Home Health Hub
 * Copyright (C) 2026 John Carty
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
import React from 'react';
import { useDashboardTheme } from '../../contexts/DashboardThemeContext';

/**
 * Live-dashboard color-scheme picker. Applies immediately and persists only in
 * sessionStorage (no Save button, no backend) — see DashboardThemeContext.
 */
const SCHEMES = [
  { id: 'blue',  name: 'Blue',  hint: 'The classic dashboard look (default).', bg: '#161e2e', surface: '#1a202c', text: '#ffffff' },
  { id: 'dark',  name: 'Dark',  hint: 'Neutral near-black for dim rooms.',     bg: '#0d1117', surface: '#161b22', text: '#e6edf3' },
  { id: 'light', name: 'Light', hint: 'Bright, high-light environments.',       bg: '#f6f8fa', surface: '#ffffff', text: '#1f2328' },
];

const AppearanceSettings = () => {
  const { scheme, setScheme } = useDashboardTheme();

  return (
    <div>
      <h3 style={{ color: '#ffffff', fontSize: '1.25rem', marginBottom: '8px', fontWeight: 600 }}>
        Color Scheme
      </h3>
      <div style={{ color: '#cbd5e0', fontSize: '12px', marginBottom: '16px', fontStyle: 'italic' }}>
        Changes apply instantly to the live dashboard on this device for the current session only.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
        {SCHEMES.map((s) => {
          const selected = scheme === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setScheme(s.id)}
              aria-pressed={selected}
              style={{
                textAlign: 'left',
                padding: '12px',
                borderRadius: '10px',
                cursor: 'pointer',
                background: 'transparent',
                border: selected ? '2px solid #4299e1' : '2px solid #4a5568',
                boxShadow: selected ? '0 0 0 3px rgba(66,153,225,0.25)' : 'none',
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
            >
              {/* Mini dashboard preview swatch */}
              <div style={{
                height: '54px',
                borderRadius: '6px',
                background: s.bg,
                border: '1px solid rgba(255,255,255,0.12)',
                padding: '6px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                marginBottom: '10px',
              }}>
                <div style={{ height: '8px', width: '60%', borderRadius: '3px', background: s.surface }} />
                <div style={{ display: 'flex', gap: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#1565C0' }}>98</span>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#2E7D32' }}>72</span>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#EF6C00' }}>1.4</span>
                </div>
                <div style={{ height: '6px', width: '85%', borderRadius: '3px', background: s.text, opacity: 0.85 }} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: '#ffffff', fontSize: '14px', fontWeight: 600 }}>{s.name}</span>
                {selected && <span style={{ color: '#4299e1', fontSize: '14px' }}>✓</span>}
              </div>
              <div style={{ color: '#a0aec0', fontSize: '11px', marginTop: '2px' }}>{s.hint}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default AppearanceSettings;
