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
// Single-barcode scanner: photograph the barcode on the item's own box
// (retail UPC/EAN or Code 128) and hand the first read back to the caller.
import { useEffect, useRef, useState } from 'react';
import EntityModal from '../../../components/vc/EntityModal';
import { CameraIcon } from '../../../components/Icons';

export default function BarcodeScanDialog({ open, onClose, onFound, title = 'Scan the item barcode' }) {
  const foundRef = useRef(false); // stop after the first read
  const takePhotoInputRef = useRef(null);
  const cameraRollInputRef = useRef(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const report = (value) => {
    if (foundRef.current || !value) return;
    foundRef.current = true;
    onFound?.(value);
    onClose?.();
  };

  useEffect(() => {
    if (!open) return;
    foundRef.current = false;
    setError(null);
  }, [open]);

  const handleFileChosen = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setBusy(true);
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
      const { detectBarcodes, PRODUCT_BARCODE_FORMATS } = await import('../../../lib/slipScanner');
      const found = await detectBarcodes(canvas, PRODUCT_BARCODE_FORMATS);
      if (found.length) {
        report(found[0]);
      } else {
        setError("We couldn't find a barcode in that photo. Get closer and keep it flat.");
      }
    } catch {
      setError("We couldn't read that photo. Try another one.");
    } finally {
      URL.revokeObjectURL(url);
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <EntityModal open onOpenChange={(o) => { if (!o) onClose?.(); }} title={title}>
      <div className="em-form">
        {error && <div className="em-error" role="alert">{error}</div>}

        <p className="em-hint">
          Take a photo of the barcode on the box — get close and keep it flat.
        </p>

        <button
          type="button"
          className="em-submit"
          onClick={() => takePhotoInputRef.current?.click()}
          disabled={busy}
        >
          <CameraIcon size={16} /> {busy ? 'Reading…' : 'Take a photo of the barcode'}
        </button>
        <button
          type="button"
          className="em-cancel"
          onClick={() => cameraRollInputRef.current?.click()}
          disabled={busy}
        >
          Choose from your camera roll
        </button>
        <input
          ref={takePhotoInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={handleFileChosen}
        />
        <input
          ref={cameraRollInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileChosen}
        />
        <button type="button" className="em-cancel" onClick={() => onClose?.()} disabled={busy}>
          Cancel
        </button>
      </div>
    </EntityModal>
  );
}
