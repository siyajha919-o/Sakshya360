import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { fmt, Status, useApi } from '../components/ui';

export const CATEGORY_LABEL = {
  fake_attendance: 'Fake attendance / proxy', staff_absent: 'Staff absent', food: 'Food / meals', facilities: 'Facilities',
  behaviour: 'Staff behaviour', money_demanded: 'Money demanded', other: 'Other', praise: 'Appreciation',
};
const SERIOUS = ['fake_attendance', 'money_demanded', 'behaviour'];
const STATUS_TONE = { open: 'red', in_review: 'amber', resolved: 'green', rejected: '' };

function Item({ g, onDone }) {
  const [response, setResponse] = useState(g.response || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const act = async (status) => {
    setBusy(true); setError('');
    try { await api(`/feedback/${g.id}/respond`, { body: { status, response } }); onDone(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="card">
      <div className="row between">
        <div>
          <span className={`pill ${g.category === 'praise' ? 'green' : SERIOUS.includes(g.category) ? 'red' : 'amber'}`}>{CATEGORY_LABEL[g.category] || g.category}</span>{' '}
          <Link to={`/projects/${g.project_id}`}><b>{g.project_name}</b></Link> <span className="muted">{g.district}, {g.state}</span>
        </div>
        <span className={`pill ${STATUS_TONE[g.status]}`}>{g.status.replace('_', ' ')}</span>
      </div>
      <div className="muted" style={{ marginTop: 4 }}>
        {fmt(g.created_at)} · {g.channel === 'qr' ? 'Anonymous (centre QR code)' : `${g.person_name} (beneficiary, OTP-verified)`}
        {g.rating && ` · rating ${'★'.repeat(g.rating)}${'☆'.repeat(5 - g.rating)}`}
        {g.present === false && ' · says not present today'}
        {g.services_ok === false && ' · services not received'}
      </div>
      {g.text && <div style={{ margin: '8px 0', fontSize: 15 }} lang={g.lang}>“{g.text}”</div>}
      {g.category !== 'praise' && (
        <div className="stack">
          <textarea rows={2} placeholder="Action taken / reply to the beneficiary" value={response} onChange={(e) => setResponse(e.target.value)} style={{ width: '100%' }} />
          <div className="row">
            <button className="btn ghost sm" disabled={busy} onClick={() => act('in_review')}>Mark in review</button>
            <button className="btn green sm" disabled={busy || !response.trim()} onClick={() => act('resolved')}>Resolve with reply</button>
            <button className="btn ghost sm" disabled={busy} onClick={() => act('rejected')}>Reject as invalid</button>
            {g.responder_name && <span className="muted">Last action by {g.responder_name}, {fmt(g.responded_at)}</span>}
          </div>
          {error && <div className="error">{error}</div>}
        </div>
      )}
    </div>
  );
}

export default function Grievances() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const project = params.get('project') || '';
  const q = new URLSearchParams({ ...(status && { status }), ...(project && { projectId: project }) }).toString();
  const list = useApi(() => api(`/feedback${q ? `?${q}` : ''}`), [q]);
  const setFilter = (k, v) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); setParams(n); };

  return (
    <>
      <div className="topline">
        <div>
          <h1>Beneficiary grievances</h1>
          <div className="muted">From beneficiaries in the mobile app (OTP-verified) and anonymous QR codes at each centre. Serious grievances raise live alerts and increase the project's risk score.</div>
        </div>
        <div className="row">
          {project && <button className="btn ghost sm" onClick={() => setFilter('project', '')}>Project {project} ✕</button>}
          <select value={status} onChange={(e) => setFilter('status', e.target.value)}>
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="in_review">In review</option>
            <option value="resolved">Resolved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>
      <Status loading={list.loading} error={list.error} />
      {list.data && list.data.length === 0 && <div className="card muted">No grievances.</div>}
      <div className="stack">{list.data && list.data.map((g) => <Item key={g.id} g={g} onDone={list.reload} />)}</div>
    </>
  );
}
