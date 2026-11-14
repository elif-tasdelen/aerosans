import { pdfSafe } from '../lib/report.js';

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 15;
const CONTENT_W = PAGE_W - 2 * MARGIN;
const BOTTOM = PAGE_H - 16; // content stops here; the footer sits below
const BODY = { size: 8.5, line: 3.9 };
const SMALL = { size: 7, line: 3.1 };
const IMAGE_BOX = { trend: { w: CONTENT_W, h: 56 }, measurement: { w: 96, h: 72 } };

/**
 * Lay out a report model (src/lib/report.js) as an A4 portrait PDF.
 * @param {object} model
 * @param {{ trend?: {dataUrl, width, height}, measurement?: {dataUrl, width, height} }} images
 * @returns {Promise<import('jspdf').jsPDF>} the document (call .save(model.filename) to download it)
 */
export async function renderReportPdf(model, images = {}) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  let y = MARGIN;

  const ensure = (h) => {
    if (y + h > BOTTOM) {
      doc.addPage();
      y = MARGIN;
    }
  };
  const paragraph = (text, { size, line }, style = 'normal') => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    for (const row of doc.splitTextToSize(pdfSafe(text), CONTENT_W)) {
      ensure(line);
      doc.text(row, MARGIN, y + line * 0.75);
      y += line;
    }
  };

  // Header
  doc.setTextColor(20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(pdfSafe(model.title), MARGIN, y + 5);
  y += 8;
  paragraph(model.meta.join('   |   '), BODY);
  paragraph(model.disclaimer, BODY, 'bold');
  y += 1;
  doc.setDrawColor(120);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 2;

  for (const section of model.sections) {
    const img = section.image ? images[section.image] : null;
    const box = section.image ? IMAGE_BOX[section.image] : null;
    let imgW = 0;
    let imgH = 0;
    if (img && box) {
      const scale = Math.min(box.w / img.width, box.h / img.height);
      imgW = img.width * scale;
      imgH = img.height * scale;
    }
    // Keep the heading with the start of its content.
    ensure(6 + (imgH ? imgH + 2 : BODY.line * 2));
    y += 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text(pdfSafe(section.heading), MARGIN, y + 3.4);
    y += 5.5;
    if (imgH) {
      const format = img.dataUrl.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
      doc.addImage(img.dataUrl, format, MARGIN, y, imgW, imgH);
      y += imgH + 2;
    } else if (section.image) {
      paragraph('(Image not available.)', BODY, 'italic');
    }
    for (const text of section.lines ?? []) paragraph(text, BODY);
    for (const text of section.smallLines ?? []) paragraph(text, SMALL);
  }

  // Footer on every page.
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(90);
    doc.text(pdfSafe(model.footer), MARGIN, PAGE_H - 9);
    doc.text(`Page ${p} of ${pages}`, PAGE_W - MARGIN, PAGE_H - 9, { align: 'right' });
  }
  return doc;
}
