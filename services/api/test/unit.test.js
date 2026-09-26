// Unit tests for logic that does not need the database:  npm test
const { test } = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'unit-test-secret-unit-test-secret-000';

const signing = require('../src/services/signing');
const { scopeClause, inScope, sign, decode } = require('../src/middleware/auth');
const { rateLimit } = require('../src/middleware/rateLimit');
const { parseRtspStatus } = require('../src/services/cameraHealth');
const { occupancyCheck } = require('../src/services/cctvWatch');
const { autoAssignDue, localParts } = require('../src/services/jobs');
const { isExpoToken } = require('../src/services/push');

test('signed evidence URL verifies and rejects tampering', () => {
  const url = new URL(signing.evidenceUrl('abc123'), 'http://x');
  const exp = url.searchParams.get('exp'), sig = url.searchParams.get('sig');
  assert.ok(signing.verify('evidence', 'abc123', exp, sig));
  assert.ok(!signing.verify('evidence', 'abc124', exp, sig), 'other id');
  assert.ok(!signing.verify('report-pdf', 'abc123', exp, sig), 'other purpose');
  assert.ok(!signing.verify('evidence', 'abc123', String(+exp + 60), sig), 'extended expiry');
  assert.ok(!signing.verify('evidence', 'abc123', exp, undefined));
});

test('expired signature is rejected', () => {
  const { sig } = signing.sign('evidence', 'e1', 0);
  const past = Math.floor(Date.now() / 1000) - 10;
  assert.ok(!signing.verify('evidence', 'e1', past, sig));
});

test('QR feedback token is stable and project-specific', () => {
  assert.equal(signing.feedbackToken('P101'), signing.feedbackToken('P101'));
  assert.ok(signing.verify('feedback', 'P101', 0, signing.feedbackToken('P101')));
  assert.ok(!signing.verify('feedback', 'P102', 0, signing.feedbackToken('P101')));
});

test('jurisdiction scope: official / state / district', () => {
  const up = { state: 'Uttar Pradesh', district: 'Lucknow' };
  const bihar = { state: 'Bihar', district: 'Patna' };
  assert.ok(inScope({ role: 'official' }, bihar));
  assert.ok(inScope({ role: 'state', state: 'Uttar Pradesh' }, up));
  assert.ok(!inScope({ role: 'state', state: 'Uttar Pradesh' }, bihar));
  assert.ok(inScope({ role: 'district', state: 'Uttar Pradesh', district: 'Lucknow' }, up));
  assert.ok(!inScope({ role: 'district', state: 'Uttar Pradesh', district: 'Kanpur' }, up));
  assert.ok(!inScope({ role: 'inspector' }, up));

  assert.equal(scopeClause({ role: 'official' }).sql, 'TRUE');
  const p = [];
  const d = scopeClause({ role: 'district', state: 'UP', district: 'Lucknow' }, p, 'x');
  assert.equal(d.sql, 'x.state = $1 AND x.district = $2');
  assert.deepEqual(p, ['UP', 'Lucknow']);
});

test('JWT carries district scope', () => {
  const u = decode(sign({ id: 'DT-LKO', role: 'district', state: 'Uttar Pradesh', district: 'Lucknow', name: 'x' }));
  assert.equal(u.district, 'Lucknow');
  assert.equal(u.role, 'district');
});

test('rate limiter blocks after max hits', () => {
  const mw = rateLimit({ windowMs: 60000, max: 2, key: () => 'k' });
  const res = { set() {} };
  const results = [];
  for (let i = 0; i < 3; i++) mw({}, res, err => results.push(err ? err.status : 'ok'));
  assert.deepEqual(results, ['ok', 'ok', 429]);
});

test('RTSP status parsing', () => {
  assert.equal(parseRtspStatus('RTSP/1.0 200 OK\r\nCSeq: 1\r\n\r\n'), 200);
  assert.equal(parseRtspStatus('RTSP/1.0 404 Not Found\r\n\r\n'), 404);
  assert.equal(parseRtspStatus('HTTP/1.1 200 OK'), null);
});

test('CCTV occupancy check', () => {
  assert.deepEqual(occupancyCheck(0, 40), { expected: 10, suspicious: true });
  assert.equal(occupancyCheck(8, 40).suspicious, false);
  assert.equal(occupancyCheck(0, 0).suspicious, false, 'no register, no claim to contradict');
});

test('auto-assignment runs once per day after the scheduled time (IST)', () => {
  const cfg = { enabled: true, hour: 9, minute: 0, weekdaysOnly: true };
  const wed0830 = new Date('2026-09-23T03:00:00Z'); // 08:30 IST Wednesday
  const wed0905 = new Date('2026-09-23T03:35:00Z'); // 09:05 IST
  assert.equal(localParts(wed0905).hour, 9);
  assert.equal(autoAssignDue(cfg, null, wed0830), false, 'before slot');
  assert.equal(autoAssignDue(cfg, null, wed0905), true, 'after slot, never run');
  assert.equal(autoAssignDue(cfg, '2026-09-23T03:31:00Z', wed0905), false, 'already ran today');
  assert.equal(autoAssignDue(cfg, '2026-09-22T03:31:00Z', wed0905), true, 'ran yesterday');
  assert.equal(autoAssignDue(cfg, null, new Date('2026-09-26T05:00:00Z')), false, 'Saturday skipped');
  assert.equal(autoAssignDue({ ...cfg, enabled: false }, null, wed0905), false, 'disabled');
});

test('Expo push token format', () => {
  assert.ok(isExpoToken('ExponentPushToken[abcDEF123]'));
  assert.ok(!isExpoToken('fcm:abc'));
});
