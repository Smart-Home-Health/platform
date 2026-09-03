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
// Finding items is separated from configuring them: "Add items" opens the
// full-screen ItemPickerSheet (search, recents, barcode, manual entry, one
// tap per item); this form shows each selected item as a compact row and
// expands only the one being edited. Rows built from a saved item or a
// barcode suggestion carry per-unit facts and rescale when the amount
// changes. Totals and target progress sit below the list.
import { useMemo, useState } from 'react';
import { EmField } from '../vc/EntityModal';
import ItemPickerSheet from './ItemPickerSheet';
import {
  CheckIcon, ChevronDownIcon, FoodIcon, LiquidIcon, PlusIcon,
  SupplementIcon, TrashIcon, TubeIcon,
} from '../Icons';
import { INTAKE_TYPES, UNITS_FOR_TYPE } from './intakeVocab';
import {
  factString, numberOrNull, rowIsValid, rowsTotals, scaledFacts,
} from './intakeItemRows';
import './nutrition-sheet.css';

const TYPE_ICONS = {
  liquid: <LiquidIcon size={16} />,
  food: <FoodIcon size={16} />,
  supplement: <SupplementIcon size={16} />,
  tube_feed: <TubeIcon size={16} />,
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
  // Deliberately NOT auto-opened: the hosts' one-tap quick paths (presets,
  // recents, feed links) sit on the form, and a modal picker would bury
  // them on every open.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set());

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

  // A one-item mix cannot have a flush (the meal itself would vanish);
  // clear an orphaned flag whenever an edit leaves a single row.
  const normalize = (rows) => (rows.length < 2
    ? rows.map((row) => (row.isFlush ? { ...row, isFlush: false } : row))
    : rows);

  const removeRow = (key) => {
    onChange(normalize(items.filter((row) => row.key !== key)));
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

  // The picker hands back the whole selection; a manual row comes with its
  // key so it opens for configuring right away.
  const applyPicker = (rows, { expandKey } = {}) => {
    const limited = maxItems != null ? rows.slice(0, maxItems) : rows;
    onChange(normalize(limited));
    if (expandKey) setExpanded((prev) => new Set(prev).add(expandKey));
    setPickerOpen(false);
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
        <p className="nsheet-note">Nothing added yet.</p>
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
        <button
          type="button"
          className="nitems-open-picker"
          onClick={() => setPickerOpen(true)}
        >
          <PlusIcon size={16} />
          {items.length ? 'Add or remove items' : 'Add items'}
        </button>
      )}

      <ItemPickerSheet
        open={pickerOpen}
        onCancel={() => setPickerOpen(false)}
        onDone={applyPicker}
        patient={patient}
        items={items}
        requireSavedItem={requireSavedItem}
        idPrefix={idPrefix}
      />
    </section>
  );
}
