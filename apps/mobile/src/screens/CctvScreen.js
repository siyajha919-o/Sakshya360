import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api';
import { fmt, Pill } from '../components';
import LivePlayer from '../LivePlayer';
import { t, useLang } from '../i18n';
import { C, s } from '../theme';

export function CameraScreen({ route }) {
  useLang();
  const { camera: c } = route.params;
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      <Text style={s.h1}>{c.label}</Text>
      <Text style={[s.muted, { marginBottom: 10 }]}>{c.project_name} · {c.id}</Text>
      <LivePlayer cameraId={c.id} height={260} />
      <Text style={[s.muted, { marginTop: 10 }]}>{t('Live WebRTC stream relayed by the media server. Snapshots and AI people-counting are available on the web dashboard; automatic occupancy checks run in the background.')}</Text>
    </ScrollView>
  );
}

export default function CctvScreen({ navigation }) {
  useLang();
  const [cams, setCams] = useState([]);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try { setCams(await api('/cctv/cameras')); setError(''); } catch (e) { setError(e.message); }
    setRefreshing(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const byProject = cams.reduce((m, c) => ({ ...m, [c.project_id]: [...(m[c.project_id] || []), c] }), {});
  const offline = cams.filter((c) => !c.online).length;

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}>
      <View style={s.card}>
        <Text style={s.h2}>{t('CCTV surveillance')}</Text>
        <Text style={s.muted}>{t('{on} of {total} cameras online · each camera is health-checked every minute', { on: cams.length - offline, total: cams.length })}</Text>
      </View>
      {!!error && <Text style={s.error}>{error}</Text>}
      {Object.entries(byProject).map(([pid, list]) => (
        <View key={pid} style={s.card}>
          <Text style={s.h2}>{list[0].project_name}</Text>
          <Text style={[s.muted, { marginBottom: 6 }]}>{pid} · {list[0].district}, {list[0].state}</Text>
          {list.map((c) => (
            <Pressable key={c.id} disabled={!c.online} onPress={() => navigation.navigate('Camera', { camera: c })} style={[s.between, { paddingVertical: 8, borderTopWidth: 1, borderColor: C.line }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontWeight: '600' }}>{c.online ? '▶ ' : ''}{c.label}</Text>
                <Text style={s.muted}>
                  {c.online ? (c.last_checked ? t('checked {when}', { when: fmt(c.last_checked) }) : '') : t('offline since {when}', { when: c.offline_since ? fmt(c.offline_since) : '—' })}
                  {c.last_observation ? ` · ${t('{n} people seen', { n: c.last_observation.persons })}` : ''}
                </Text>
              </View>
              <Pill tone={c.online ? 'green' : 'red'}>{c.online ? t('Online') : t('Offline')}</Pill>
            </Pressable>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}
