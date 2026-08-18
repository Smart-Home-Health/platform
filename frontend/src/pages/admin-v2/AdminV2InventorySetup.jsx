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
// Initial Inventory Setup wizard: turn a stack of old packing slips (or a
// CSV, or typing) into a clean supply catalog, then count what's actually
// on the shelf. OCR/barcodes seed the CATALOG; humans confirm COUNTS.
//
// Four steps, state-machine-in-a-page (same idiom as the shipment import
// flow): import -> review -> count -> done. Every piece of state is
// checkpointed to sessionStorage — iOS discards backgrounded tabs on Photos
// trips and reloads the SPA, so the wizard must survive a reload anywhere.
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { BarcodeIcon, CheckIcon, PlusIcon, XIcon, EquipmentIcon } from '../../components/Icons';
import PackingSlipCapture from './components/PackingSlipCapture';
import CsvItemImport from './components/CsvItemImport';
import SupplyCountFields from './components/SupplyCountFields';
import BarcodeScanDialog from './components/BarcodeScanDialog';
import ScannerChoiceDialog from './components/ScannerChoiceDialog';
import ExternalScanDialog from './components/ExternalScanDialog';
import { equipmentService } from '../../services/equipment';
import { sessionGet, sessionSet, sessionClear } from '../../lib/sessionState';
import {
  groupSlipLines,
  classifyLines,
  friendlyName,
  cardToImportItem,
  countTotal,
} from '../../lib/catalogImport';
import { equipmentNumberIndex } from '../../lib/slipScanner';
import { CSV_EQUIPMENT_FIELDS, EQUIPMENT_HEADER_PATTERNS, buildEquipmentFromCsv } from '../../lib/csvImport';
import config, { apiFetch } from '../../config';
import './AdminV2.css';

const CATEGORY_OPTIONS = [
  { value: 'supply', label: 'Supply' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'consumable', label: 'Consumable' },
];

const EMPTY_MANUAL = { name: '', item_number: '', storage_location: '', unit_size: '' };

