// Stores evidence in GridFS and indexes it in PostgreSQL. SHA-256 is the evidence fingerprint;
// the UNIQUE constraint rejects re-used photos across all reports.
const crypto = require('crypto');
const mongo = require('../db/mongo');
const { HttpError } = require('../middleware/errors');

const ALLOWED = { 'image/jpeg': 'photo', 'image/png': 'photo', 'video/mp4': 'video', 'video/quicktime': 'video' };

async function store(client, file, { kind, projectId, reportId = null, lat = null, lng = null, userId }) {
  if (!ALLOWED[file.mimetype]) throw new HttpError(415, `Unsupported evidence type ${file.mimetype}`);
  const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
  const dup = await client.query('SELECT report_id FROM evidence WHERE sha256 = $1', [sha256]);
  if (dup.rows.length) throw new HttpError(409, 'Duplicate evidence – this file was already submitted');

  const id = await mongo.putFile(file.buffer, file.originalname || `${kind}-${Date.now()}`, { sha256, kind, projectId, reportId, userId, lat, lng, mime: file.mimetype });
  try {
    await client.query(
      `INSERT INTO evidence (id, sha256, kind, mime, bytes, report_id, project_id, location, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7, CASE WHEN $8::float8 IS NULL THEN NULL ELSE ST_MakePoint($9,$8)::geography END, $10)`,
      [id, sha256, kind, file.mimetype, file.size, reportId, projectId, lat, lng, userId]);
  } catch (e) {
    await mongo.deleteFile(id).catch(() => {});
    throw e;
  }
  return { id, sha256, kind, mime: file.mimetype };
}

module.exports = { store };
