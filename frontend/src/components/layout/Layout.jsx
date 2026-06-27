/*
 * Smart Home Health
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
import { AdminPatientProvider } from '../../contexts/AdminPatientContext';
import MessagesAutoPop from '../MessagesAutoPop';
import './Layout.css';

// The legacy /admin pages (and their AdminNav sidebar) have been removed; the
// current admin UI lives under /care with its own AdminV2Layout. This wrapper
// just provides the patient context + global message pop-ups.
const Layout = ({ children }) => {
  return (
    <AdminPatientProvider>
      <div className="layout">
        <MessagesAutoPop />
        <main className="main-content">
          {children}
        </main>
      </div>
    </AdminPatientProvider>
  );
};

export default Layout;