const AdminV2InventorySetup = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    patients,
    selectedPatient: contextPatient,
    selectPatient: setContextPatient,
    loadingPatients,
  } = useAdminPatient();
  const selectedPatient = contextPatient;
  const patientId = selectedPatient?.id ?? null;

  // --- Wizard state ---------------------------------------------------------
  const [step, setStep] = useState('import'); // import | review | count | done
  const [slips, setSlips] = useState([]);          // [{ barcodes, ocrItems }] per captured slip
  const [extraDrafts, setExtraDrafts] = useState([]); // CSV/manual rows (equipment-shaped)
  const [cards, setCards] = useState(null);        // review cards with user edits
  const [importResult, setImportResult] = useState(null); // { created, matched } from catalog-import
  const [counts, setCounts] = useState({});        // equipmentId -> { packages, perPackage, loose, saved }
  const [supplierId, setSupplierId] = useState('');

  const [equipment, setEquipment] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [showCapture, setShowCapture] = useState(false);
  const [showCsv, setShowCsv] = useState(false);
  const [manual, setManual] = useState(EMPTY_MANUAL);
  const [showManual, setShowManual] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingCountId, setSavingCountId] = useState(null);
  const [error, setError] = useState(null);
  const [reviewIndex, setReviewIndex] = useState(0); // which card is in view
  const [showItemScan, setShowItemScan] = useState(false); // barcode-the-box dialog
  const [scanChooser, setScanChooser] = useState(null); // null | 'slip' | 'item' | 'review' — which scan asked camera-vs-external
  const [showExternalSlip, setShowExternalSlip] = useState(false); // wedge-scan slip line barcodes
  const [showExternalItem, setShowExternalItem] = useState(false); // wedge-scan the box barcode
  // Camera-vs-external for review is confirmed ONCE on the way in (16 cards =
  // 16 scans; asking per item was miserable) and sticks for the whole session.
  const [reviewScanMode, setReviewScanMode] = useState(null); // null | 'camera' | 'external'

  // --- Session persistence ----------------------------------------------------
  const keyBase = `invsetup:${patientId}`;
  const sessionKeys = () => [
    `${keyBase}:step`, `${keyBase}:slips`, `${keyBase}:extras`, `${keyBase}:cards`,
    `${keyBase}:import`, `${keyBase}:counts`, `${keyBase}:supplier`,
    `${keyBase}:capture`, `${keyBase}:scan`, `${keyBase}:reviewIdx`,
    `${keyBase}:scanmode`,
  ];
  const sessionRestoredRef = useRef(false);

  useEffect(() => {
    if (!patientId || sessionRestoredRef.current) return;
    sessionRestoredRef.current = true;
    const savedSlips = sessionGet(`${keyBase}:slips`);
    if (savedSlips) setSlips(savedSlips);
    const savedExtras = sessionGet(`${keyBase}:extras`);
    if (savedExtras) setExtraDrafts(savedExtras);
    const savedCards = sessionGet(`${keyBase}:cards`);
    if (savedCards) setCards(savedCards);
    const savedImport = sessionGet(`${keyBase}:import`);
    if (savedImport) setImportResult(savedImport);
    const savedCounts = sessionGet(`${keyBase}:counts`);
    if (savedCounts) setCounts(savedCounts);
    const savedSupplier = sessionGet(`${keyBase}:supplier`);
    if (savedSupplier) setSupplierId(savedSupplier);
    const savedIdx = sessionGet(`${keyBase}:reviewIdx`);
    if (savedIdx != null && savedCards) setReviewIndex(Math.min(savedIdx, savedCards.length - 1));
    const savedScanMode = sessionGet(`${keyBase}:scanmode`);
    if (savedScanMode) setReviewScanMode(savedScanMode);
    if (sessionGet(`${keyBase}:capture`)?.open) setShowCapture(true);
    // Where to land:
    // - ?step=count is the "Count my supplies" deep link — the URL itself
    //   survives reloads, so it always wins and is never session-persisted.
    // - a saved step only resumes genuinely in-progress wizard work: review,
    //   or count reached through a catalog save. A leftover 'count' from a
    //   standalone counting session must NOT hijack "Set up my supply list".
    const savedStep = sessionGet(`${keyBase}:step`);
    if (searchParams.get('step') === 'count') {
      setStep('count');
    } else if (savedStep === 'review' || (savedStep === 'count' && savedImport)) {
      setStep(savedStep);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  const persist = (key, value) => {
    if (sessionRestoredRef.current) sessionSet(`${keyBase}:${key}`, value);
  };

  const stripImages = (rows) => (rows || []).map((row) => {
    const copy = { ...row };
    delete copy.image;
    return copy;
  });
  /* eslint-disable react-hooks/exhaustive-deps */
  // Only persist steps that resume in-progress wizard work: 'review', or
  // 'count' reached through a catalog save. 'import' is the default, 'done'
  // is terminal (finish() just cleared the session), and deep-linked count
  // mode lives in the URL — persisting any of those would resurrect a dead
  // wizard on the next plain "Set up my supply list" entry.
  useEffect(() => {
    const resumable = step === 'review' || (step === 'count' && !!importResult);
    persist('step', resumable ? step : null);
  }, [step, importResult]);
  // Line-strip photos never go into sessionStorage (quota) — after a reload
  // the evidence box falls back to the OCR text.
  useEffect(() => {
    persist('slips', slips.length
      ? slips.map((s) => ({ ...s, ocrItems: stripImages(s.ocrItems) }))
      : null);
  }, [slips]);
  useEffect(() => { persist('extras', extraDrafts.length ? extraDrafts : null); }, [extraDrafts]);
  useEffect(() => { persist('cards', cards ? stripImages(cards) : null); }, [cards]);
  useEffect(() => { persist('import', importResult); }, [importResult]);
  useEffect(() => { persist('counts', Object.keys(counts).length ? counts : null); }, [counts]);
  useEffect(() => { persist('supplier', supplierId || null); }, [supplierId]);
  useEffect(() => { persist('capture', showCapture ? { open: true } : null); }, [showCapture]);
  useEffect(() => { persist('reviewIdx', cards ? reviewIndex : null); }, [reviewIndex, cards]);
  useEffect(() => { persist('scanmode', reviewScanMode); }, [reviewScanMode]);
  /* eslint-enable react-hooks/exhaustive-deps */

  // --- Patient context <-> URL sync (standard admin-v2 pattern) --------------
  useEffect(() => {
    const pid = searchParams.get('patient');
    if (pid && patients.length > 0) {
      const patient = patients.find((p) => p.id === parseInt(pid));
      if (patient && patient.id !== contextPatient?.id) setContextPatient(patient);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, patients]);

  useEffect(() => {
    if (contextPatient && searchParams.get('patient') !== String(contextPatient.id)) {
      const next = { patient: contextPatient.id };
      if (searchParams.get('step')) next.step = searchParams.get('step');
      setSearchParams(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextPatient]);

  // --- Data -------------------------------------------------------------------
  const fetchEquipment = async () => {
    if (!patientId) return [];
    try {
      const list = await equipmentService.list(patientId);
      setEquipment(list);
      return list;
    } catch {
      return [];
    }
  };

  useEffect(() => {
    if (patientId) fetchEquipment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  useEffect(() => {
    (async () => {
      try {
        const response = await apiFetch(`${config.apiUrl}/api/businesses?type=dme`);
        if (response.ok) {
          const data = await response.json();
          setSuppliers(data.businesses || data || []);
        }
      } catch { /* provider select degrades to "I'm not sure" */ }
    })();
  }, []);

  // --- Step 1: bring supplies in ----------------------------------------------
  const handleScanComplete = ({ barcodes, ocrItems }) => {
    if (barcodes.length || ocrItems.length) {
      setSlips((prev) => [...prev, { barcodes, ocrItems }]);
    }
    sessionSet(`${keyBase}:scan`, null); // this slip is banked; clear the scratchpad
    setShowCapture(false);
  };

  const handleCsvRows = (rows) => {
    setExtraDrafts((prev) => [...prev, ...rows.map((r) => ({ ...r, origin: 'csv' }))]);
    return { count: rows.length };
  };

  const addManual = () => {
    if (!manual.name.trim()) return;
    setExtraDrafts((prev) => [...prev, {
      name: manual.name.trim(),
      item_number: manual.item_number.trim() || null,
      storage_location: manual.storage_location.trim() || null,
      unit_size: manual.unit_size ? parseInt(manual.unit_size, 10) || null : null,
      origin: 'manual',
    }]);
    setManual(EMPTY_MANUAL);
  };

  const slipItemCount = (slip) => {
    const nums = new Set((slip.ocrItems || []).map((o) => o.itemNumber));
    (slip.barcodes || []).forEach((b) => {
      const m = /^\/?I[A-Z]{2}([0-9A-Z-]{4,})$/.exec((b || '').trim());
      if (m) nums.add(m[1]);
    });
    return nums.size;
  };

  // Review order: confident stuff first, then the shaky OCR, noise last —
  // the navigator walks this sequence one card at a time.
  const BUCKET_RANK = { match: 0, ready: 1, review: 2, noise: 3 };

  const buildReviewCards = () => {
    const classified = classifyLines(groupSlipLines(slips), equipment);
    const scanCards = classified.map((line) => ({
      key: `scan-${line.itemNumber}`,
      origin: 'scan',
      bucket: line.bucket,
      action: line.action,
      itemNumber: line.itemNumber || '',
      uom: line.uom || '',
      description: line.description || '',
      raw: line.raw || '',
      image: line.image || null,
      name: line.bucket === 'match' ? '' : friendlyName(line.description),
      category: 'supply',
      unitSize: '',
      storageLocation: '',
      equipmentId: line.suggestedEquipmentId,
      matchHow: line.matchHow,
      seenOnSlips: line.seenOnSlips,
      source: line.source,
    }));
    const extraCards = extraDrafts.map((d, i) => {
      const [line] = classifyLines([{
        itemNumber: (d.item_number || '').trim(),
        description: d.raw_description || d.name || '',
        source: 'csv',
        seenOnSlips: 1,
      }], equipment);
      const matched = line.bucket === 'match';
      return {
        key: `extra-${i}`,
        origin: d.origin,
        bucket: matched ? 'match' : 'ready',
        action: matched ? 'match' : 'add',
        itemNumber: d.item_number || '',
        uom: d.unit_of_measure || '',
        description: d.raw_description || '',
        name: d.name || '',
        category: 'supply',
        unitSize: d.unit_size != null ? String(d.unit_size) : '',
        storageLocation: d.storage_location || '',
        quantity: d.quantity,
        reorderPoint: d.reorder_point,
        parLevel: d.par_level,
        equipmentId: line.suggestedEquipmentId,
        matchHow: line.matchHow,
        seenOnSlips: 1,
        source: d.origin,
      };
    });
    const all = [...scanCards, ...extraCards]
      .sort((a, b) => (BUCKET_RANK[a.bucket] ?? 4) - (BUCKET_RANK[b.bucket] ?? 4));
    setCards(all);
    setReviewIndex(0);
    setStep('review');
  };

  // --- Step 2: review ----------------------------------------------------------
  const updateCard = (key, field, value) => {
    setCards((prev) => prev.map((c) => (c.key === key ? { ...c, [field]: value } : c)));
  };

  const setCardAction = (key, value) => {
    setCards((prev) => prev.map((c) => {
      if (c.key !== key) return c;
      if (value === 'add') {
        return { ...c, action: 'add', name: c.name || friendlyName(c.description) };
      }
      if (value === 'skip') return { ...c, action: 'skip' };
      // numeric value = "It's one of my supplies" pick
      return { ...c, action: 'match', equipmentId: parseInt(value, 10) };
    }));
  };

  const activeCards = (cards || []).filter((c) => c.action !== 'skip');
  const namelessAdds = activeCards.filter((c) => c.action === 'add' && !(c.name || '').trim());
  const matchlessMatches = activeCards.filter((c) => c.action === 'match' && !c.equipmentId);

  // "Scan the item itself": read the UPC/EAN off the physical box and pin it
  // to the card in view. If the code is already known (primary number or any
  // alias), the card flips straight to a match — the DB just recognized it.
  const handleItemBarcode = (key) => (value) => {
    const known = equipmentNumberIndex(equipment).get((value || '').trim());
    setCards((prev) => prev.map((c) => {
      if (c.key !== key) return c;
      const next = { ...c, productBarcode: value };
      if (known) {
        next.action = 'match';
        next.equipmentId = known.id;
        next.matchHow = 'number';
      }
      return next;
    }));
  };

  const handleSaveCatalog = async () => {
    setError(null);
    if (namelessAdds.length > 0) {
      setError(`${namelessAdds.length} new suppl${namelessAdds.length === 1 ? 'y still needs' : 'ies still need'} a name — it's how they'll show up everywhere.`);
      return;
    }
    if (matchlessMatches.length > 0) {
      setError(`${matchlessMatches.length} card${matchlessMatches.length === 1 ? ' is' : 's are'} set to "one of my supplies" but none is picked.`);
      return;
    }
    setSaving(true);
    try {
      const items = activeCards.map((c) => {
        const item = cardToImportItem(c);
        if (c.quantity != null) item.quantity = c.quantity;
        if (c.reorderPoint != null) item.reorder_point = c.reorderPoint;
        if (c.parLevel != null) item.par_level = c.parLevel;
        return item;
      });
      const result = await equipmentService.catalogImport({
        patientId,
        supplierId: supplierId ? parseInt(supplierId, 10) : null,
        items,
      });
      if (result.errors?.length) {
        setError(`${result.errors.length} item${result.errors.length === 1 ? '' : 's'} couldn't be saved — the rest went through.`);
      }
      setImportResult({ created: result.created || [], matched: result.matched || [] });
      await fetchEquipment(); // fresh names/unit sizes for the count step
      setStep('count');
    } catch (err) {
      setError(err.message || 'Failed to save the supply list');
    } finally {
      setSaving(false);
    }
  };

  // --- Step 3: count -------------------------------------------------------------
  const countRows = () => {
    if (importResult) {
      const ids = [...importResult.created, ...importResult.matched].map((r) => r.equipment_id);
      const seen = new Set();
      const rows = [];
      for (const eid of ids) {
        if (seen.has(eid)) continue;
        seen.add(eid);
        const eq = equipment.find((e) => e.id === eid);
        if (eq) rows.push(eq);
      }
      return rows;
    }
    // Entered via "Count my supplies": everything tracked for this patient.
    return [...equipment].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  };

  const countFieldsFor = (eq) => counts[eq.id] || {
    packages: '', perPackage: eq.unit_size ? String(eq.unit_size) : '', loose: '',
  };

  const setCountFields = (eqId, value) => {
    setCounts((prev) => ({ ...prev, [eqId]: { ...value, saved: false } }));
  };

  const saveCount = async (eq) => {
    setSavingCountId(eq.id);
    setError(null);
    try {
      const fields = countFieldsFor(eq);
      await equipmentService.setCount(eq.id, {
        quantity: countTotal(fields),
        note: 'Initial inventory setup',
      });
      setCounts((prev) => ({ ...prev, [eq.id]: { ...fields, saved: true } }));
    } catch (err) {
      setError(err.message || 'Failed to save the count');
    } finally {
      setSavingCountId(null);
    }
  };

  const savedCount = Object.values(counts).filter((c) => c.saved).length;

  const finish = () => {
    sessionClear(...sessionKeys());
    setStep('done');
  };

  // --- Render -----------------------------------------------------------------
  if (loadingPatients) {
    return <AdminV2Layout><div className="admin-v2-loading">Loading patients...</div></AdminV2Layout>;
  }
  if (!selectedPatient) {
    return <AdminV2Layout><div className="admin-v2-loading">Select a patient from the sidebar</div></AdminV2Layout>;
  }

  const BUCKET_CHIP = {
    match: { label: 'Looks like one of yours', badge: 'admin-v2-badge-info' },
    ready: { label: 'Looks solid', badge: 'admin-v2-badge-success' },
    review: { label: 'Check this one', badge: 'admin-v2-badge-warning' },
    noise: { label: 'Probably noise', badge: 'admin-v2-badge-danger' },
  };

  const renderCard = (c) => (
    <div key={c.key} className="admin-v2-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {c.itemNumber && <span className="admin-v2-text-muted">#{c.itemNumber}</span>}
          {c.uom && <span className="admin-v2-badge">{c.uom}</span>}
          {c.source === 'barcode' && (
            <span className="admin-v2-badge admin-v2-badge-success"><CheckIcon size={12} /> scanned</span>
          )}
          {c.seenOnSlips > 1 && (
            <span className="admin-v2-badge admin-v2-badge-info">Seen on {c.seenOnSlips} slips</span>
          )}
          {c.origin === 'csv' && <span className="admin-v2-badge">from your file</span>}
          {c.origin === 'manual' && <span className="admin-v2-badge">typed in</span>}
        </div>
        <button
          className="admin-v2-btn admin-v2-btn-sm admin-v2-btn-secondary"
          onClick={() => setCardAction(c.key, 'skip')}
          title="Skip this one"
        >
          <XIcon size={14} />
        </button>
      </div>

      <div className="tw" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <select
          value={c.action === 'match' ? String(c.equipmentId || '') : c.action}
          onChange={(e) => setCardAction(c.key, e.target.value)}
          style={{ width: '100%', padding: '8px' }}
        >
          <option value="add">Add to my supply list</option>
          <optgroup label="It's one of my supplies…">
            {equipment.map((eq) => (
              <option key={eq.id} value={String(eq.id)}>{eq.name}</option>
            ))}
          </optgroup>
          <option value="skip">Skip it</option>
        </select>
        {c.action === 'match' && c.matchHow && (
          <span className="admin-v2-badge admin-v2-badge-info" style={{ alignSelf: 'flex-start' }}>
            our best guess — check it
          </span>
        )}

        {c.action === 'add' && (
          <>
            <label className="admin-v2-text-muted" style={{ fontSize: '0.75rem', marginBottom: -6 }}>
              What do you call it?
            </label>
            <input
              type="text"
              value={c.name}
              placeholder="e.g. Trach ties"
              onChange={(e) => updateCard(c.key, 'name', e.target.value)}
              style={{ width: '100%', padding: '8px' }}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <select
                value={c.category}
                onChange={(e) => updateCard(c.key, 'category', e.target.value)}
                style={{ padding: '8px', flex: '1 1 120px' }}
              >
                {CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <input
                type="text"
                value={c.storageLocation}
                placeholder="Where it lives (Vent shelf…)"
                list="invsetup-locations"
                onChange={(e) => updateCard(c.key, 'storageLocation', e.target.value)}
                style={{ padding: '8px', flex: '2 1 160px' }}
              />
              <input
                type="number" min="1" inputMode="numeric"
                value={c.unitSize}
                placeholder="Per package"
                title="How many come in one package?"
                onChange={(e) => updateCard(c.key, 'unitSize', e.target.value)}
                style={{ padding: '8px', width: 110 }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        <datalist id="invsetup-locations">
          {[...new Set(equipment.map((e) => e.storage_location).filter(Boolean))].map((loc) => (
            <option key={loc} value={loc} />
          ))}
        </datalist>

        {error && (
          <div className="tw" style={{ marginBottom: 12 }}>
            <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
          </div>
        )}

        {/* ------------------------------ Step 1 ------------------------------ */}
        {step === 'import' && (
          <div className="admin-v2-section">
            <div className="admin-v2-section-header"><h2>Let's build your supply list</h2></div>
            <p className="admin-v2-text-muted">
              Grab a few recent packing slips — even old ones. We read them; you just check our work.
              Counts come later; this step is only about what you use.
            </p>

            <div className="tw" style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 560 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label className="admin-v2-text-muted" style={{ fontSize: '0.8rem' }}>
                  Who are these slips from?
                </label>
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  style={{ padding: '10px', width: '100%' }}
                >
                  <option value="">I'm not sure</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={String(s.id)}>{s.name}</option>
                  ))}
                </select>
              </div>

              <Button size="lg" onClick={() => setScanChooser('slip')}>
                <BarcodeIcon size={16} /> {slips.length ? 'Scan another slip' : 'Scan a packing slip'}
              </Button>
              <Button variant="secondary" size="lg" onClick={() => setShowCsv(true)}>
                Upload a spreadsheet (CSV)
              </Button>
              <Button variant="secondary" size="lg" onClick={() => setShowManual((v) => !v)}>
                <PlusIcon size={16} /> Type one in myself
              </Button>

              {showManual && (
                <div className="admin-v2-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input
                    type="text" value={manual.name} placeholder="What do you call it? (required)"
                    onChange={(e) => setManual({ ...manual, name: e.target.value })}
                    style={{ padding: '8px' }}
                  />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <input
                      type="text" value={manual.item_number} placeholder="Item # (if you know it)"
                      onChange={(e) => setManual({ ...manual, item_number: e.target.value })}
                      style={{ padding: '8px', flex: '1 1 130px' }}
                    />
                    <input
                      type="text" value={manual.storage_location} placeholder="Where it lives"
                      list="invsetup-locations"
                      onChange={(e) => setManual({ ...manual, storage_location: e.target.value })}
                      style={{ padding: '8px', flex: '1 1 130px' }}
                    />
                    <input
                      type="number" min="1" value={manual.unit_size} placeholder="Per package"
                      onChange={(e) => setManual({ ...manual, unit_size: e.target.value })}
                      style={{ padding: '8px', width: 110 }}
                    />
                  </div>
                  <Button onClick={addManual} disabled={!manual.name.trim()}>
                    <PlusIcon size={16} /> Add it to the pile
                  </Button>
                </div>
              )}

              {(slips.length > 0 || extraDrafts.length > 0) && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {slips.map((slip, i) => (
                    <span key={i} className="admin-v2-badge admin-v2-badge-success">
                      Slip {i + 1} — {slipItemCount(slip)} item{slipItemCount(slip) === 1 ? '' : 's'}
                    </span>
                  ))}
                  {extraDrafts.length > 0 && (
                    <span className="admin-v2-badge admin-v2-badge-success">
                      {extraDrafts.length} more from file/typing
                    </span>
                  )}
                </div>
              )}

              <Button
                size="lg"
                onClick={() => setScanChooser('review')}
                disabled={slips.length === 0 && extraDrafts.length === 0}
              >
                Done — show me what you found
              </Button>
              <Button variant="ghost" onClick={() => { sessionClear(...sessionKeys()); window.history.back(); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* ------------------------------ Step 2 ------------------------------ */}
        {step === 'review' && cards && (
          <div className="admin-v2-section">
            <div className="admin-v2-section-header"><h2>Here's what we found</h2></div>
            <p className="admin-v2-text-muted">
              One at a time: the slip line we read is on top, what we made of it is
              below. Fix, match, or skip — and if a line is garbled, grab the real
              item and scan the barcode on its box.
            </p>

            {cards.length === 0 ? (
              <p className="admin-v2-text-muted">Nothing came through — go back and scan again.</p>
            ) : (() => {
              const idx = Math.min(reviewIndex, cards.length - 1);
              const c = cards[idx];
              const chip = BUCKET_CHIP[c.bucket] || BUCKET_CHIP.ready;
              const addCount = (cards || []).filter((x) => x.action === 'add').length;
              const matchCount = (cards || []).filter((x) => x.action === 'match').length;
              const skipCount = cards.length - addCount - matchCount;
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 560 }}>
                  {/* Position + confidence */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <strong>Item {idx + 1} of {cards.length}</strong>
                    <span className={`admin-v2-badge ${chip.badge}`}>{chip.label}</span>
                    {c.action === 'skip' && <span className="admin-v2-badge">skipping this one</span>}
                  </div>

                  {/* Evidence: the line OCR was looking at — photo strip first */}
                  <div className="admin-v2-card" style={{ padding: 12 }}>
                    <div className="admin-v2-text-muted" style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                      What we saw on the slip
                    </div>
                    {c.image && (
                      // Fixed readable height, swipe sideways for the rest of
                      // the line — a slip row is ~30x wider than it is tall.
                      <div style={{ overflowX: 'auto', marginBottom: 8, borderRadius: 6, background: '#fff' }}>
                        <img
                          src={c.image}
                          alt="The slip line this came from"
                          style={{ height: 48, width: 'auto', maxWidth: 'none', display: 'block' }}
                        />
                      </div>
                    )}
                    <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.85rem', overflowWrap: 'anywhere' }}>
                      {c.raw
                        || (c.source === 'barcode' ? `Line barcode: ${[c.uom, c.itemNumber].filter(Boolean).join(' ')}` : null)
                        || c.description
                        || 'Nothing readable — just a number fragment.'}
                    </div>
                    {c.source === 'barcode' && c.raw && (
                      <div className="admin-v2-text-muted" style={{ fontSize: '0.78rem', marginTop: 4 }}>
                        Plus its line barcode: {[c.uom, c.itemNumber].filter(Boolean).join(' ')}
                      </div>
                    )}
                  </div>

                  {/* Interpretation: what we made of it */}
                  {renderCard(c)}

                  {/* Barcode the physical box — straight into the scanner
                      confirmed on the way in, so a bad read is one tap to redo. */}
                  <div className="tw flex flex-wrap items-center gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        if (reviewScanMode === 'camera') setShowItemScan(true);
                        else if (reviewScanMode === 'external') setShowExternalItem(true);
                        else setScanChooser('item');
                      }}
                    >
                      <BarcodeIcon size={16} /> {c.productBarcode ? "Rescan the item's barcode" : "Scan the item's barcode"}
                    </Button>
                    {reviewScanMode && (
                      <Button variant="ghost" size="sm" onClick={() => setScanChooser('item')}>
                        Switch scanner
                      </Button>
                    )}
                    {c.productBarcode && (
                      <span className="admin-v2-badge admin-v2-badge-success">
                        <CheckIcon size={12} /> box barcode saved · {c.productBarcode}
                      </span>
                    )}
                  </div>

                  {/* Forward / back */}
                  <div className="tw flex items-center gap-2" style={{ justifyContent: 'space-between' }}>
                    <Button variant="secondary" size="lg" disabled={idx === 0} onClick={() => setReviewIndex(idx - 1)}>
                      Back
                    </Button>
                    <span className="admin-v2-text-muted" style={{ fontSize: '0.8rem', textAlign: 'center' }}>
                      {addCount} adding · {matchCount} matched · {skipCount} skipped
                    </span>
                    <Button size="lg" disabled={idx >= cards.length - 1} onClick={() => setReviewIndex(idx + 1)}>
                      Next
                    </Button>
                  </div>

                  <BarcodeScanDialog
                    open={showItemScan}
                    onClose={() => setShowItemScan(false)}
                    onFound={handleItemBarcode(c.key)}
                  />
                  <ExternalScanDialog
                    open={showExternalItem}
                    onClose={() => setShowExternalItem(false)}
                    title="Scan the item's barcode"
                    onFound={handleItemBarcode(c.key)}
                  />
                </div>
              );
            })()}

            <div className="tw flex flex-wrap gap-2" style={{ marginTop: 14 }}>
              <Button size="lg" onClick={handleSaveCatalog} disabled={saving || activeCards.length === 0}>
                <CheckIcon size={16} /> {saving ? 'Saving…' : `Save my supply list (${activeCards.length})`}
              </Button>
              <Button variant="secondary" onClick={() => setStep('import')} disabled={saving}>
                Back — scan more slips
              </Button>
            </div>
            {activeCards.length === 0 && cards.length > 0 && (
              <p className="admin-v2-text-muted" style={{ marginTop: 8 }}>
                Everything is set to skip — nothing would be saved.
              </p>
            )}
          </div>
        )}

        {/* ------------------------------ Step 3 ------------------------------ */}
        {step === 'count' && (
          <div className="admin-v2-section">
            <div className="admin-v2-section-header"><h2>Now the closet: count what you have</h2></div>
            <p className="admin-v2-text-muted">
              Packages first, then loose ones. Skip anything you can't reach today —
              you can always count later from the Supplies page.
            </p>

            {countRows().length === 0 ? (
              <p className="admin-v2-text-muted">Nothing to count yet — add some supplies first.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {countRows().map((eq) => {
                  const fields = countFieldsFor(eq);
                  const saved = counts[eq.id]?.saved;
                  return (
                    <div key={eq.id} className="admin-v2-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                        <div>
                          <strong>{eq.name}</strong>
                          {eq.storage_location && (
                            <span className="admin-v2-text-muted" style={{ marginLeft: 8 }}>{eq.storage_location}</span>
                          )}
                        </div>
                        {saved && (
                          <span className="admin-v2-badge admin-v2-badge-success">
                            <CheckIcon size={12} /> counted
                          </span>
                        )}
                      </div>
                      <SupplyCountFields
                        value={fields}
                        onChange={(v) => setCountFields(eq.id, v)}
                        disabled={savingCountId === eq.id}
                      />
                      <div className="tw flex gap-2">
                        <Button
                          onClick={() => saveCount(eq)}
                          disabled={savingCountId === eq.id}
                        >
                          {savingCountId === eq.id ? 'Saving…' : saved ? 'Save again' : 'Save count'}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div
              className="tw flex flex-wrap items-center gap-2"
              style={{ position: 'sticky', bottom: 0, background: 'var(--admin-v2-bg, inherit)', padding: '10px 0', marginTop: 12 }}
            >
              <span className="admin-v2-text-muted">
                {savedCount} counted · {Math.max(0, countRows().length - savedCount)} left
              </span>
              <Button size="lg" onClick={finish}>Finish up</Button>
            </div>
          </div>
        )}

        {/* ------------------------------ Step 4 ------------------------------ */}
        {step === 'done' && (
          <div className="admin-v2-empty-state">
            <EquipmentIcon size={48} />
            <h3>All set</h3>
            <p className="admin-v2-text-muted">
              Your supply list is ready. From now on, when a delivery arrives you just
              scan the slip and confirm the numbers.
            </p>
            <div className="tw flex flex-wrap justify-center gap-2">
              <Link to={`/care/equipment/inventory?patient=${patientId}`}>
                <Button size="lg">See what's on hand</Button>
              </Link>
              <Link to={`/care/equipment/shipments?patient=${patientId}`}>
                <Button variant="secondary" size="lg">Go to deliveries</Button>
              </Link>
            </div>
          </div>
        )}

        {/* key remounts the capture per banked slip so each "Scan another
            slip" starts a fresh accumulation instead of re-counting the
            previous slip's barcodes (the dialog keeps state when closed). */}
        <PackingSlipCapture
          key={slips.length}
          open={showCapture}
          onClose={() => setShowCapture(false)}
          mode="import"
          sessionKey={`${keyBase}:scan`}
          title="Scan a packing slip"
          onComplete={handleScanComplete}
        />
        <ScannerChoiceDialog
          open={scanChooser !== null}
          onClose={() => setScanChooser(null)}
          title={scanChooser === 'review'
            ? 'How will you scan the item boxes?'
            : 'How do you want to scan?'}
          onChoose={(mode) => {
            const target = scanChooser;
            setScanChooser(null);
            if (target === 'slip') {
              if (mode === 'camera') setShowCapture(true); else setShowExternalSlip(true);
              return;
            }
            // Review flows: the answer sticks for every card this session.
            setReviewScanMode(mode);
            if (target === 'review') {
              buildReviewCards();
            } else if (mode === 'camera') {
              setShowItemScan(true);
            } else {
              setShowExternalItem(true);
            }
          }}
        />
        <ExternalScanDialog
          multi
          open={showExternalSlip}
          onClose={() => setShowExternalSlip(false)}
          title="Scan the slip's line barcodes"
          hint="Point your scanner at each little barcode on the packing slip, one line at a time."
          onComplete={(barcodes) => {
            setShowExternalSlip(false);
            handleScanComplete({ barcodes, ocrItems: [] });
          }}
        />
        <CsvItemImport
          open={showCsv}
          onClose={() => setShowCsv(false)}
          title="Import supplies from a CSV"
          targetFields={CSV_EQUIPMENT_FIELDS}
          buildRows={buildEquipmentFromCsv}
          guessOpts={{ patterns: EQUIPMENT_HEADER_PATTERNS, qtyField: 'quantity', descField: 'name' }}
          onImport={async (rows) => handleCsvRows(rows)}
          onDone={() => setShowCsv(false)}
        />
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2InventorySetup;
