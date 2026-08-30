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
// The multi-item feed editor. A feed is no longer one item: it is formula
// plus a varying mix of juices and smoothies, each with its own amount and
// nutrition. This edits that list — used by the Log Intake sheet, the
// schedule Complete Nutrition dialog, and (item-only) the schedule sheet's
// feed mix.
//
// Items come from three places: the saved-item search, a barcode scan (saved
// items win; unknown codes fall through to OpenFoodFacts as a save-able
// suggestion), or free text. Rows built from a saved item or a suggestion
// carry per-unit facts and rescale when the amount changes.
//
// Scanning needs no dialog: the Bluetooth scanner is a keyboard wedge, so
// the barcode button just reveals an input — focus it, pull the trigger,
// and the wedge types the code + Enter, which fires the lookup.
import { useEffect, useMemo, useRef, useState } from 'react';
import { EmField } from '../vc/EntityModal';
import { nutritionService } from '../../services/nutrition';
import {
  BarcodeIcon, CheckIcon, ChevronDownIcon, FoodIcon, LiquidIcon, PlusIcon,
  SupplementIcon, TrashIcon, TubeIcon,
} from '../Icons';
import { INTAKE_TYPES, UNITS_FOR_TYPE } from './intakeVocab';
import {
  factString, makeItemRow, numberOrNull, rowFromSavedItem, rowFromSuggestion,
  rowIsValid, rowsTotals, scaledFacts,
} from './intakeItemRows';
import './nutrition-sheet.css';

