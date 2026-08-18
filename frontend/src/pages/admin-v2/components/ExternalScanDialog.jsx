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
// External (Bluetooth keyboard-wedge) scanner capture. Paired scanners act
// as keyboards: a burst of fast keystrokes, usually ending in Enter (some
// send Tab, some nothing). A focused input catches the burst; Enter/Tab
// commit it, and a short idle timeout commits scanners with no terminator.
// Typing a code by hand and pressing Enter works too. Values are handed
// back RAW — parsing (e.g. the /I slip format) stays with the caller, same
// contract as the camera dialogs.
import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { BarcodeIcon, CheckIcon, XIcon } from '../../../components/Icons';

export const IDLE_COMMIT_MS = 120;     // no-terminator fallback
export const MIN_AUTO_COMMIT_LEN = 4;  // don't auto-commit fragments
const SCANNER_GAP_MS = 80;             // keystroke gap that still looks like a scanner
const FLASH_MS = 1500;

export default function ExternalScanDialog({
  open,
  onClose,
  multi = false,
  onFound = null,
  onComplete = null,
  title = null,
  hint = null,
  askExpected = false, // multi only: first ask how many items to expect, then show progress against it
  warnFor = null,      // (code) => string | null — label doubtful scans (e.g. the invoice's own barcode)
}) {
  const inputRef = useRef(null);
  const foundRef = useRef(false);       // single mode: stop after the first read
  const idleTimerRef = useRef(null);
  const flashTimerRef = useRef(null);
  const paceRef = useRef({ lastTs: 0, fast: true }); // keystroke pacing of the current buffer
  const prevLenRef = useRef(0);         // last seen input length (pace math outside setState)

  const [buffer, setBuffer] = useState('');
  const [list, setList] = useState([]);
  const [flash, setFlash] = useState(null); // duplicate code just re-scanned
  const [expectedDraft, setExpectedDraft] = useState(''); // the "how many?" input
  const [expected, setExpected] = useState(null);         // committed count, null = not asked / not sure
  const [counting, setCounting] = useState(false);        // still on the "how many?" step

  const clearIdleTimer = () => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  };

  useEffect(() => {
    if (!open) return undefined;
    foundRef.current = false;
    paceRef.current = { lastTs: 0, fast: true };
    prevLenRef.current = 0;
    setBuffer('');
    setList([]);
    setFlash(null);
    setExpectedDraft('');
    setExpected(null);
    setCounting(multi && askExpected);
    return () => {
      clearIdleTimer();
      if (flashTimerRef.current) {
        clearTimeout(flashTimerRef.current);
        flashTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const commit = (raw) => {
    clearIdleTimer();
    const value = (raw ?? '').trim();
    if (!value) return;
    if (!multi) {
      if (foundRef.current) return;
      foundRef.current = true;
      onFound?.(value);
      onClose?.();
      return;
    }
    setBuffer('');
    paceRef.current = { lastTs: 0, fast: true };
    prevLenRef.current = 0;
    setList((prev) => {
      if (prev.includes(value)) {
        setFlash(value);
        if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
        flashTimerRef.current = setTimeout(() => setFlash(null), FLASH_MS);
        return prev;
      }
      return [...prev, value];
    });
    inputRef.current?.focus();
  };

  const handleChange = (e) => {
    const next = e.target.value;
    const now = Date.now();
    const pace = paceRef.current;
    if (prevLenRef.current === 0) {
      // Fresh buffer: assume a scanner until the pacing says otherwise.
      paceRef.current = { lastTs: now, fast: true };
    } else {
      const burst = next.length - prevLenRef.current > 1; // paste / batched wedge input
      if (!burst && now - pace.lastTs >= SCANNER_GAP_MS) pace.fast = false;
      pace.lastTs = now;
    }
    prevLenRef.current = next.length;
    setBuffer(next);
    clearIdleTimer();
    idleTimerRef.current = setTimeout(() => {
      idleTimerRef.current = null;
      const value = next.trim();
      if (paceRef.current.fast && value.length >= MIN_AUTO_COMMIT_LEN) commit(next);
    }, IDLE_COMMIT_MS);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      commit(e.target.value);
    }
  };

  // Keep the input focused so every trigger-pull lands here — but let button
  // clicks (Done / Cancel / remove) go through first.
  const handleBlur = () => {
    setTimeout(() => {
      if (open) inputRef.current?.focus();
    }, 0);
  };

  const removeAt = (idx) => {
    setList((prev) => prev.filter((_, i) => i !== idx));
    inputRef.current?.focus();
  };

  if (!open) return null;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent className="sm:max-w-[440px]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>
            {title || (multi ? 'Scan the slip barcodes' : 'Scan the item barcode')}
          </DialogTitle>
        </DialogHeader>

        {counting ? (
          <>
            <p className="text-sm text-muted-foreground">
              How many line items are on the invoice? We&apos;ll count your scans
              against it so nothing gets skipped.
            </p>
            <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
              <input
                type="number"
                min="1"
                inputMode="numeric"
                value={expectedDraft}
                onChange={(e) => setExpectedDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && parseInt(expectedDraft, 10) > 0) {
                    e.preventDefault();
                    setExpected(parseInt(expectedDraft, 10));
                    setCounting(false);
                  }
                }}
                autoFocus
                placeholder="e.g. 16"
                aria-label="Expected item count"
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Button
                size="lg"
                disabled={!(parseInt(expectedDraft, 10) > 0)}
                onClick={() => {
                  setExpected(parseInt(expectedDraft, 10));
                  setCounting(false);
                }}
              >
                <BarcodeIcon size={16} /> Start scanning
              </Button>
              <Button variant="secondary" onClick={() => { setExpected(null); setCounting(false); }}>
                Not sure — just start
              </Button>
              <Button variant="ghost" onClick={() => onClose?.()}>Cancel</Button>
            </div>
          </>
        ) : (
        <>
        <p className="text-sm text-muted-foreground">
          {hint || (multi
            ? 'Point your scanner at each little barcode, one line at a time — every read lands below.'
            : 'One scan and this closes on its own.')}
        </p>

        <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
          <BarcodeIcon size={18} />
          <input
            ref={inputRef}
            type="text"
            value={buffer}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            autoFocus
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="Scan now — or type the code and press Enter"
            aria-label="Barcode input"
            className="w-full bg-transparent text-sm outline-none"
            style={{ fontFamily: 'ui-monospace, monospace' }}
          />
        </div>

        {multi && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1">
                <CheckIcon size={13} />{' '}
                {expected
                  ? (list.length >= expected
                    ? `all ${expected} scanned`
                    : `${list.length} of ${expected} scanned`)
                  : `${list.length} barcode${list.length === 1 ? '' : 's'} scanned`}
              </span>
              {flash && (
                <span className="rounded-full bg-secondary px-3 py-1 animate-pulse">
                  Already scanned · {flash}
                </span>
              )}
            </div>

            {list.length > 0 && (
              <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
                {list.map((code, i) => {
                  const warning = warnFor?.(code) || null;
                  return (
                    <div
                      key={code}
                      className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1 text-sm"
                    >
                      <div className="flex flex-col gap-0.5">
                        <span style={{ fontFamily: 'ui-monospace, monospace', overflowWrap: 'anywhere' }}>
                          {code}
                        </span>
                        {warning && (
                          <span className="admin-v2-badge admin-v2-badge-warning" style={{ alignSelf: 'flex-start' }}>
                            {warning}
                          </span>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Remove ${code}`}
                        onClick={() => removeAt(i)}
                      >
                        <XIcon size={14} />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        <div className="flex flex-col gap-2">
          {multi && (
            <Button size="lg" disabled={list.length === 0} onClick={() => onComplete?.(list)}>
              <CheckIcon size={16} /> Done — use these {list.length || ''}
            </Button>
          )}
          <Button variant="ghost" onClick={() => onClose?.()}>Cancel</Button>
        </div>
        </>
        )}
      </DialogContent>
    </Dialog>
  );
}
