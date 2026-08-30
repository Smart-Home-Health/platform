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
// The full-screen item picker: "find an item" separated from "configure an
// item", which is what made the old inline flow feel heavy. One tap on a
// result adds it (at its default amount) to the pending selection, shown as
// removable chips; amounts and nutrition get edited back on the form after
// Done. Search, recents, the saved library, barcode scans, and manual entry
// all land in the same place.
//
// Built as a nested Radix dialog so it composes with the hosts: inside an
// EntityModal or the schedule's completion dialog the inner layer takes over
// focus and Escape, and closing returns cleanly to the form underneath. The
// live dashboard's docked pane needs no host dialog at all.
//
// Scanning needs no dialog of its own: the Bluetooth scanner is a keyboard
// wedge, so the barcode button reveals an input — focus it, pull the
// trigger, and the wedge types the code + Enter, which fires the lookup.
import { useEffect, useMemo, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { nutritionService } from '../../services/nutrition';
import {
  BarcodeIcon, FoodIcon, LiquidIcon, PlusIcon, SearchIcon, SupplementIcon,
  TubeIcon, XIcon,
} from '../Icons';
import {
  factString, makeItemRow, numberOrNull, rowFromSavedItem, rowFromSuggestion,
  rowsTotals,
} from './intakeItemRows';
import './item-picker.css';

const TYPE_ICONS = {
  liquid: <LiquidIcon size={18} />,
  food: <FoodIcon size={18} />,
  supplement: <SupplementIcon size={18} />,
  tube_feed: <TubeIcon size={18} />,
};

// Water is a given — nobody should have to author it. The search always
// offers it; picking it creates the real library item on the spot (zero
// facts, counts toward fluids by unit) so it also works where a saved item
// id is required, like a schedule component.
const BUILTIN_WATER = {
  name: 'Water',
  item_type: 'liquid',
  default_amount: 60,
  default_amount_unit: 'ml',
  calories_per_unit: 0,
  protein_per_unit: 0,
  carbs_per_unit: 0,
  fat_per_unit: 0,
  fiber_per_unit: 0,
  sodium_per_unit: 0,
};

const itemMeta = (item) => [
  item.item_type?.replace('_', ' '),
  item.default_amount
    ? `${item.default_amount} ${item.default_amount_unit || ''}`.trim()
    : null,
  item.calories_per_unit ? `${item.calories_per_unit}/unit kcal` : 'no nutrition profile',
].filter(Boolean).join(' · ');

export default function ItemPickerSheet({
  open,
  onCancel,
  // onDone(rows, { expandKey }) — the whole selection, replacing the form's
  // list; expandKey names a just-added manual row the form should open.
  onDone,
  patient,
  items,                    // the form's current rows, seeding the selection
  requireSavedItem = false, // schedule mix: rows must reference a library item
  idPrefix = 'nitems',
}) {
  const [draft, setDraft] = useState([]);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [tab, setTab] = useState('all');
  const [recent, setRecent] = useState([]);
  const [library, setLibrary] = useState([]);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanCode, setScanCode] = useState('');
  const [scanNotice, setScanNotice] = useState(null);
  const [scanBusy, setScanBusy] = useState(false);
  const searchRef = useRef(null);
  const scanRef = useRef(null);

  // Each opening is a fresh session over the form's current list.
  useEffect(() => {
    if (!open) return;
    setDraft(items || []);
    setSearch('');
    setResults([]);
    setScanOpen(false);
    setScanCode('');
    setScanNotice(null);
    setTab(requireSavedItem ? 'all' : 'recent');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed from items only at the moment of opening
  }, [open]);

  // The browse lists load once per opening: the saved library, and (for
  // free-form hosts) what was recently logged.
  useEffect(() => {
    if (!open || !patient) return undefined;
    let cancelled = false;
    nutritionService.listItems({ patientId: patient.id, limit: 50 })
      .then((found) => { if (!cancelled) setLibrary(found); })
      .catch(() => { if (!cancelled) setLibrary([]); });
    if (!requireSavedItem) {
      nutritionService.recent(patient.id, 8)
        .then((data) => { if (!cancelled) setRecent(data.recent || []); })
        .catch(() => { if (!cancelled) setRecent([]); });
    }
    return () => { cancelled = true; };
  }, [open, patient, requireSavedItem]);

  // Debounced search overrides the tab lists while a term is typed.
  useEffect(() => {
    if (!open || !patient) return undefined;
    const term = search.trim();
    if (!term) { setResults([]); return undefined; }
    let cancelled = false;
    const timer = setTimeout(() => {
      nutritionService.listItems({ patientId: patient.id, search: term, limit: 8 })
        .then((found) => { if (!cancelled) setResults(found); })
        .catch(() => { if (!cancelled) setResults([]); });
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [search, open, patient]);

  // The revealed barcode field grabs focus so the very next trigger pull
  // lands in it.
  useEffect(() => {
    if (scanOpen) scanRef.current?.focus();
  }, [scanOpen]);

  // Auto-lookup: a scanner types 8+ digits in a burst; when the field goes
  // quiet the code is looked up even if the scanner sent no terminator
  // (wedges differ — Enter, Tab, or nothing).
  useEffect(() => {
    const code = scanCode.trim();
    if (code.length < 8 || !/^\d+$/.test(code)) return undefined;
    const timer = setTimeout(() => handleBarcode(code), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleBarcode is recreated each render; keying on the code is the debounce contract
  }, [scanCode]);

  const addToDraft = (row) => {
    setDraft((prev) => [...prev, row]);
    setSearch('');
    setResults([]);
    setScanNotice(null);
  };

  const removeFromDraft = (key) => {
    setDraft((prev) => prev.filter((row) => row.key !== key));
  };

  // A recent entry is a logged (name, amount, unit) combo, not a library
  // row; when the library has the same name, ride its facts so the amount
  // rescales later.
  const addRecent = (entry) => {
    const match = library.find(
      (item) => item.name.trim().toLowerCase() === entry.item_name.trim().toLowerCase(),
    );
    if (match) {
      const row = rowFromSavedItem(match);
      addToDraft({
        ...row,
        amount: entry.amount != null ? String(entry.amount) : row.amount,
        amountUnit: entry.amount_unit || row.amountUnit,
      });
      return;
    }
    addToDraft(makeItemRow({
      itemName: entry.item_name,
      itemType: entry.item_type || 'liquid',
      amount: entry.amount != null ? String(entry.amount) : '',
      amountUnit: entry.amount_unit || 'ml',
    }));
  };

  // Offered while the term reads like "water" and the library has no Water
  // of its own yet.
  const builtinWaterOffered = (() => {
    const term = search.trim().toLowerCase();
    return term.length > 0
      && 'water'.startsWith(term)
      && !results.some((item) => item.name.trim().toLowerCase() === 'water');
  })();

  const addBuiltinWater = async () => {
    let item = null;
    try {
      item = await nutritionService.createItem({
        patient_id: patient?.id ?? null,
        ...BUILTIN_WATER,
      });
    } catch {
      // Already exists (or a race): fall back to the saved one.
      try {
        const found = await nutritionService.listItems({
          patientId: patient?.id, search: 'water', limit: 8,
        });
        item = found.find((i) => i.name.trim().toLowerCase() === 'water') || null;
      } catch { /* handled below */ }
    }
    if (item) addToDraft(rowFromSavedItem(item));
    else setScanNotice('Could not add Water — try adding it manually.');
  };

  const handleBarcode = async (code) => {
    const barcode = String(code || '').trim();
    if (!barcode) return;
    setScanCode('');
    setScanBusy(true);
    setScanNotice(null);
    try {
      const result = await nutritionService.lookupBarcode(barcode, patient?.id);
      if (result.source === 'library' && result.item) {
        addToDraft(rowFromSavedItem(result.item));
      } else if (result.source === 'openfoodfacts' && result.suggestion) {
        if (requireSavedItem) {
          // A schedule component needs a real library item; save it now.
          try {
            const item = await nutritionService.createItem({
              patient_id: patient?.id ?? null,
              ...result.suggestion,
            });
            addToDraft(rowFromSavedItem(item));
          } catch {
            setScanNotice('Found the product but could not save it to the library.');
          }
        } else {
          addToDraft(rowFromSuggestion(result.suggestion));
          setScanNotice('New product from the barcode database — check the amount, it will be saved for next time.');
        }
      } else {
        setScanNotice(`No match for barcode ${barcode}. Enter the item manually.`);
      }
    } catch {
      setScanNotice('Barcode lookup failed. Enter the item manually.');
    } finally {
      setScanBusy(false);
      // Ready for the next bottle — consecutive trigger pulls just work.
      scanRef.current?.focus();
    }
  };

  // Manual entry configures on the form, not here: commit the selection
  // plus a fresh row and hand its key back so the form opens it.
  const addManual = () => {
    const row = makeItemRow({ itemName: search.trim() });
    onDone([...draft, row], { expandKey: row.key });
  };

  const totals = useMemo(() => rowsTotals(draft), [draft]);
  const kcal = Math.round(totals.calories);

  const showingSearch = search.trim().length > 0;
  const listItems = showingSearch ? results : (tab === 'all' ? library : []);
  const showRecent = !showingSearch && tab === 'recent' && !requireSavedItem;

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => { if (!next) onCancel?.(); }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          className="nip-root"
          aria-describedby={undefined}
          // Finding an item starts with typing; land focus in the search
          // box instead of the close button Radix would pick.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            searchRef.current?.focus();
          }}
          onPointerDownOutside={(e) => {
            if (e.target?.closest?.('.vkb-root')) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (e.target?.closest?.('.vkb-root')) e.preventDefault();
          }}
        >
          <div className="nip-head">
            <DialogPrimitive.Title className="nip-title">Add items</DialogPrimitive.Title>
            <DialogPrimitive.Close className="nip-close" aria-label="Close without adding">
              <XIcon size={18} />
            </DialogPrimitive.Close>
          </div>

          <div className="nip-search-row">
            <span className="nip-search-icon" aria-hidden="true"><SearchIcon size={18} /></span>
            <input
              id={`${idPrefix}-search`}
              ref={searchRef}
              className="em-input nip-search"
              value={search}
              placeholder="Search saved items"
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              type="button"
              className="nip-scan-btn"
              title={scanOpen ? 'Hide the barcode field' : 'Scan a barcode'}
              aria-label={scanOpen ? 'Hide the barcode field' : 'Scan a barcode'}
              aria-expanded={scanOpen}
              disabled={scanBusy}
              onClick={() => { setScanOpen((v) => !v); setScanNotice(null); }}
            >
              <BarcodeIcon size={20} />
            </button>
          </div>

          {scanOpen && (
            <div className="nip-search-row">
              <input
                id={`${idPrefix}-scan`}
                ref={scanRef}
                className="em-input nip-search"
                aria-label="Barcode"
                value={scanCode}
                placeholder="Scan or type the UPC"
                inputMode="numeric"
                autoComplete="off"
                // The wedge scanner types on its own; popping the on-screen
                // keyboard over the panel mid-scan is pure noise.
                data-vkb-ignore="true"
                onChange={(e) => setScanCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleBarcode(e.target.value);
                  }
                }}
              />
              <button
                type="button"
                className="nip-lookup"
                disabled={scanBusy || !scanCode.trim()}
                onClick={() => handleBarcode(scanCode)}
              >
                Look up
              </button>
            </div>
          )}

          {scanNotice && <p className="nip-notice">{scanNotice}</p>}
          {scanBusy && <p className="nip-notice">Looking up barcode…</p>}

          {!requireSavedItem && !showingSearch && (
            <div className="nip-tabs" role="tablist" aria-label="Item source">
              {[
                { value: 'recent', label: 'Recent' },
                { value: 'all', label: 'All items' },
              ].map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.value}
                  className={`nip-tab${tab === t.value ? ' active' : ''}`}
                  onClick={() => setTab(t.value)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          {draft.length > 0 && (
            <div className="nip-selected">
              <div className="nip-selected-head">
                <span className="nip-selected-count">
                  {draft.length} selected
                </span>
                {kcal > 0 && (
                  <span className="nip-selected-kcal">{factString(kcal)} kcal</span>
                )}
              </div>
              <div className="nip-chips">
                {draft.map((row) => (
                  <span key={row.key} className="nip-chip">
                    <span className="nip-chip-label">
                      {row.itemName.trim() || 'New item'}
                      {numberOrNull(row.amount) != null
                        ? ` · ${row.amount} ${row.amountUnit}`
                        : ''}
                    </span>
                    <button
                      type="button"
                      className="nip-chip-remove"
                      aria-label={`Remove ${row.itemName.trim() || 'new item'}`}
                      onClick={() => removeFromDraft(row.key)}
                    >
                      <XIcon size={14} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="nip-list">
            {showRecent && recent.map((entry, i) => (
              <button
                key={`recent-${i}`}
                type="button"
                className="nip-item"
                onClick={() => addRecent(entry)}
              >
                <span className="nip-item-icon">
                  {TYPE_ICONS[entry.item_type] || <LiquidIcon size={18} />}
                </span>
                <span className="nip-item-text">
                  <span className="nip-item-name">{entry.item_name}</span>
                  <span className="nip-item-meta">
                    {`${entry.amount} ${entry.amount_unit || ''} · as last logged`}
                  </span>
                </span>
                <span className="nip-item-add" aria-hidden="true"><PlusIcon size={18} /></span>
              </button>
            ))}
            {showRecent && recent.length === 0 && (
              <p className="nip-empty">Nothing logged yet — search or browse all items.</p>
            )}

            {builtinWaterOffered && (
              <button type="button" className="nip-item" onClick={addBuiltinWater}>
                <span className="nip-item-icon"><LiquidIcon size={18} /></span>
                <span className="nip-item-text">
                  <span className="nip-item-name">Water</span>
                  <span className="nip-item-meta">
                    built-in · counts toward fluids · no calories
                  </span>
                </span>
                <span className="nip-item-add" aria-hidden="true"><PlusIcon size={18} /></span>
              </button>
            )}
            {!showRecent && listItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className="nip-item"
                onClick={() => addToDraft(rowFromSavedItem(item))}
              >
                <span className="nip-item-icon">
                  {TYPE_ICONS[item.item_type] || <LiquidIcon size={18} />}
                </span>
                <span className="nip-item-text">
                  <span className="nip-item-name">{item.name}</span>
                  <span className="nip-item-meta">{itemMeta(item)}</span>
                </span>
                <span className="nip-item-add" aria-hidden="true"><PlusIcon size={18} /></span>
              </button>
            ))}
            {!showRecent && !builtinWaterOffered && listItems.length === 0 && (
              <p className="nip-empty">
                {showingSearch
                  ? 'No saved items match.'
                  : 'No saved items yet — scan a barcode or add one manually.'}
              </p>
            )}

            {!requireSavedItem && (
              <button type="button" className="nip-add-manual" onClick={addManual}>
                <PlusIcon size={16} />
                {search.trim() ? `Add "${search.trim()}" manually` : 'Add an item manually'}
              </button>
            )}
          </div>

          <div className="nip-footer">
            <button type="button" className="nip-cancel" onClick={() => onCancel?.()}>
              Cancel
            </button>
            <button
              type="button"
              className="nip-done"
              onClick={() => onDone(draft, {})}
            >
              {`Done · ${draft.length} ${draft.length === 1 ? 'item' : 'items'}`}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
