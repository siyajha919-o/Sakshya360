import { useCallback, useEffect, useState } from 'react';
import { Linking, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, currentSession, getSocket, NetworkError } from '../api';
import { Banner, Button, fmt, Pill, Tricolor } from '../components';
import { flush, subscribe } from '../outbox';
import { locale, t, useLang } from '../i18n';
import { C, s } from '../theme';

const CACHE = 'sakshya360.duties';

export default function DutiesScreen({ navigation }) {
  useLang();
  const [items, setItems] = useState([]);
  const [offline, setOffline] = useState(null); // cached-at timestamp when showing cached duties
  const [queued, setQueued] = useState([]);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const open = (await api('/assignments')).filter((a) => a.status !== 'completed');
      setItems(open); setOffline(null); setError('');
      AsyncStorage.setItem(CACHE, JSON.stringify({ at: new Date().toISOString(), user: currentSession().user.id, items: open })).catch(() => {});
    } catch (e) {
      // No network: show the last duties we saw so the inspector can still work in the field.
      const cached = JSON.parse((await AsyncStorage.getItem(CACHE).catch(() => null)) || 'null');
      if (e instanceof NetworkError && cached && cached.user === currentSession().user.id) { setItems(cached.items); setOffline(cached.at); setError(''); } else setError(e.message);
    }
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => subscribe(setQueued), []);
  useEffect(() => {
    const sock = getSocket();
    sock.on('assignment:new', load);
    sock.on('assignment:overdue', load);
    return () => { sock.off('assignment:new', load); sock.off('assignment:overdue', load); };
  }, [load]);

  const start = async (a) => {
    if (a.status === 'assigned' || a.status === 'overdue') await api(`/assignments/${a.id}/start`, { method: 'POST' }).catch(() => {});
    navigation.navigate('Inspection', { assignment: a });
  };
  const queuedIds = new Set(queued.map((q) => q.data.assignmentId));
  const visible = items.filter((a) => !queuedIds.has(a.id));

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}>
      <View style={[s.card, { backgroundColor: C.navy }]}>
        <Text style={[s.h1, { color: '#fff' }]}>{currentSession().user.name}</Text>
        <Text style={{ color: '#d0d5dd' }}>{currentSession().user.team} · {t('{n} surprise inspection(s) pending', { n: visible.length })}</Text>
        <Tricolor />
        <Text style={{ color: '#d0d5dd', fontSize: 12 }}>{t('Duties are assigned at random by the Division. Sites are not notified in advance.')}</Text>
      </View>
      {!!offline && <Banner>{t('Offline – showing duties saved {when}', { when: fmt(offline) })}</Banner>}
      {queued.length > 0 && (
        <Banner tone="blue" onPress={() => flush().then(load)}>
          {t('{n} report(s) waiting to upload. They will be sent automatically – tap to retry now.', { n: queued.length })}
        </Banner>
      )}
      {!!error && <Text style={s.error}>{error}</Text>}
      {visible.length === 0 && !error && <View style={s.card}><Text style={s.muted}>{t('No pending duties. Pull down to refresh.')}</Text></View>}
      {visible.map((a) => (
        <View key={a.id} style={s.card}>
          <View style={s.between}>
            <Text style={[s.h2, { flex: 1, marginBottom: 0 }]}>{a.project_name}</Text>
            <Pill tone={a.status === 'overdue' ? 'red' : a.status === 'in_progress' ? 'green' : 'amber'}>
              {a.status === 'overdue' ? t('Overdue') : a.status === 'in_progress' ? t('In progress') : t('Due {date}', { date: new Date(a.due_at).toLocaleDateString(locale()) })}
            </Pill>
          </View>
          <Text style={s.muted}>{a.scheme} · {a.ngo}</Text>
          <Text style={s.muted}>{a.district}, {a.state} · {t('{km} km from base', { km: a.distance_km })} · {t('assigned {when}', { when: fmt(a.created_at) })}</Text>
          <View style={[s.row, { marginTop: 10 }]}>
            <Button tone="ghost" style={{ flex: 1 }} title={t('Navigate')}
              onPress={() => Linking.openURL(`https://www.openstreetmap.org/directions?to=${a.lat}%2C${a.lng}`)} />
            <Button tone="green" style={{ flex: 1 }} title={t('Start inspection')} onPress={() => start(a)} />
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
