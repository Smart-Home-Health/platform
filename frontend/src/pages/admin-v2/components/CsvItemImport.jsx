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
// Import shipment items from a CSV: we guess which column is which from the
// first few rows, the user gets the final say via per-column dropdowns, then
// everything goes through the same bulk-add endpoint the invoice scanner uses.
import { useRef, useState } from 'react';
import EntityModal, { EmSelect } from '../../../components/vc/EntityModal';
import { CfgBadge } from '../settings/CfgSection';
import { shipmentService } from '../../../services/shipments';
import {
  parseCsv,
  looksLikeHeader,
  guessMapping,
  buildItemsFromCsv,
  CSV_TARGET_FIELDS,
} from '../../../lib/csvImport';

const PREVIEW_ROWS = 4;

// Pluggable target: by default this imports SHIPMENT ITEMS straight into the
// bulk-add endpoint. The Initial Inventory Setup wizard reuses the same
// mapping UI with equipment-shaped fields and its own onImport (rows land in
// the wizard's review step instead of the database).
export default function CsvItemImport({
  open, onClose, shipmentId, onDone,
  targetFields = CSV_TARGET_FIELDS,
  buildRows = buildItemsFromCsv,
  guessOpts = undefined,
  onImport = undefined,
  title = 'Import items from a CSV',
}) {
  const fileInputRef = useRef(null);
  const [rows, setRows] = useState(null);
  const [mapping, setMapping] = useState([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setRows(null); setMapping([]); setFileName(''); setError(null);
  };

  const handleFileChosen = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.length === 0) {
        setError("That file looks empty — nothing to import.");
        return;
      }
      const header = looksLikeHeader(parsed[0], guessOpts?.patterns);
      setRows(parsed);
      setHasHeader(header);
      setMapping(guessMapping(parsed, header, guessOpts));
      setFileName(file.name);
    } catch {
      setError("We couldn't read that file. Is it a CSV export?");
    }
  };

  const updateMapping = (col, field) => {
    setMapping((prev) => prev.map((f, i) => {
      if (i === col) return field;
      // A field can only live in one column — picking it here clears it elsewhere.
      return f === field && field !== '' ? '' : f;
    }));
  };

  const toggleHeader = () => {
    const next = !hasHeader;
    setHasHeader(next);
    setMapping(guessMapping(rows, next, guessOpts));
  };

  const items = rows ? buildRows(rows, mapping, hasHeader) : [];
  const previewData = rows ? rows.slice(hasHeader ? 1 : 0, (hasHeader ? 1 : 0) + PREVIEW_ROWS) : [];
  const width = rows ? Math.max(0, ...rows.map((r) => r.length)) : 0;

  const handleImport = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = onImport
        ? await onImport(items)
        : await shipmentService.bulkAddItems(shipmentId, items);
      if (result.success || result.count > 0) {
        reset();
        onDone?.(result.count);
      } else {
        setError(result.error || 'Failed to add items');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <EntityModal open onOpenChange={(o) => { if (!o) { reset(); onClose?.(); } }} title={title} wide>
      <div className="em-form">
        {error && <div className="em-error" role="alert">{error}</div>}

        {!rows ? (
          <>
            <p className="em-hint">
              A spreadsheet export works great — one row per item. We'll figure out
              which column is which, and you can correct us before anything is saved.
            </p>
            <button type="button" className="em-submit" onClick={() => fileInputRef.current?.click()}>
              Choose a CSV file
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              onChange={handleFileChosen}
            />
          </>
        ) : (
          <>
            <div className="cfg-crumb-tags">
              <CfgBadge>{fileName}</CfgBadge>
              <CfgBadge tone={items.length > 0 ? 'ok' : undefined}>
                {items.length} item{items.length === 1 ? '' : 's'} ready
              </CfgBadge>
              <label className="em-check-row">
                <input
                  type="checkbox"
                  className="em-check"
                  checked={hasHeader}
                  onChange={toggleHeader}
                />
                <span className="em-check-label">First row is column names</span>
              </label>
            </div>

            <p className="em-hint">
              Check the dropdowns — that's our guess at what each column is.
              Set any we got wrong (or "Ignore" ones you don't need).
            </p>

            <div className="cfg-rawtable-wrap">
              <table className="cfg-rawtable">
                <thead>
                  <tr>
                    {Array.from({ length: width }, (_, col) => (
                      <th key={col} style={{ minWidth: 130 }}>
                        <EmSelect
                          aria-label={`Column ${col + 1} field`}
                          value={mapping[col] || ''}
                          onChange={(e) => updateMapping(col, e.target.value)}
                        >
                          {targetFields.map((f) => (
                            <option key={f.value || 'ignore'} value={f.value}>{f.label}</option>
                          ))}
                        </EmSelect>
                        {hasHeader && (
                          <div className="cfg-rawtable-colname">{rows[0][col] || ''}</div>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewData.map((row, i) => (
                    <tr key={i}>
                      {Array.from({ length: width }, (_, col) => (
                        <td key={col} className={mapping[col] ? '' : 'dim'}>
                          {row[col] || ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > previewData.length + (hasHeader ? 1 : 0) && (
              <p className="em-hint">
                Showing the first {previewData.length} of {rows.length - (hasHeader ? 1 : 0)} rows.
              </p>
            )}

            {items.length === 0 && (
              <p className="em-hint">
                Nothing to add yet — at least one column needs to be Item # or Description.
              </p>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              onChange={handleFileChosen}
            />
            <div className="em-footer">
              <button
                type="button"
                className="em-cancel start"
                onClick={() => fileInputRef.current?.click()}
                disabled={saving}
              >
                Pick a different file
              </button>
              <button
                type="button"
                className="em-cancel"
                onClick={() => { reset(); onClose?.(); }}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="em-submit"
                onClick={handleImport}
                disabled={saving || items.length === 0}
              >
                {saving ? 'Adding…' : `Add ${items.length} item${items.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </>
        )}
      </div>
    </EntityModal>
  );
}
