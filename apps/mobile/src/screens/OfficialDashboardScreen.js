import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api, currentSession, getSocket } from '../api';
import { Pill, Tricolor } from '../components';
import { t, useLang } from '../i18n';
import { C, s } from '../theme';

const BAND_TONE = { high: 'red', medium: 'amber', low: 'green' };

function Kpi({ value, label, tone }) {
  return (
    <View style={[s.card, { flexBasis: '48%', flexGrow: 1, marginBottom: 8 }]}>
      <Text style={{ fontSize: 24, fontWeight: '800', color: tone || C.navy }}>{value}</Text>
      <Text style={s.muted}>{label}</Text>
    </View>
  );
}

export default function OfficialDashboardScreen({ navigation }) {
  useLang();
  const [data, setData] = useState(null);
  const [feed, setFeed] = useState([]);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try { setData(await api('/dashboard')); setError(''); } catch (e) { setError(e.message); }
    setRefreshing(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Live alerts for this user's jurisdiction.
  useEffect(() => {
    const sock = getSocket();
    const onAlert = (a) => { setFeed((f) => [{ ...a, at: a.at || new Date().toISOString() }, ...f].slice(0, 20)); load(); };
    const onReport = (r) => setFeed((f) => [{ sev: 'info', code: 'REPORT', projectId: r.projectId, text: t('{name} submitted a report (score {score}%)', { name: r.inspector, score: r.score }), at: new Date().toISOString() }, ...f].slice(0, 20));
    sock.on('alert', onAlert); sock.on('report:new', onReport); sock.on('dashboard:refresh', load);
    return () => { sock.off('alert', onAlert); sock.off('report:new', onReport); sock.off('dashboard:refresh', load); };
  }, [load]);

  const k = data?.kpis;
  const projects = data ? [...data.projects].sort((a, b) => (b.analysis.risk ?? -1) - (a.analysis.risk ?? -1)) : [];

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}>
      <View style={[s.card, { backgroundColor: C.navy }]}>
        <Text style={[s.h1, { color: '#fff' }]}>{t('Real-time monitoring')}</Text>
        <Text style={{ color: '#d0d5dd' }}>{currentSession().user.name} · {data?.scope}</Text>
        <Tricolor />
        {data && <Text style={{ color: data.mlOnline ? '#a6f4c5' : '#fedf89', fontSize: 12 }}>{data.mlOnline ? t('AI models online') : t('AI service offline')}</Text>}
      </View>
      {!!error && <Text style={s.error}>{error}</Text>}
      {k && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Kpi value={k.projects} label={t('Projects monitored')} />
          <Kpi value={k.highRisk} label={t('High-risk projects')} tone={C.red} />
          <Kpi value={`${k.camerasOnline}/${k.camerasTotal}`} label={t('CCTV cameras online')} tone={k.camerasOnline < k.camerasTotal ? C.amber : C.ok} />
          <Kpi value={k.openAssignments} label={t('Open inspections')} />
          <Kpi value={k.overdueAssignments} label={t('Overdue inspections')} tone={k.overdueAssignments ? C.red : undefined} />
          <Kpi value={k.openGrievances} label={t('Open grievances')} tone={k.openGrievances ? C.amber : undefined} />
        </View>
      )}

      <Text style={[s.h2, { marginTop: 8 }]}>{t('Live alerts')}</Text>
      <View style={s.card}>
        {feed.length === 0 && <Text style={s.muted}>{t('Waiting for events… alerts from inspections, attendance, CCTV and grievances appear here instantly.')}</Text>}
        {feed.map((f, i) => (
          <Pressable key={i} onPress={() => f.projectId && navigation.navigate('Project', { id: f.projectId })} style={{ paddingVertical: 6, borderBottomWidth: i < feed.length - 1 ? 1 : 0, borderColor: C.line }}>
            <View style={s.between}>
              <Pill tone={f.sev === 'high' ? 'red' : f.sev === 'med' ? 'amber' : undefined}>{f.code}</Pill>
              <Text style={s.muted}>{f.projectId} · {new Date(f.at).toLocaleTimeString()}</Text>
            </View>
            <Text style={{ color: C.text, marginTop: 2 }}>{f.text}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={[s.h2, { marginTop: 8 }]}>{t('Projects by AI risk')}</Text>
      {projects.map((p) => (
        <Pressable key={p.id} onPress={() => navigation.navigate('Project', { id: p.id })} style={s.card}>
          <View style={s.between}>
            <Text style={[s.h2, { flex: 1, marginBottom: 0 }]}>{p.name}</Text>
            <Pill tone={BAND_TONE[p.analysis.band]}>{p.analysis.risk == null ? t('ML offline') : t('Risk {n}', { n: p.analysis.risk })}</Pill>
          </View>
          <Text style={s.muted}>{p.id} · {p.scheme} · {p.district}, {p.state}</Text>
          <Text style={s.muted}>{t('Avg attendance {avg}/{cap}', { avg: p.analysis.avg, cap: p.sanctioned })} · {t('{n} flag(s)', { n: p.analysis.flags.length })}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
