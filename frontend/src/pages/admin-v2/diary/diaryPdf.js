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
import pdfMake from 'pdfmake/build/pdfmake';
import fonts from 'pdfmake/build/vfs_fonts';

pdfMake.addVirtualFileSystem(fonts);

export function diaryPdf(report) {
  const body = [[{ text: 'Local date and time', bold: true }, { text: 'Description of event', bold: true }]];
  for (const { items, time } of report.rows) {
    const stack = [];
    for (const { entry, showLabel, followUp } of items) {
      if (showLabel) stack.push({ text: entry.label, bold: true });
      if (entry.note) stack.push({ text: entry.note });
      if (followUp) stack.push({ text: followUp });
    }
    body.push([time, { stack }]);
  }
  return pdfMake.createPdf({
    info: { title: report.title },
    pageSize: 'LETTER',
    pageMargins: [36, 40, 36, 40],
    defaultStyle: { fontSize: 10, lineHeight: 1.2 },
    content: [
      { text: report.title, fontSize: 18, bold: true },
      { text: report.patient, margin: [0, 4, 0, 0] },
      { text: report.period, margin: [0, 2, 0, 12] },
      report.rows.length
        ? { table: { headerRows: 1, widths: ['30%', '70%'], body }, layout: 'lightHorizontalLines' }
        : { text: 'No events in this diary yet.' },
    ],
  }).getBlob();
}
