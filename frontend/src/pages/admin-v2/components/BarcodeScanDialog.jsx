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
// Single-barcode scanner: point the camera at the barcode on the item's own
// box (retail UPC/EAN or Code 128) and hand the first read back to the
// caller. Live camera where available; photo fallback everywhere (iOS over
// LAN HTTP has no camera API — same constraint as PackingSlipCapture).
import React, { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CameraIcon } from '../../../components/Icons';

const SCAN_INTERVAL_MS = 500;

export default function BarcodeScanDialog({ open, onClose, onFound, title = 'Scan the item barcode' }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const foundRef = useRef(false); // stop after the first read
  const takePhotoInputRef = useRef(null);
  const cameraRollInputRef = useRef(null);

  const [cameraError, setCameraError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const report = (value) => {
    if (foundRef.current || !value) return;
    foundRef.current = true;
    onFound?.(value);
    onClose?.();
  };

  useEffect(() => {
    if (!open) return undefined;
    foundRef.current = false;
    setError(null);
    let cancelled = false;

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('camera-unavailable');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        timerRef.current = setInterval(async () => {
          const video = videoRef.current;
          if (!video || video.readyState < 2 || foundRef.current) return;
          try {
            const { detectBarcodes, PRODUCT_BARCODE_FORMATS } = await import('../../../lib/slipScanner');
            const found = await detectBarcodes(video, PRODUCT_BARCODE_FORMATS);
            if (found.length) report(found[0]);
          } catch { /* keep scanning */ }
        }, SCAN_INTERVAL_MS);
      } catch {
        setCameraError(
          'The live camera view isn’t available here — no problem. ' +
          'Take a photo of the barcode below and we’ll read it the same way.'
        );
      }
    })();

    return () => {
      cancelled = true;
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <Dialog open onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent className="sm:max-w-[440px]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

        {cameraError ? (
          <Alert><AlertDescription>{cameraError}</AlertDescription></Alert>
        ) : (
          <div className="relative overflow-hidden rounded-lg border border-border bg-black">
            <video ref={videoRef} playsInline muted className="w-full" />
            <div className="absolute inset-x-0 bottom-0 bg-black/60 p-2 text-center text-sm text-white">
              Hold the barcode on the box in view — it reads on its own.
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {cameraError && (
            <Button size="lg" onClick={() => takePhotoInputRef.current?.click()} disabled={busy}>
              <CameraIcon size={16} /> {busy ? 'Reading…' : 'Take a photo of the barcode'}
            </Button>
          )}
          <Button variant="secondary" onClick={() => cameraRollInputRef.current?.click()} disabled={busy}>
            Choose from your camera roll
          </Button>
          <input
            ref={takePhotoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChosen}
          />
          <input
            ref={cameraRollInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChosen}
          />
          <Button variant="ghost" onClick={() => onClose?.()} disabled={busy}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
