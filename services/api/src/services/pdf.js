// Inspection report as a PDF: an official record with the geo-check, checklist, photos and the
// SHA-256 fingerprints needed to re-verify every evidence file.
const PDFDocument = require('pdfkit');
const mongo = require('../db/mongo');

const NAVY = '#0b1d3a', MUTED = '#667085', RED = '#d92d20', GREEN = '#067647';

const readAll = id => new Promise((resolve, reject) => {
  const chunks = [];
  mongo.openDownload(id).on('data', c => chunks.push(c)).on('end', () => resolve(Buffer.concat(chunks))).on('error', reject);
});

const when = t => (t ? new Date(t).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) + ' IST' : '—');

async function reportPdf(r, out) {
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `Inspection report ${r.id}`, Author: 'Sakshya360 · DoSJE' } });
  doc.pipe(out);
  const W = doc.page.width - 96;

  // Header band with tricolour rule
  doc.rect(0, 0, doc.page.width, 70).fill(NAVY);
  doc.fillColor('#fff').fontSize(18).font('Helvetica-Bold').text('Sakshya360 · Surprise Inspection Report', 48, 22);
  doc.fontSize(9).font('Helvetica').text('Department of Social Justice & Empowerment, Ministry of Social Justice & Empowerment', 48, 45);
  [['#ff9933', 0], ['#ffffff', 1], ['#138808', 2]].forEach(([c, i]) => doc.rect((doc.page.width / 3) * i, 70, doc.page.width / 3, 4).fill(c));
  doc.moveDown(3).fillColor(NAVY);

  const row = (label, value, color) => {
    const y = doc.y;
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(label, 48, y, { width: 150 });
    doc.font('Helvetica-Bold').fontSize(10).fillColor(color || NAVY).text(String(value ?? '—'), 200, y, { width: W - 152 });
    doc.moveDown(0.35);
  };
  const heading = t => { doc.moveDown(0.6).font('Helvetica-Bold').fontSize(12).fillColor(NAVY).text(t, 48); doc.moveTo(48, doc.y + 2).lineTo(48 + W, doc.y + 2).strokeColor('#e4e7ec').stroke(); doc.moveDown(0.5); };

  doc.y = 92;
  row('Report ID', r.id);
  row('Project', `${r.project_name} (${r.project_id})`);
  row('Location', `${r.district}, ${r.state}`);
  row('Inspector', `${r.inspector_name} (${r.inspector_id})`);
  row('Inspected at (device)', when(r.captured_at || r.submitted_at));
  row('Received by server', when(r.submitted_at) + (r.delayed_sync ? '  – synced later from offline queue' : ''));

  heading('1. Location verification');
  row('Report GPS', `${r.lat.toFixed(6)}, ${r.lng.toFixed(6)}  (±${Math.round(r.accuracy_m || 0)} m)`);
  row('Registered site', `${r.site_lat.toFixed(6)}, ${r.site_lng.toFixed(6)}`);
  row('Distance from site', `${r.distance_m} m`);
  row('Geofence result', r.within_fence ? 'INSIDE project geofence' : 'OUTSIDE project geofence', r.within_fence ? GREEN : RED);
  if (r.simulated) row('Note', 'Location was simulated in demo mode', RED);

  heading('2. Checklist');
  r.checklist.forEach(c => {
    doc.font('Helvetica-Bold').fontSize(10).fillColor(c.ok ? GREEN : RED).text(c.ok ? 'YES' : 'NO', 48, doc.y, { continued: true, width: 40 });
    doc.font('Helvetica').fillColor(NAVY).text(`   ${c.item}`);
  });
  doc.moveDown(0.3);
  row('Compliance score', `${r.score}%`, r.score >= 75 ? GREEN : r.score >= 50 ? '#b54708' : RED);

  heading('3. Headcount');
  const mismatch = r.register_count && r.headcount < r.register_count * 0.7;
  row('Physically present', r.headcount);
  row('Register claims', r.register_count, mismatch ? RED : undefined);
  if (mismatch) row('Finding', 'Headcount more than 30% below the register – possible proxy attendance', RED);
  if (r.remarks) { row('Remarks', ''); doc.font('Helvetica').fontSize(10).fillColor(NAVY).text(r.remarks, 48, doc.y, { width: W }); }

  heading(`4. Live evidence (${r.evidence.length} file(s))`);
  const photos = r.evidence.filter(e => e.kind === 'photo');
  let x = 48, rowTop = doc.y;
  for (const e of photos) {
    try {
      const buf = await readAll(e.id);
      if (rowTop + 150 > doc.page.height - 60) { doc.addPage(); rowTop = 60; x = 48; }
      doc.image(buf, x, rowTop, { fit: [160, 120], align: 'center', valign: 'center' });
      doc.font('Courier').fontSize(6).fillColor(MUTED).text(e.sha256.slice(0, 32), x, rowTop + 124, { width: 160 });
      x += 170;
      if (x + 160 > 48 + W) { x = 48; rowTop += 145; }
    } catch { /* missing file is listed below with its hash */ }
  }
  doc.y = rowTop + (x === 48 ? 0 : 145);
  doc.moveDown(0.5);
  r.evidence.forEach(e => doc.font('Courier').fontSize(7).fillColor(NAVY).text(`${e.kind.padEnd(6)} ${e.id}  sha256 ${e.sha256}`, 48, doc.y, { width: W }));

  heading('5. Integrity');
  doc.font('Helvetica').fontSize(9).fillColor(NAVY).text(
    'Every evidence file is fingerprinted with SHA-256 on upload and stored in write-once storage; the report signature below covers the ' +
    'location, checklist, headcount and all evidence hashes. Any change to the record or its evidence invalidates the signature. ' +
    'All actions are recorded in the hash-chained audit trail.', 48, doc.y, { width: W });
  doc.moveDown(0.5).font('Courier').fontSize(8).text(`Report signature: ${r.signature}`, { width: W });
  doc.moveDown(1).font('Helvetica').fontSize(8).fillColor(MUTED).text(`Generated ${when(new Date())} by Sakshya360`, { align: 'right' });
  doc.end();
}

module.exports = { reportPdf };
