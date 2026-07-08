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
import React, { useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PlusIcon } from '../../../components/Icons';
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
    <Dialog open onOpenChange={(o) => { if (!o) { reset(); onClose?.(); } }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[720px]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

        {!rows ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
              A spreadsheet export works great — one row per item. We'll figure out
              which column is which, and you can correct us before anything is saved.
            </p>
            <Button size="lg" onClick={() => fileInputRef.current?.click()}>
              Choose a CSV file
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleFileChosen}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-secondary px-3 py-1">{fileName}</span>
              <span className="rounded-full bg-secondary px-3 py-1">
                {items.length} item{items.length === 1 ? '' : 's'} ready
              </span>
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={hasHeader} onChange={toggleHeader} />
                First row is column names
              </label>
            </div>

            <p className="text-sm text-muted-foreground">
              Check the dropdowns — that's our guess at what each column is.
              Set any we got wrong (or "Ignore" ones you don't need).
            </p>

            <div className="admin-v2-table-container" style={{ overflowX: 'auto' }}>
              <table className="admin-v2-table">
                <thead>
                  <tr>
                    {Array.from({ length: width }, (_, col) => (
                      <th key={col} style={{ minWidth: 130 }}>
                        <select
                          value={mapping[col] || ''}
                          onChange={(e) => updateMapping(col, e.target.value)}
                          style={{ width: '100%', padding: '6px' }}
                        >
                          {targetFields.map((f) => (
                            <option key={f.value || 'ignore'} value={f.value}>{f.label}</option>
                          ))}
                        </select>
                        {hasHeader && (
                          <div className="admin-v2-text-muted" style={{ marginTop: 4, fontWeight: 400 }}>
                            {rows[0][col] || ''}
                          </div>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewData.map((row, i) => (
                    <tr key={i}>
                      {Array.from({ length: width }, (_, col) => (
                        <td key={col} className={mapping[col] ? '' : 'admin-v2-text-muted'}>
                          {row[col] || ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > previewData.length + (hasHeader ? 1 : 0) && (
              <p className="admin-v2-text-muted text-sm" style={{ margin: 0 }}>
                Showing the first {previewData.length} of {rows.length - (hasHeader ? 1 : 0)} rows.
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button size="lg" onClick={handleImport} disabled={saving || items.length === 0}>
                <PlusIcon size={16} /> {saving ? 'Adding…' : `Add ${items.length} item${items.length === 1 ? '' : 's'}`}
              </Button>
              <Button variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={saving}>
                Pick a different file
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleFileChosen}
              />
              <Button variant="ghost" onClick={() => { reset(); onClose?.(); }} disabled={saving}>
                Cancel
              </Button>
            </div>
            {items.length === 0 && (
              <p className="admin-v2-text-muted text-sm" style={{ margin: 0 }}>
                Nothing to add yet — at least one column needs to be Item # or Description.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
