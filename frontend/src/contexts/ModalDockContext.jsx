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
import { createContext, useContext } from 'react';

/* Docked-panel mode for ModalBase.
 *
 * On the live dashboard a menu opens as a panel over the cards column and can
 * be expanded across the charts, instead of as a slab covering the board. That
 * is a property of the *host*, not of any individual modal, and there are ten
 * ModalBase call sites — so it travels by context rather than by threading a
 * prop through AlertsModal, MedicationModal, HistoryModal and the rest.
 *
 * Outside a provider the default is inert, so every other ModalBase consumer
 * (the PIN challenge, quick-add, the alert detail sheet) is untouched.
 */
// `setExpanded` is separate from `toggleExpand` because content inside a panel
// sometimes needs to *reach* the wide stop rather than flip it — tapping a dose
// card in the narrow medications panel opens it in the detail pane, which only
// exists once expanded.
const INERT = { docked: false, expanded: false, toggleExpand: null, setExpanded: null };

const ModalDockContext = createContext(INERT);

export function ModalDockProvider({ value, children }) {
  return <ModalDockContext.Provider value={value}>{children}</ModalDockContext.Provider>;
}

export function useModalDock() {
  return useContext(ModalDockContext);
}

export { INERT as INERT_DOCK };
