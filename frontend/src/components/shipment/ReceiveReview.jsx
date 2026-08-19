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
// Checking a delivery in: what arrived, and what is still coming.
//
// Seeded either from a packing-slip scan or from the order itself. Lines the
// scan could not match by item number are shown separately, because guessing
// silently is how a box of the wrong thing gets counted as the right thing --
// each one is a decision (add it, count it toward a line we have, ignore it)
// rather than something applied on the user's behalf.
const CONDITIONS = [
  { value: 'good', label: 'Good' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'wrong_item', label: 'Wrong item' },
];

export default function ReceiveReview({
  items = [],
  extras = null,
  shipmentItems = [],
  saving,
  onChangeItem,
  onChangeExtra,
  onRemoveExtra,
  onCancel,
  onSave,
}) {
  const num = (value) => (Number.isFinite(parseInt(value, 10)) ? parseInt(value, 10) : 0);
  const totalArrived = items.reduce((sum, r) => sum + num(r.qty_received), 0);
  const totalLater = items.reduce((sum, r) => sum + num(r.qty_backordered), 0);

  return (
    <div className="rr">
      {extras && extras.length > 0 && (
        <section className="rr-extras">
          <h3 className="rr-sub">New on this slip ({extras.length})</h3>
          <p className="sd-hint">
            These lines did not match anything on the order by item number.
          </p>
          {extras.map((e) => (
            <div key={e.key} className="rr-extra">
              <input className="em-input" value={e.item_description}
                     aria-label={`Description for scanned line ${e.item_number || e.key}`}
                     onChange={(ev) => onChangeExtra(e.key, { item_description: ev.target.value })} />
              <div className="rr-extra-row">
                <label className="rr-mini">
                  <span>Item #</span>
                  <input className="em-input" value={e.item_number}
                         onChange={(ev) => onChangeExtra(e.key, { item_number: ev.target.value })} />
                </label>
                <label className="rr-mini">
                  <span>Arrived</span>
                  <input className="em-input" type="number" min="0" value={e.qty_shipped}
                         onChange={(ev) => onChangeExtra(e.key, { qty_shipped: ev.target.value })} />
                </label>
                <label className="rr-mini">
                  <span>What to do</span>
                  <select className="em-input" value={e.action}
                          onChange={(ev) => onChangeExtra(e.key, { action: ev.target.value })}>
                    <option value="new">Add as a new line</option>
                    {shipmentItems.map((item) => (
                      <option key={item.id} value={String(item.id)}>
                        Count toward {item.item_description || item.item_number || `item ${item.id}`}
                      </option>
                    ))}
                    <option value="skip">Ignore this line</option>
                  </select>
                </label>
                <button type="button" className="sh-btn ghost"
                        onClick={() => onRemoveExtra(e.key)}>Remove</button>
              </div>
            </div>
          ))}
        </section>
      )}

      <h3 className="rr-sub">Check the numbers</h3>
      <div className="rr-rows">
        {items.map((r) => (
          <div key={r.shipment_item_id} className="rr-row">
            <div className="rr-row-head">
              <span className="rr-label">{r.label}</span>
              {r.matched && (
                <span className="rr-tag">
                  {r.matched === 'barcode' ? 'Scanned' : 'Read from slip'}
                </span>
              )}
            </div>
            <div className="rr-fields">
              <label className="rr-mini">
                <span>Ordered</span>
                <input className="em-input" value={r.qty_ordered ?? 0} readOnly tabIndex={-1} />
              </label>
              <label className="rr-mini">
                <span>Arrived</span>
                <input className="em-input" type="number" min="0" value={r.qty_received}
                       onChange={(e) => onChangeItem(r.shipment_item_id, 'qty_received', e.target.value)} />
              </label>
              <label className="rr-mini">
                <span>Coming later</span>
                <input className="em-input" type="number" min="0" value={r.qty_backordered}
                       onChange={(e) => onChangeItem(r.shipment_item_id, 'qty_backordered', e.target.value)} />
              </label>
              <label className="rr-mini">
                <span>Condition</span>
                <select className="em-input" value={r.condition || 'good'}
                        onChange={(e) => onChangeItem(r.shipment_item_id, 'condition', e.target.value)}>
                  {CONDITIONS.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        ))}
      </div>

      <div className="sd-foot">
        <span className="sd-foot-count">
          {totalArrived} arrived{totalLater > 0 ? ` · ${totalLater} to follow` : ''}
        </span>
        <div className="sd-actions">
          <button type="button" className="sh-btn ghost" onClick={onCancel}>Cancel</button>
          <button type="button" className="sh-btn primary" disabled={saving} onClick={onSave}>
            {saving ? 'Saving…' : 'Record this delivery'}
          </button>
        </div>
      </div>
    </div>
  );
}
