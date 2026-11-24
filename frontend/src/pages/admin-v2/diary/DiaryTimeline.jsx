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
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import EntityModal from '../../../components/vc/EntityModal';

function Entries({ rows, onEdit }) {
  if (!rows.length) return <p>No events in this diary yet.</p>;
  return <table className="diary-table"><thead><tr><th scope="col">Local date and time</th><th scope="col">Description of event</th></tr></thead>
    <tbody>{rows.map(({ key, at, time, items, source }) => <tr key={key}>
      <td><time dateTime={at}>{time}</time></td>
      <td>{items.map(({ entry, showLabel, followUp }) => <div key={entry.id}>
          {showLabel && <strong>{entry.label}</strong>}
          {entry.note && <p>{entry.note}</p>}
          {followUp && <p>{followUp}</p>}
          {entry.source === 'observation' && onEdit &&
            <button type="button" className="cfg-ghost" aria-label={`Edit ${entry.label}`} onClick={() => onEdit(entry)}>Edit</button>}
        </div>)}
        <small>{source}</small>
      </td>
    </tr>)}</tbody></table>;
}

function Report({ report }) {
  return <><h1>{report.title}</h1><p>{report.patient}</p><p>{report.period}</p><Entries rows={report.rows} /></>;
}

function PrintPreview({ report, onClose }) {
  const [pdf, setPdf] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [printRequested, setPrintRequested] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let url;
    async function prepare() {
      try {
        const { diaryPdf } = await import('./diaryPdf');
        const blob = await diaryPdf(report);
        if (cancelled) return;
        const file = new File([blob], 'event-diary.pdf', { type: 'application/pdf' });
        url = URL.createObjectURL(file);
        setPdf({ file, url });
      } catch {
        if (!cancelled) setError('Could not prepare the PDF.');
      }
    }
    prepare();
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [report, attempt]);

  function print() {
    setPrintRequested(true);
    try { window.print(); } catch { /* The PDF actions stay available in embedded views. */ }
  }
  async function share() {
    try { await navigator.share({ files: [pdf.file] }); }
    catch (err) {
      if (err.name !== 'AbortError') setError('Sharing is unavailable. Save the PDF to print it.');
    }
  }

  return <EntityModal open wide title="Print preview" onOpenChange={open => { if (!open) onClose(); }}>
    <div className="diary-print-actions">
      <button type="button" className="em-submit" onClick={print}>Print</button>
      {pdf && <a className="em-cancel" download={pdf.file.name} href={pdf.url}>Save PDF</a>}
      {pdf && navigator.share && navigator.canShare?.({ files: [pdf.file] }) &&
        <button type="button" className="em-cancel" onClick={share}>Share PDF</button>}
    </div>
    {!pdf && !error && <p role="status">Preparing PDF…</p>}
    {printRequested && <p className="em-hint">If the print dialog didn’t open, save the PDF and print it from your device.</p>}
    {error && <div role="alert" className="em-error">{error}{!pdf &&
      <button type="button" className="cfg-ghost" onClick={() => { setError(''); setAttempt(n => n + 1); }}>Retry PDF</button>}
    </div>}
    <article className="diary-paper"><Report report={report} /></article>
  </EntityModal>;
}

export default function DiaryTimeline({ report, printReport, onClosePrint, showEntries, onEdit }) {
  return <>
    {showEntries && <Entries rows={report.rows} onEdit={onEdit} />}
    {createPortal(<article className="diary-print"><Report report={printReport || report} /></article>, document.body)}
    {printReport && <PrintPreview report={printReport} onClose={onClosePrint} />}
  </>;
}