const TYPE_ICONS = {
  liquid: <LiquidIcon size={16} />,
  food: <FoodIcon size={16} />,
  supplement: <SupplementIcon size={16} />,
  tube_feed: <TubeIcon size={16} />,
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

export default function IntakeItemsEditor({
  patient,
  items,
  onChange,
  requireSavedItem = false, // schedule mix: rows must reference a library item
  showFacts = true,
  maxItems = null,          // edit mode caps the list at one row
  // Schedule mix only: liquid rows can be flagged as the post-feed flush —
  // not logged with the meal, scheduled as a follow-up after the feed runs.
  allowFlushToggle = false,
  title = 'Items',
  // What this feed is meant to deliver ({ calories, fluidMl }, from
  // feedTarget). When set, a running "given / target, N to go" panel tracks
  // the mix as amounts change — the spreadsheet's red cell, live.
  target = null,
  targetLabel = null,
  idPrefix = 'nitems',
}) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [expanded, setExpanded] = useState(() => new Set());
  const [scanOpen, setScanOpen] = useState(false);
  const [scanCode, setScanCode] = useState('');
  const [scanNotice, setScanNotice] = useState(null);
  const [scanBusy, setScanBusy] = useState(false);
  const searchRef = useRef(null);
  const scanRef = useRef(null);

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

  useEffect(() => {
    if (!patient) return undefined;
    const term = search.trim();
    if (!term) { setResults([]); return undefined; }
    let cancelled = false;
    const timer = setTimeout(() => {
      nutritionService.listItems({ patientId: patient.id, search: term, limit: 8 })
        .then((found) => { if (!cancelled) setResults(found); })
        .catch(() => { if (!cancelled) setResults([]); });
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [search, patient]);

  const setRow = (key, patch) => {
    onChange(items.map((row) => {
      if (row.key !== key) return row;
      const next = { ...row, ...patch };
      // Amount changes rescale facts when the row knows its per-unit profile.
      if ('amount' in patch && next.perUnit) {
        Object.assign(next, scaledFacts(next.perUnit, numberOrNull(next.amount) || 0));
      }
      return next;
    }));
  };

  const addRow = (row) => {
    onChange([...items, row]);
    setSearch('');
    setResults([]);
    setScanNotice(null);
  };

  const removeRow = (key) => {
    const remaining = items.filter((row) => row.key !== key);
    // A one-item mix cannot have a flush (the meal itself would vanish);
    // clear an orphaned flag when a deletion leaves a single row.
    onChange(remaining.length < 2
      ? remaining.map((row) => (row.isFlush ? { ...row, isFlush: false } : row))
      : remaining);
  };

  // One flush per feed: flagging a row clears the flag on the others.
  const setFlush = (key, value) => {
    onChange(items.map((row) => ({
      ...row,
      isFlush: row.key === key ? value : (value ? false : row.isFlush),
    })));
  };

  const toggleExpanded = (key) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const addFreeText = () => {
    const row = makeItemRow({ itemName: search.trim() });
    addRow(row);
    setExpanded((prev) => new Set(prev).add(row.key));
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
    if (item) addRow(rowFromSavedItem(item));
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
        addRow(rowFromSavedItem(result.item));
      } else if (result.source === 'openfoodfacts' && result.suggestion) {
        if (requireSavedItem) {
          // A schedule component needs a real library item; save it now.
          try {
            const item = await nutritionService.createItem({
              patient_id: patient?.id ?? null,
              ...result.suggestion,
            });
            addRow(rowFromSavedItem(item));
          } catch {
            setScanNotice('Found the product but could not save it to the library.');
          }
        } else {
          addRow(rowFromSuggestion(result.suggestion));
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

  const canAdd = maxItems == null || items.length < maxItems;
  const canRemove = maxItems !== 1;

  const totals = useMemo(() => rowsTotals(items), [items]);

  // The two tracked measures, only while a target gives them a finish line.
  const targetLines = useMemo(() => {
    if (!target) return [];
    const lines = [];
    if (target.calories > 0) {
      lines.push({ key: 'calories', label: 'Calories', unit: 'kcal',
                   given: totals.calories, goal: target.calories });
    }
    if (target.fluidMl > 0) {
      lines.push({ key: 'fluid', label: 'Fluid', unit: 'mL',
                   given: totals.fluidMl, goal: target.fluidMl });
    }
    return lines;
  }, [target, totals]);

  const summaryLine = useMemo(() => {
    const kcal = items.reduce((sum, row) => sum + (numberOrNull(row.calories) || 0), 0);
    if (!items.length) return null;
    const count = `${items.length} ${items.length === 1 ? 'item' : 'items'}`;
    return kcal > 0 ? `${count} · ${factString(kcal)} kcal` : count;
  }, [items]);

  return (
    <section className="nsheet-card nitems">
      <header className="nsheet-card-head nitems-head">
        <h4>{title}</h4>
        {summaryLine && <span className="nitems-total">{summaryLine}</span>}
      </header>

      {items.length === 0 && (
        <p className="nsheet-note">Nothing added yet. Search, scan, or enter an item.</p>
      )}

      {items.map((row) => {
        const isOpen = expanded.has(row.key);
        const units = UNITS_FOR_TYPE[row.itemType] || UNITS_FOR_TYPE.liquid;
        const isTube = row.itemType === 'tube_feed';
        const invalid = !rowIsValid(row);
        return (
          <div key={row.key} className={`nitems-row${invalid ? ' invalid' : ''}`}>
            <div className="nitems-row-main">
              <span className="nitems-row-icon">
                {TYPE_ICONS[row.itemType] || <LiquidIcon size={16} />}
              </span>
              {row.itemId || !isOpen ? (
                <button
                  type="button"
                  className="nitems-row-name"
                  onClick={() => toggleExpanded(row.key)}
                  title="Show details"
                >
                  {row.itemName.trim() || 'Unnamed item'}
                </button>
              ) : (
                <input
                  className="em-input nitems-row-name-input"
                  value={row.itemName}
                  placeholder="Item name"
                  aria-label="Item name"
                  onChange={(e) => setRow(row.key, { itemName: e.target.value })}
                />
              )}
              <input
                className="em-input nitems-row-amount"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={row.amount}
                aria-label={`Amount of ${row.itemName || 'item'}`}
                onChange={(e) => setRow(row.key, { amount: e.target.value })}
              />
              <select
                className="em-input nitems-row-unit"
                value={row.amountUnit}
                aria-label="Unit"
                onChange={(e) => setRow(row.key, { amountUnit: e.target.value })}
              >
                {(units.includes(row.amountUnit) ? units : [row.amountUnit, ...units])
                  .map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
              <button
                type="button"
                className={`nitems-row-toggle${isOpen ? ' open' : ''}`}
                aria-label={isOpen ? 'Hide details' : 'Show details'}
                aria-expanded={isOpen}
                onClick={() => toggleExpanded(row.key)}
              >
                <ChevronDownIcon size={16} />
              </button>
              {canRemove && (
                <button
                  type="button"
                  className="nitems-row-remove"
                  aria-label={`Remove ${row.itemName || 'item'}`}
                  onClick={() => removeRow(row.key)}
                >
                  <TrashIcon size={16} />
                </button>
              )}
            </div>

            {(row.calories || row.itemId) && !isOpen && (
              <div className="nitems-row-meta">
                {[
                  row.calories ? `${row.calories} kcal` : null,
                  row.protein ? `${row.protein} g protein` : null,
                ].filter(Boolean).join(' · ') || 'no nutrition profile'}
              </div>
            )}

            {/* Offered only once the mix has a meal AND something to flush
                with — flagging the only item would leave nothing to log.
                Until then, say where the toggle went instead of hiding it. */}
            {allowFlushToggle && row.itemType === 'liquid' && items.length === 1 && (
              <p className="nsheet-note nitems-flush-hint">
                For a post-feed flush, add the water as its own item — the
                flush flag appears on it.
              </p>
            )}
            {allowFlushToggle && row.itemType === 'liquid' && items.length >= 2 && (
              <label className="nitems-flush-toggle">
                <input
                  type="checkbox"
                  className="em-check"
                  checked={!!row.isFlush}
                  onChange={(e) => setFlush(row.key, e.target.checked)}
                />
                <span>
                  <strong>Post-feed flush</strong> — not given with the meal;
                  scheduled after the feed has run
                </span>
              </label>
            )}

            {isOpen && (
              <div className="nitems-row-detail">
                {!row.itemId && !requireSavedItem && (
                  <EmField label="Type" htmlFor={`${idPrefix}-${row.key}-type`}>
                    <select
                      id={`${idPrefix}-${row.key}-type`}
                      className="em-input"
                      value={row.itemType}
                      onChange={(e) => {
                        const itemType = e.target.value;
                        const nextUnits = UNITS_FOR_TYPE[itemType] || UNITS_FOR_TYPE.liquid;
                        setRow(row.key, {
                          itemType,
                          amountUnit: nextUnits.includes(row.amountUnit) ? row.amountUnit : nextUnits[0],
                        });
                      }}
                    >
                      {INTAKE_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </EmField>
                )}

                {isTube && (
                  <div className="nsheet-amount">
                    <EmField label="Route" htmlFor={`${idPrefix}-${row.key}-route`}>
                      <select
                        id={`${idPrefix}-${row.key}-route`}
                        className="em-input"
                        value={row.feedRoute}
                        onChange={(e) => setRow(row.key, { feedRoute: e.target.value })}
                      >
                        <option value="">—</option>
                        <option value="bolus">Bolus</option>
                        <option value="pump">Pump</option>
                        <option value="gravity">Gravity</option>
                      </select>
                    </EmField>
                    <EmField label="Rate (mL/hr)" htmlFor={`${idPrefix}-${row.key}-rate`}>
                      <input
                        id={`${idPrefix}-${row.key}-rate`}
                        className="em-input"
                        type="number" min="0" step="any" inputMode="decimal"
                        value={row.rateMlPerHr}
                        onChange={(e) => setRow(row.key, { rateMlPerHr: e.target.value })}
                      />
                    </EmField>
                    <EmField label="Duration (min)" htmlFor={`${idPrefix}-${row.key}-dur`}>
                      <input
                        id={`${idPrefix}-${row.key}-dur`}
                        className="em-input"
                        type="number" min="0" step="any" inputMode="decimal"
                        value={row.durationMinutes}
                        onChange={(e) => setRow(row.key, { durationMinutes: e.target.value })}
                      />
                    </EmField>
                  </div>
                )}

                {showFacts && (
                  <>
                    <div className="nsheet-amount">
                      <EmField label="Calories" htmlFor={`${idPrefix}-${row.key}-cal`}>
                        <input id={`${idPrefix}-${row.key}-cal`} className="em-input"
                               type="number" min="0" step="any" inputMode="decimal"
                               value={row.calories}
                               onChange={(e) => setRow(row.key, { calories: e.target.value })} />
                      </EmField>
                      <EmField label="Protein (g)" htmlFor={`${idPrefix}-${row.key}-protein`}>
                        <input id={`${idPrefix}-${row.key}-protein`} className="em-input"
                               type="number" min="0" step="any" inputMode="decimal"
                               value={row.protein}
                               onChange={(e) => setRow(row.key, { protein: e.target.value })} />
                      </EmField>
                    </div>
                    <div className="nsheet-amount">
                      <EmField label="Carbs (g)" htmlFor={`${idPrefix}-${row.key}-carbs`}>
                        <input id={`${idPrefix}-${row.key}-carbs`} className="em-input"
                               type="number" min="0" step="any" inputMode="decimal"
                               value={row.carbs}
                               onChange={(e) => setRow(row.key, { carbs: e.target.value })} />
                      </EmField>
                      <EmField label="Fat (g)" htmlFor={`${idPrefix}-${row.key}-fat`}>
                        <input id={`${idPrefix}-${row.key}-fat`} className="em-input"
                               type="number" min="0" step="any" inputMode="decimal"
                               value={row.fat}
                               onChange={(e) => setRow(row.key, { fat: e.target.value })} />
                      </EmField>
                    </div>
                    <div className="nsheet-amount">
                      <EmField label="Fiber (g)" htmlFor={`${idPrefix}-${row.key}-fiber`}>
                        <input id={`${idPrefix}-${row.key}-fiber`} className="em-input"
                               type="number" min="0" step="any" inputMode="decimal"
                               value={row.fiber}
                               onChange={(e) => setRow(row.key, { fiber: e.target.value })} />
                      </EmField>
                      <EmField label="Sodium (mg)" htmlFor={`${idPrefix}-${row.key}-sodium`}>
                        <input id={`${idPrefix}-${row.key}-sodium`} className="em-input"
                               type="number" min="0" step="any" inputMode="decimal"
                               value={row.sodium}
                               onChange={(e) => setRow(row.key, { sodium: e.target.value })} />
                      </EmField>
                    </div>
                  </>
                )}

                {!row.itemId && !requireSavedItem && (
                  <label className="em-check-row">
                    <input
                      type="checkbox"
                      className="em-check"
                      checked={row.saveAsItem}
                      onChange={(e) => setRow(row.key, { saveAsItem: e.target.checked })}
                    />
                    <span className="em-check-label">Save as a reusable item</span>
                  </label>
                )}
              </div>
            )}
          </div>
        );
      })}

      {targetLines.length > 0 && (
        <div className="nitems-target">
          <div className="nitems-target-head">
            {targetLabel ? `Target · ${targetLabel}` : 'Target'}
          </div>
          {targetLines.map((line) => {
            const given = Math.round(line.given);
            const goal = Math.round(line.goal);
            const missing = Math.max(0, goal - given);
            const met = missing === 0;
            const pct = Math.min(100, goal > 0 ? (line.given / line.goal) * 100 : 0);
            return (
              <div key={line.key} className="nitems-target-line">
                <div className="nitems-target-row">
                  <span className="nitems-target-label">{line.label}</span>
                  <span className="nitems-target-given">
                    {given} / {goal} {line.unit}
                  </span>
                  {met ? (
                    <span className="nitems-target-met">
                      <CheckIcon size={14} /> Met
                    </span>
                  ) : (
                    <span className="nitems-target-missing">
                      {missing} {line.unit} to go
                    </span>
                  )}
                </div>
                <div className="nitems-target-track" aria-hidden="true">
                  <div
                    className={`nitems-target-fill${met ? ' met' : ''}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {canAdd && (
      <EmField
        label={requireSavedItem ? 'Add a saved item' : 'Add an item'}
        htmlFor={`${idPrefix}-search`}
      >
        <div className="nsheet-search">
          <input
            id={`${idPrefix}-search`}
            ref={searchRef}
            className="em-input"
            value={search}
            placeholder="Search saved items"
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            type="button"
            className="nsheet-scan"
            title={scanOpen ? 'Hide the barcode field' : 'Scan a barcode'}
            aria-label={scanOpen ? 'Hide the barcode field' : 'Scan a barcode'}
            aria-expanded={scanOpen}
            disabled={scanBusy}
            onClick={() => { setScanOpen((v) => !v); setScanNotice(null); }}
          >
            <BarcodeIcon size={20} />
          </button>
        </div>
      </EmField>
      )}

      {canAdd && scanOpen && (
        <EmField label="Barcode" htmlFor={`${idPrefix}-scan`}>
          <div className="nsheet-search">
            <input
              id={`${idPrefix}-scan`}
              ref={scanRef}
              className="em-input"
              value={scanCode}
              placeholder="Scan or type the UPC"
              inputMode="numeric"
              autoComplete="off"
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
              className="nsheet-lookup"
              disabled={scanBusy || !scanCode.trim()}
              onClick={() => handleBarcode(scanCode)}
            >
              Look up
            </button>
          </div>
        </EmField>
      )}

      {scanNotice && <p className="nsheet-note nitems-scan-notice">{scanNotice}</p>}
      {scanBusy && <p className="nsheet-note">Looking up barcode…</p>}

      {canAdd && (results.length > 0 || builtinWaterOffered) && (
        <div className="nsheet-results">
          {builtinWaterOffered && (
            <button
              type="button"
              className="nsheet-result"
              onClick={addBuiltinWater}
            >
              <span className="nsheet-result-icon"><LiquidIcon size={18} /></span>
              <span className="nsheet-result-text">
                <span className="nsheet-result-name">Water</span>
                <span className="nsheet-result-meta">
                  built-in · counts toward fluids · no calories
                </span>
              </span>
              <span className="nsheet-result-add"><PlusIcon size={18} /></span>
            </button>
          )}
          {results.map((item) => (
            <button
              key={item.id}
              type="button"
              className="nsheet-result"
              onClick={() => addRow(rowFromSavedItem(item))}
            >
              <span className="nsheet-result-icon">
                {TYPE_ICONS[item.item_type] || <LiquidIcon size={18} />}
              </span>
              <span className="nsheet-result-text">
                <span className="nsheet-result-name">{item.name}</span>
                <span className="nsheet-result-meta">
                  {[
                    item.item_type?.replace('_', ' '),
                    item.default_amount
                      ? `${item.default_amount} ${item.default_amount_unit || ''}`.trim()
                      : null,
                    item.calories_per_unit ? `${item.calories_per_unit}/unit kcal` : 'no nutrition profile',
                  ].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="nsheet-result-add"><PlusIcon size={18} /></span>
            </button>
          ))}
        </div>
      )}

      {canAdd && !requireSavedItem && (
        <button type="button" className="nitems-add-manual" onClick={addFreeText}>
          <PlusIcon size={16} />
          {search.trim() ? `Add "${search.trim()}" manually` : 'Add an item manually'}
        </button>
      )}

    </section>
  );
}
