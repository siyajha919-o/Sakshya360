import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api';
import { Button, fmt, Pill } from '../components';
import { t, useLang } from '../i18n';
import { C, s } from '../theme';

// Compact attendance chart: one bar per day, sanctioned capacity as the red line, autoencoder days in red.
function AttendanceBars({ attendance, sanctioned, anomalous }) {
  const max = Math.max(sanctioned, ...attendance.map((a) => a.count), 1);
  const bad = new Set(anomalous);
  return (
    <View style={{ height: 110, flexDirection: 'row', alignItems: 'flex-end', gap: 2, marginVertical: 8 }}>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: `${(sanctioned / max) * 100}%`, borderTopWidth: 1, borderColor: C.red, borderStyle: 'dashed' }} />
      {attendance.map((a) => (
        <View key={a.day} style={{ flex: 1, height: `${(a.count / max) * 100}%`, backgroundColor: bad.has(a.day) ? C.red : C.navy2, borderRadius: 2 }} />
      ))}
    </View>
  );
}

export default function ProjectScreen({ route, navigation }) {
  useLang();
  const { id } = route.params;
  const [p, setP] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try { setP(await api(`/projects/${id}`)); setError(''); } catch (e) { setError(e.message); }
    setRefreshing(false);
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!p) return <ScrollView style={s.screen} contentContainerStyle={s.pad}>{error ? <Text style={s.error}>{error}</Text> : <Text style={s.muted}>{t('Loading…')}</Text>}</ScrollView>;
  const a = p.analysis;

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}>
      <Text style={s.h1}>{p.name}</Text>
      <Text style={[s.muted, { marginBottom: 10 }]}>{p.id} · {p.scheme} · {p.ngo} · {p.district}, {p.state}</Text>
      <View style={[s.row, { marginBottom: 12 }]}>
        <Button style={{ flex: 1 }} tone="saffron" title={t('Random VC')} onPress={() => navigation.navigate('Home', { screen: 'VC', params: { projectId: p.id } })} />
        <Button style={{ flex: 1 }} tone="ghost" title={`${t('Grievances')} (${p.grievances_open})`} onPress={() => navigation.navigate('Home', { screen: 'Grievances', params: { projectId: p.id } })} />
      </View>

      <View style={s.card}>
        <View style={s.between}>
          <Text style={s.h2}>{t('AI risk')}</Text>
          <Pill tone={{ high: 'red', medium: 'amber', low: 'green' }[a.band]}>{a.risk == null ? t('ML offline') : t('Risk {n}', { n: a.risk })}</Pill>
        </View>
        <Text style={s.muted}>
          {a.probability != null && `P(malpractice) ${Math.round(a.probability * 100)}% · `}
          {a.sequenceScore != null && `${t('Sequence anomaly')} ${a.sequenceScore}`} · {t('{d} days since inspection', { d: p.days_since_inspection })}
        </Text>
        <Text style={[s.muted, { marginTop: 8 }]}>{t('Attendance – last 30 days')} ({t('sanctioned {n}', { n: p.sanctioned })})</Text>
        <AttendanceBars attendance={p.attendance} sanctioned={p.sanctioned} anomalous={a.anomalousDays} />
        {a.flags.length === 0 && <Text style={s.muted}>{t('No anomalies detected')}</Text>}
        {a.flags.map((f, i) => (
          <View key={i} style={{ marginTop: 6 }}>
            <Pill tone={f.sev === 'high' ? 'red' : 'amber'}>{f.code}</Pill>
            <Text style={{ color: C.text, marginTop: 2 }}>{f.text}</Text>
          </View>
        ))}
      </View>

      <View style={s.card}>
        <Text style={s.h2}>{t('CCTV cameras')}</Text>
        {p.cameras.map((c) => (
          <View key={c.id} style={[s.between, { paddingVertical: 6 }]}>
            <Text style={{ flex: 1, color: C.text }}>{c.label} <Text style={s.muted}>{c.id}</Text></Text>
            {c.online
              ? <Button tone="ghost" title={t('Live')} onPress={() => navigation.navigate('Camera', { camera: { ...c, project_name: p.name, project_id: p.id } })} />
              : <Pill tone="red">{t('Offline')}</Pill>}
          </View>
        ))}
        {p.cctvObservations.length > 0 && (
          <Text style={[s.muted, { marginTop: 6 }]}>
            {t('Last automatic check {when}: {n} people seen (expected ≈ {e})', { when: fmt(p.cctvObservations[0].ts), n: p.cctvObservations[0].persons, e: p.cctvObservations[0].expected })}
          </Text>
        )}
      </View>

      <View style={s.card}>
        <Text style={s.h2}>{t('Registered people')}</Text>
        {p.people.map((x) => (
          <View key={x.id} style={[s.between, { paddingVertical: 4 }]}>
            <Text style={{ color: C.text, flex: 1 }}>{x.name} <Text style={s.muted}>{t(x.kind)}</Text></Text>
            <Pill tone={x.face_enrolled ? 'green' : 'amber'}>{x.face_enrolled ? t('Face enrolled') : t('Not enrolled')}</Pill>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
