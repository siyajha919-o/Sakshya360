import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

// Public, no-login page opened from the QR code displayed at a centre. Hindi first, English toggle.
const T = {
  hi: {
    title: 'अपनी राय दें', sub: 'यह शिकायत सीधे सामाजिक न्याय एवं अधिकारिता विभाग तक पहुँचती है। आपका नाम नहीं माँगा जाता।',
    what: 'किस बारे में?', present: 'क्या आप आज केंद्र में उपस्थित थे?', services: 'क्या आपको सेवाएँ / भोजन मिला?', yes: 'हाँ', no: 'नहीं',
    rating: 'केंद्र को रेटिंग दें', details: 'विवरण लिखें', submit: 'भेजें', sending: 'भेजा जा रहा है…',
    done: 'धन्यवाद! आपकी शिकायत दर्ज हो गई है।', ref: 'संदर्भ संख्या', invalid: 'यह QR कोड मान्य नहीं है।', lang: 'English',
    cats: { fake_attendance: 'फ़र्ज़ी हाज़िरी / नकली लाभार्थी', staff_absent: 'स्टाफ़ अनुपस्थित', food: 'भोजन', facilities: 'सुविधाएँ (पानी, शौचालय, बिस्तर)', behaviour: 'स्टाफ़ का व्यवहार', money_demanded: 'पैसे माँगे गए', other: 'अन्य', praise: 'प्रशंसा' },
  },
  en: {
    title: 'Give feedback', sub: 'This goes directly to the Department of Social Justice & Empowerment. Your name is not asked for.',
    what: 'What is it about?', present: 'Were you at the centre today?', services: 'Did you receive the services / meals?', yes: 'Yes', no: 'No',
    rating: 'Rate the centre', details: 'Describe what happened', submit: 'Send', sending: 'Sending…',
    done: 'Thank you! Your feedback has been recorded.', ref: 'Reference', invalid: 'This QR code is not valid.', lang: 'हिन्दी',
    cats: { fake_attendance: 'Fake attendance / ghost beneficiaries', staff_absent: 'Staff absent', food: 'Food / meals', facilities: 'Facilities (water, toilets, beds)', behaviour: 'Staff behaviour', money_demanded: 'Money demanded', other: 'Other', praise: 'Appreciation' },
  },
};

function YesNo({ value, onChange, t }) {
  return (
    <div className="row">
      {[[true, t.yes], [false, t.no]].map(([v, l]) => (
        <button key={l} type="button" className={`btn sm ${value === v ? '' : 'ghost'}`} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

export default function PublicFeedback() {
  const { projectId } = useParams();
  const [params] = useSearchParams();
  const token = params.get('t') || '';
  const [lang, setLang] = useState('hi');
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ category: '', rating: 0, present: null, servicesOk: null, text: '' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const t = T[lang];
  const q = `?t=${encodeURIComponent(token)}`;

  useEffect(() => {
    fetch(`/api/public/feedback/${encodeURIComponent(projectId)}${q}`)
      .then(async (r) => (r.ok ? setInfo(await r.json()) : setError((await r.json().catch(() => ({}))).error || 'error')))
      .catch((e) => setError(e.message));
  }, [projectId, q]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await fetch(`/api/public/feedback/${encodeURIComponent(projectId)}${q}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, rating: form.rating || null, lang }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || `Error ${r.status}`);
      setDone(body.reference);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const set = (patch) => setForm({ ...form, ...patch });

  return (
    <div className="login" lang={lang}>
      <form className="card stack" onSubmit={submit} style={{ maxWidth: 520 }}>
        <div className="row between">
          <div className="row"><img src="/favicon.svg" alt="" width="32" /><b>Sakshya360</b></div>
          <button type="button" className="btn ghost sm" onClick={() => setLang(lang === 'hi' ? 'en' : 'hi')}>{t.lang}</button>
        </div>
        <div className="tricolor" />
        {!info && !error && <div className="muted">…</div>}
        {!info && error && <div className="error">{t.invalid} ({error})</div>}
        {info && done && <div><h1>✅ {t.done}</h1><div className="muted">{t.ref}: <b className="mono">{done}</b></div></div>}
        {info && !done && (
          <>
            <div><h1>{t.title}</h1><div><b>{info.project.name}</b></div><div className="muted">{info.project.district}, {info.project.state}</div></div>
            <div className="muted">{t.sub}</div>
            <label><b>{t.what}</b></label>
            <div className="stack">
              {info.categories.map((c) => (
                <label key={c} className="chk"><input type="radio" name="cat" checked={form.category === c} onChange={() => set({ category: c })} /> {t.cats[c]}</label>
              ))}
            </div>
            <label><b>{t.present}</b></label>
            <YesNo value={form.present} onChange={(v) => set({ present: v })} t={t} />
            <label><b>{t.services}</b></label>
            <YesNo value={form.servicesOk} onChange={(v) => set({ servicesOk: v })} t={t} />
            <label><b>{t.rating}</b></label>
            <div className="row">{[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" className="btn ghost sm" style={{ fontSize: 20 }} onClick={() => set({ rating: n })}>{n <= form.rating ? '★' : '☆'}</button>
            ))}</div>
            <label><b>{t.details}</b></label>
            <textarea rows={4} value={form.text} onChange={(e) => set({ text: e.target.value })} maxLength={2000} />
            {error && <div className="error">{error}</div>}
            <button className="btn" disabled={busy || !form.category}>{busy ? t.sending : t.submit}</button>
          </>
        )}
      </form>
    </div>
  );
}
