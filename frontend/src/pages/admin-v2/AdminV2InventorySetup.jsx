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
import PatientGate from './components/PatientGate';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import { EmSelect } from '../../components/vc/EntityModal';
import { CfgBadge } from './settings/CfgSection';
import '../../components/vc/entity-card.css';
import { BarcodeIcon, XIcon, EquipmentIcon } from '../../components/Icons';
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
    return (
      <AdminV2Layout>
        <div className="admin-v2-page"><p className="cfg-loading">Loading patients...</p></div>
      </AdminV2Layout>
    );
  }
  if (!selectedPatient) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-page">
          <PatientGate message="Choose a patient to set up their inventory." />
        </div>
      </AdminV2Layout>
    );
  }

  const BUCKET_CHIP = {
    match: { label: 'Looks like one of yours', tone: 'live' },
    ready: { label: 'Looks solid', tone: 'ok' },
    review: { label: 'Check this one', tone: 'warn' },
    noise: { label: 'Probably noise', tone: 'alert' },
  };

  const renderCard = (c) => (
    <div key={c.key} className="cfg-card pad">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
        <div className="cfg-crumb-tags">
          {c.itemNumber && <span className="cfg-fine">#{c.itemNumber}</span>}
          {c.uom && <CfgBadge>{c.uom}</CfgBadge>}
          {c.source === 'barcode' && <CfgBadge tone="ok">scanned</CfgBadge>}
          {c.seenOnSlips > 1 && <CfgBadge tone="live">Seen on {c.seenOnSlips} slips</CfgBadge>}
          {c.origin === 'csv' && <CfgBadge>from your file</CfgBadge>}
          {c.origin === 'manual' && <CfgBadge>typed in</CfgBadge>}
        </div>
        <button
          type="button"
          className="cfg-iconbtn"
          onClick={() => setCardAction(c.key, 'skip')}
          title="Skip this one"
          aria-label="Skip this one"
        >
          <XIcon size={14} />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <EmSelect
          aria-label="What to do with this item"
          value={c.action === 'match' ? String(c.equipmentId || '') : c.action}
          onChange={(e) => setCardAction(c.key, e.target.value)}
        >
          <option value="add">Add to my supply list</option>
          <optgroup label="It's one of my supplies…">
            {equipment.map((eq) => (
              <option key={eq.id} value={String(eq.id)}>{eq.name}</option>
            ))}
          </optgroup>
          <option value="skip">Skip it</option>
        </EmSelect>
        {c.action === 'match' && c.matchHow && (
          <CfgBadge tone="live">our best guess — check it</CfgBadge>
        )}

        {c.action === 'add' && (
          <>
            <label className="cfg-fine" style={{ marginBottom: -6 }}>
              What do you call it?
            </label>
            <input
              type="text"
              className="em-input"
              value={c.name}
              placeholder="e.g. Trach ties"
              onChange={(e) => updateCard(c.key, 'name', e.target.value)}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <span style={{ flex: '1 1 120px' }}>
                <EmSelect
                  aria-label="Category"
                  value={c.category}
                  onChange={(e) => updateCard(c.key, 'category', e.target.value)}
                >
                  {CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </EmSelect>
              </span>
              <input
                type="text"
                className="em-input"
                value={c.storageLocation}
                placeholder="Where it lives (Vent shelf…)"
                list="invsetup-locations"
                onChange={(e) => updateCard(c.key, 'storageLocation', e.target.value)}
                style={{ flex: '2 1 160px' }}
              />
              <input
                type="number" min="1" inputMode="numeric"
                className="em-input"
                value={c.unitSize}
                placeholder="Per package"
                title="How many come in one package?"
                onChange={(e) => updateCard(c.key, 'unitSize', e.target.value)}
                style={{ width: 110 }}
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

        {error && <div className="em-error" role="alert">{error}</div>}

        {/* ------------------------------ Step 1 ------------------------------ */}
        {step === 'import' && (
          <section className="cfg">
            <div className="cfg-pagehead"><h2 className="cfg-h1">Let&apos;s build your supply list</h2></div>
            <p className="cfg-pagehead-desc">
              Grab a few recent packing slips — even old ones. We read them; you just check our work.
              Counts come later; this step is only about what you use.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 560 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label className="cfg-fine" htmlFor="invsetup-supplier">
                  Who are these slips from?
                </label>
                <EmSelect
                  id="invsetup-supplier"
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                >
                  <option value="">I&apos;m not sure</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={String(s.id)}>{s.name}</option>
                  ))}
                </EmSelect>
              </div>

              <button type="button" className="em-submit" onClick={() => setScanChooser('slip')}>
                {slips.length ? 'Scan another slip' : 'Scan a packing slip'}
              </button>
              <button type="button" className="em-cancel" onClick={() => setShowCsv(true)}>
                Upload a spreadsheet (CSV)
              </button>
              <button type="button" className="em-cancel" onClick={() => setShowManual((v) => !v)}>
                Type one in myself
              </button>

              {showManual && (
                <div className="cfg-card pad">
                  <input
                    type="text" className="em-input" value={manual.name}
                    placeholder="What do you call it? (required)"
                    onChange={(e) => setManual({ ...manual, name: e.target.value })}
                  />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <input
                      type="text" className="em-input" value={manual.item_number}
                      placeholder="Item # (if you know it)"
                      onChange={(e) => setManual({ ...manual, item_number: e.target.value })}
                      style={{ flex: '1 1 130px' }}
                    />
                    <input
                      type="text" className="em-input" value={manual.storage_location}
                      placeholder="Where it lives"
                      list="invsetup-locations"
                      onChange={(e) => setManual({ ...manual, storage_location: e.target.value })}
                      style={{ flex: '1 1 130px' }}
                    />
                    <input
                      type="number" min="1" className="em-input" value={manual.unit_size}
                      placeholder="Per package"
                      onChange={(e) => setManual({ ...manual, unit_size: e.target.value })}
                      style={{ width: 110 }}
                    />
                  </div>
                  <button type="button" className="em-submit" onClick={addManual} disabled={!manual.name.trim()}>
                    Add it to the pile
                  </button>
                </div>
              )}

              {(slips.length > 0 || extraDrafts.length > 0) && (
                <div className="cfg-crumb-tags">
                  {slips.map((slip, i) => (
                    <CfgBadge key={i} tone="ok">
                      Slip {i + 1} — {slipItemCount(slip)} item{slipItemCount(slip) === 1 ? '' : 's'}
                    </CfgBadge>
                  ))}
                  {extraDrafts.length > 0 && (
                    <CfgBadge tone="ok">{extraDrafts.length} more from file/typing</CfgBadge>
                  )}
                </div>
              )}

              <button
                type="button"
                className="em-submit"
                onClick={() => setScanChooser('review')}
                disabled={slips.length === 0 && extraDrafts.length === 0}
              >
                Done — show me what you found
              </button>
              <button
                type="button"
                className="em-cancel"
                onClick={() => { sessionClear(...sessionKeys()); window.history.back(); }}
              >
                Cancel
              </button>
            </div>
          </section>
        )}

        {/* ------------------------------ Step 2 ------------------------------ */}
        {step === 'review' && cards && (
          <section className="cfg">
            <div className="cfg-pagehead"><h2 className="cfg-h1">Here&apos;s what we found</h2></div>
            <p className="cfg-pagehead-desc">
              One at a time: the slip line we read is on top, what we made of it is
              below. Fix, match, or skip — and if a line is garbled, grab the real
              item and scan the barcode on its box.
            </p>

            {cards.length === 0 ? (
              <p className="cfg-empty">Nothing came through — go back and scan again.</p>
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
                  <div className="cfg-crumb-tags">
                    <strong className="cfg-h1" style={{ fontSize: 13 }}>Item {idx + 1} of {cards.length}</strong>
                    <CfgBadge tone={chip.tone}>{chip.label}</CfgBadge>
                    {c.action === 'skip' && <CfgBadge>skipping this one</CfgBadge>}
                  </div>

                  {/* Evidence: the line OCR was looking at — photo strip first */}
                  <div className="cfg-card pad">
                    <div className="cfg-stat-label">What we saw on the slip</div>
                    {c.image && (
                      // Fixed readable height, swipe sideways for the rest of
                      // the line — a slip row is ~30x wider than it is tall.
                      <div style={{ overflowX: 'auto', borderRadius: 4, background: '#fff' }}>
                        <img
                          src={c.image}
                          alt="The slip line this came from"
                          style={{ height: 48, width: 'auto', maxWidth: 'none', display: 'block' }}
                        />
                      </div>
                    )}
                    <div style={{ fontFamily: 'var(--vc-font-mono)', fontSize: '0.85rem', overflowWrap: 'anywhere' }}>
                      {c.raw
                        || (c.source === 'barcode' ? `Line barcode: ${[c.uom, c.itemNumber].filter(Boolean).join(' ')}` : null)
                        || c.description
                        || 'Nothing readable — just a number fragment.'}
                    </div>
                    {c.source === 'barcode' && c.raw && (
                      <div className="cfg-fine">
                        Plus its line barcode: {[c.uom, c.itemNumber].filter(Boolean).join(' ')}
                      </div>
                    )}
                  </div>

                  {/* Interpretation: what we made of it */}
                  {renderCard(c)}

                  {/* Barcode the physical box — straight into the scanner
                      confirmed on the way in, so a bad read is one tap to redo. */}
                  <div className="cfg-crumb-tags">
                    <button
                      type="button"
                      className="cfg-ghost"
                      onClick={() => {
                        if (reviewScanMode === 'camera') setShowItemScan(true);
                        else if (reviewScanMode === 'external') setShowExternalItem(true);
                        else setScanChooser('item');
                      }}
                    >
                      <BarcodeIcon size={16} /> {c.productBarcode ? "Rescan the item's barcode" : "Scan the item's barcode"}
                    </button>
                    {reviewScanMode && (
                      <button type="button" className="cfg-ghost" onClick={() => setScanChooser('item')}>
                        Switch scanner
                      </button>
                    )}
                    {c.productBarcode && (
                      <CfgBadge tone="ok">box barcode saved · {c.productBarcode}</CfgBadge>
                    )}
                  </div>

                  {/* Forward / back */}
                  <div className="cfg-toolbar">
                    <button type="button" className="em-cancel" disabled={idx === 0} onClick={() => setReviewIndex(idx - 1)}>
                      Back
                    </button>
                    <span className="cfg-fine" style={{ textAlign: 'center' }}>
                      {addCount} adding · {matchCount} matched · {skipCount} skipped
                    </span>
                    <button type="button" className="em-submit" disabled={idx >= cards.length - 1} onClick={() => setReviewIndex(idx + 1)}>
                      Next
                    </button>
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

            <div className="cfg-actions" style={{ marginTop: 14 }}>
              <button
                type="button"
                className="em-submit"
                onClick={handleSaveCatalog}
                disabled={saving || activeCards.length === 0}
              >
                {saving ? 'Saving…' : `Save my supply list (${activeCards.length})`}
              </button>
              <button type="button" className="em-cancel" onClick={() => setStep('import')} disabled={saving}>
                Back — scan more slips
              </button>
            </div>
            {activeCards.length === 0 && cards.length > 0 && (
              <p className="cfg-fine" style={{ marginTop: 8 }}>
                Everything is set to skip — nothing would be saved.
              </p>
            )}
          </section>
        )}

        {/* ------------------------------ Step 3 ------------------------------ */}
        {step === 'count' && (
          <section className="cfg">
            <div className="cfg-pagehead"><h2 className="cfg-h1">Now the closet: count what you have</h2></div>
            <p className="cfg-pagehead-desc">
              Packages first, then loose ones. Skip anything you can&apos;t reach today —
              you can always count later from the Supplies page.
            </p>

            {countRows().length === 0 ? (
              <p className="cfg-empty">Nothing to count yet — add some supplies first.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {countRows().map((eq) => {
                  const fields = countFieldsFor(eq);
                  const saved = counts[eq.id]?.saved;
                  return (
                    <div key={eq.id} className="cfg-card pad">
                      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                        <div>
                          <strong>{eq.name}</strong>
                          {eq.storage_location && (
                            <span className="cfg-fine" style={{ marginLeft: 8 }}>{eq.storage_location}</span>
                          )}
                        </div>
                        {saved && <CfgBadge tone="ok">counted</CfgBadge>}
                      </div>
                      <SupplyCountFields
                        value={fields}
                        onChange={(v) => setCountFields(eq.id, v)}
                        disabled={savingCountId === eq.id}
                      />
                      <div className="cfg-actions">
                        <button
                          type="button"
                          className="cfg-ghost"
                          onClick={() => saveCount(eq)}
                          disabled={savingCountId === eq.id}
                        >
                          {savingCountId === eq.id ? 'Saving…' : saved ? 'Save again' : 'Save count'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div
              className="cfg-toolbar"
              style={{ position: 'sticky', bottom: 0, background: 'var(--vc-bg-base)', padding: '10px 0', marginTop: 12 }}
            >
              <span className="cfg-fine">
                {savedCount} counted · {Math.max(0, countRows().length - savedCount)} left
              </span>
              <button type="button" className="em-submit" onClick={finish}>Finish up</button>
            </div>
          </section>
        )}

        {/* ------------------------------ Step 4 ------------------------------ */}
        {step === 'done' && (
          <div className="cfg-nopatient">
            <EquipmentIcon size={48} />
            <h2>All set</h2>
            <p>
              Your supply list is ready. From now on, when a delivery arrives you just
              scan the slip and confirm the numbers.
            </p>
            <div className="cfg-actions">
              <Link className="em-submit" to={`/care/equipment/inventory?patient=${patientId}`}>
                See what&apos;s on hand
              </Link>
              <Link className="em-cancel" to={`/care/equipment/shipments?patient=${patientId}`}>
                Go to deliveries
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
