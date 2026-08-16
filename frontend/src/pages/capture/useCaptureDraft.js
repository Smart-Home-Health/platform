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
// Draft encounters: un-saved capture state survives navigation and app close.
// One draft per patient in localStorage; cleared on save; drafts older than
// 12h are silently discarded (a stale half-encounter is worse than a fresh one).

const DRAFT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

// crypto.randomUUID only exists in secure contexts (https / localhost), and
// this page's main audience is a phone on the LAN over plain http — fall back
// to a v4 UUID built from getRandomValues, which works everywhere.
export function newEncounterUid() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant 10xx
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const draftKey = (patientId) => `shh.captureDraft.v1.${patientId}`;

export function loadDraft(patientId) {
  if (!patientId) return null;
  try {
    const raw = localStorage.getItem(draftKey(patientId));
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (!draft?.encounterUid || !draft.readings) return null;
    const updatedAt = new Date(draft.updatedAt).getTime();
    // Missing/invalid updatedAt would make the age NaN (never expires) —
    // treat it as stale.
    if (!Number.isFinite(updatedAt) || Date.now() - updatedAt > DRAFT_MAX_AGE_MS) {
      localStorage.removeItem(draftKey(patientId));
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

export function saveDraft(patientId, draft) {
  if (!patientId) return;
  try {
    localStorage.setItem(draftKey(patientId), JSON.stringify({
      ...draft,
      updatedAt: new Date().toISOString(),
    }));
  } catch {
    // Storage full/blocked: the in-memory encounter still works for this sitting.
  }
}

export function clearDraft(patientId) {
  if (!patientId) return;
  try {
    localStorage.removeItem(draftKey(patientId));
  } catch {
    // ignore
  }
}
