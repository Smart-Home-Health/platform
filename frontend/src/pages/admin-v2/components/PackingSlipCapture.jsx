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
// Packing-slip capture: photograph each page of the slip, decode line-item
// barcodes + OCR quantities on-device, and attach the photos to the delivery.
//
// Designed for a phone in one hand and a box of supplies in the other:
// big buttons, plain language, and nothing is final here — the parent
// confirm panel shows an editable review before anything is saved.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CameraIcon, CheckIcon } from '../../../components/Icons';
import { shipmentService } from '../../../services/shipments';
import { sessionGet, sessionSet } from '../../../lib/sessionState';

// Session key for scan accumulation — survives the tab being discarded while
// the user hops to Photos and back (which reloads the SPA on mobile).
const scanKey = (shipmentId) => `scan:${shipmentId}`;

// mode: 'confirm' checks arrivals off against expected items;
//       'import' collects NEW line items from an invoice to add to the shipment.
// shipmentId is optional: without one (e.g. the Initial Inventory Setup
// wizard) pages are read on-device but not uploaded anywhere — pass a
// sessionKey so scan accumulation still survives SPA reloads.
export default function PackingSlipCapture({
  open, onClose, shipmentId = null, expectedItems = [], onComplete, mode = 'confirm',
  sessionKey = null, title = null,
}) {
  const takePhotoInputRef = useRef(null); // capture="environment": opens the camera
  const cameraRollInputRef = useRef(null); // no capture attr: opens the photo picker

  const storageKey = sessionKey || scanKey(shipmentId);

  // Scan accumulation is checkpointed to sessionStorage so a mid-import trip
  // to Photos (which can reload the whole SPA) doesn't lose collected pages.
  const [barcodes, setBarcodes] = useState(() => sessionGet(storageKey)?.barcodes || []);
  const [ocrItems, setOcrItems] = useState(() => sessionGet(storageKey)?.ocrItems || []);
  const [pagesUploaded, setPagesUploaded] = useState(() => sessionGet(storageKey)?.pagesUploaded || 0);
  const [busy, setBusy] = useState(null);             // null | 'reading' | 'uploading'
  const [batch, setBatch] = useState(null);           // { current, total } during a multi-photo pick
  const [error, setError] = useState(null);

  useEffect(() => {
    // Line-strip images are dropped from the checkpoint — data URLs would
    // blow the sessionStorage quota. After a reload the evidence falls back
    // to the OCR text; everything else survives.
    const slim = ocrItems.map((item) => {
      const copy = { ...item };
      delete copy.image;
      return copy;
    });
    sessionSet(storageKey, (barcodes.length || ocrItems.length || pagesUploaded)
      ? { barcodes, ocrItems: slim, pagesUploaded }
      : null);
  }, [storageKey, barcodes, ocrItems, pagesUploaded]);

  const foundItemNumbers = useCallback(async () => {
    const { parseSlipBarcode } = await import('../../../lib/slipScanner');
    return new Set(barcodes.map(parseSlipBarcode).filter(Boolean).map((b) => b.itemNumber));
  }, [barcodes]);

  const [matchedCount, setMatchedCount] = useState(0);
  const [newCount, setNewCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // NEW lines (not on the shipment yet) matter in both modes — a later
      // box often carries backordered items the original slip didn't have.
      const { buildNewItems } = await import('../../../lib/slipScanner');
      const fresh = buildNewItems(barcodes, ocrItems, expectedItems).length;
      let matched = 0;
      if (mode !== 'import') {
        const found = await foundItemNumbers();
        const ocrNumbers = new Set(ocrItems.map((o) => o.itemNumber));
        matched = expectedItems.filter((i) => {
          const num = (i.item_number || '').trim();
          return found.has(num) || ocrNumbers.has(num);
        }).length;
      }
      if (!cancelled) {
        setNewCount(fresh);
        setMatchedCount(mode === 'import' ? fresh : matched);
      }
    })();
    return () => { cancelled = true; };
  }, [barcodes, ocrItems, expectedItems, foundItemNumbers, mode]);

  // --- Page capture (still photo -> barcode + OCR + upload) ---
  // Page numbers via a ref: a multi-photo batch runs inside one closure, so
  // reading the pagesUploaded state would number every page the same.
  const pageCountRef = useRef(pagesUploaded);
  useEffect(() => { pageCountRef.current = pagesUploaded; }, [pagesUploaded]);

  /** Read one canvas (barcodes + OCR + optional upload). Returns true on success. */
  const processCanvas = async (canvas) => {
    setBusy('reading');
    try {
      const { detectBarcodes, ocrImageWithLines, parseSlipText, attachLineImages } = await import('../../../lib/slipScanner');

      // Barcodes want full resolution; OCR gets a downscaled copy so a 12MP
      // phone photo doesn't take ages in the WASM engine.
      const found = await detectBarcodes(canvas);
      if (found.length) setBarcodes((prev) => [...new Set([...prev, ...found])]);

      let ocrCanvas = canvas;
      const MAX_OCR_WIDTH = 2000;
      if (canvas.width > MAX_OCR_WIDTH) {
        const scale = MAX_OCR_WIDTH / canvas.width;
        ocrCanvas = document.createElement('canvas');
        ocrCanvas.width = MAX_OCR_WIDTH;
        ocrCanvas.height = Math.round(canvas.height * scale);
        ocrCanvas.getContext('2d').drawImage(canvas, 0, 0, ocrCanvas.width, ocrCanvas.height);
      }
      const { text, lines } = await ocrImageWithLines(ocrCanvas);
      // Each parsed item carries a cropped strip of the photo it came from,
      // so review UIs can show the evidence, not just our reading of it.
      const parsed = attachLineImages(parseSlipText(text), lines, ocrCanvas);
      if (parsed.length) {
        setOcrItems((prev) => {
          const known = new Set(prev.map((p) => p.itemNumber));
          return [...prev, ...parsed.filter((p) => !known.has(p.itemNumber))];
        });
      }

      const pageNumber = pageCountRef.current + 1;
      if (shipmentId) {
        setBusy('uploading');
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
        await shipmentService.uploadDocument(
          shipmentId,
          new File([blob], `packing-slip-page-${pageNumber}.jpg`, { type: 'image/jpeg' }),
          { pageNumber, title: `Packing slip — page ${pageNumber}` }
        );
      }
      // Without a shipment the counter still tracks pages read on-device.
      pageCountRef.current = pageNumber;
      setPagesUploaded(pageNumber);
      return true;
    } catch (err) {
      setError(err.message || 'Something went wrong reading that page. Try again — good light helps.');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const fileToCanvas = async (file) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    try {
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      return canvas;
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  // The camera-roll input allows multi-select: photograph the whole slip
  // stack first, then bring every page in at once. Photos are read one at a
  // time (the OCR worker is a singleton) with a progress chip.
  const handleFileChosen = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    setError(null);
    let failed = 0;
    for (let i = 0; i < files.length; i += 1) {
      setBatch(files.length > 1 ? { current: i + 1, total: files.length } : null);
      try {
        const canvas = await fileToCanvas(files[i]);
        if (!(await processCanvas(canvas))) failed += 1;
      } catch {
        failed += 1;
      }
    }
    setBatch(null);
    if (failed === files.length) {
      setError(files.length === 1
        ? "We couldn't read that photo. Try another one."
        : "We couldn't read those photos. Try again — good light helps.");
    } else if (failed > 0) {
      setError(`${failed} of ${files.length} photos couldn't be read — the rest went through fine.`);
    }
  };

  const handleDone = async () => {
    const { matchScanToItems } = await import('../../../lib/slipScanner');
    onComplete?.({
      suggestions: matchScanToItems(expectedItems, barcodes, ocrItems),
      barcodes,
      ocrItems,
      pagesUploaded,
    });
  };

  if (!open) return null;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[560px]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{title || (mode === 'import' ? 'Scan the invoice' : 'Scan the packing slip')}</DialogTitle>
        </DialogHeader>

        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

        <p className="text-sm text-muted-foreground">
          {mode === 'import'
            ? 'Take a photo of each page of the sheet — each little barcode adds that item for you.'
            : 'Take a photo of each page of the slip — the little barcodes check items off automatically.'}
        </p>

        {/* Progress: friendly, glanceable */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1">
            <CheckIcon size={13} />{' '}
            {mode === 'import'
              ? `${matchedCount} item${matchedCount === 1 ? '' : 's'} found`
              : `${matchedCount} of ${expectedItems.length} checked off${newCount > 0 ? ` · ${newCount} new` : ''}`}
          </span>
          {pagesUploaded > 0 && (
            <span className="rounded-full bg-secondary px-3 py-1">
              {pagesUploaded} page{pagesUploaded > 1 ? 's' : ''} {shipmentId ? 'saved' : 'read'}
            </span>
          )}
          {(busy || batch) && (
            <span className="rounded-full bg-secondary px-3 py-1 animate-pulse">
              {batch
                ? `Reading photo ${batch.current} of ${batch.total}…`
                : busy === 'reading' ? 'Reading the page…' : 'Saving the photo…'}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Button size="lg" onClick={() => takePhotoInputRef.current?.click()} disabled={!!busy || !!batch}>
            <CameraIcon size={16} /> Take a photo of the page
          </Button>
          <Button variant="secondary" onClick={() => cameraRollInputRef.current?.click()} disabled={!!busy || !!batch}>
            Choose from your camera roll
          </Button>
          {/* capture="environment" jumps straight to the camera (iOS) */}
          <input
            ref={takePhotoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChosen}
          />
          {/* no capture attr -> photo-library picker; multiple = bring the
              whole photographed slip stack in at once */}
          <input
            ref={cameraRollInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileChosen}
          />
          <Button size="lg" variant="default" onClick={handleDone} disabled={!!busy || !!batch}>
            {mode === 'import' ? 'Done — review the items' : 'Done — check the numbers'}
          </Button>
          <Button variant="ghost" onClick={() => onClose?.()}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
