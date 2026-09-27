import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { absoluteUrl, api } from '../api';
import { Button, fmt, Pill } from '../components';
import { discard, flush, subscribe } from '../outbox';
import { t, useLang } from '../i18n';
import { s } from '../theme';

export default function MyReportsScreen() {
  useLang();
  const [items, setItems] = useState([]);
  const [queued, setQueued] = useState([]);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try { setItems(await api('/reports')); setError(''); } catch (e) { setError(e.message); }
    setRefreshing(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => subscribe(setQueued), []);

  const retry = async () => { const n = await flush(); if (n) load(); };
  const remove = (q) => Alert.alert(t('Discard queued report?'), t('The photos and data for {name} will be deleted from this phone.', { name: q.label }), [
    { text: t('Cancel'), style: 'cancel' },
    { text: t('Discard'), style: 'destructive', onPress: () => discard(q.id) },
  ]);

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { retry(); load(); }} />}>
      {queued.length > 0 && <Text style={[s.h2, { marginTop: 4 }]}>{t('Waiting to upload')}</Text>}
      {queued.map((q) => (
        <View key={q.id} style={s.card}>
          <View style={s.between}>
            <Text style={[s.h2, { flex: 1, marginBottom: 0 }]}>{q.label}</Text>
            <Pill tone={q.lastError ? 'red' : 'amber'}>{q.lastError ? t('Rejected') : t('Queued')}</Pill>
          </View>
          <Text style={s.muted}>{t('Inspected {when}', { when: fmt(q.data.capturedAt) })} · {t('{n} photo(s)', { n: q.photos.length })}{q.video ? ` · ${t('1 video')}` : ''}</Text>
          {!!q.lastError && <Text style={s.error}>{q.lastError}</Text>}
          <View style={[s.row, { marginTop: 8 }]}>
            <Button style={{ flex: 1 }} tone="ghost" title={t('Retry now')} onPress={retry} />
            <Button style={{ flex: 1 }} tone="ghost" title={t('Discard')} onPress={() => remove(q)} />
          </View>
        </View>
      ))}
      {queued.length > 0 && <Text style={[s.h2, { marginTop: 8 }]}>{t('Submitted')}</Text>}
      {!!error && <Text style={s.error}>{error}</Text>}
      {items.length === 0 && <View style={s.card}><Text style={s.muted}>{t('No reports submitted yet.')}</Text></View>}
      {items.map((r) => (
        <View key={r.id} style={s.card}>
          <View style={s.between}>
            <Text style={[s.h2, { flex: 1, marginBottom: 0 }]}>{r.project_name}</Text>
            <Pill tone={r.within_fence ? 'green' : 'red'}>{r.within_fence ? t('On-site') : t('Geo mismatch')}</Pill>
          </View>
          <Text style={s.muted}>{fmt(r.captured_at || r.submitted_at)} · {r.district}{r.delayed_sync ? ` · ${t('synced later')}` : ''}</Text>
          <Text style={s.muted}>{t('Compliance {score}% · headcount {h}/{r} · {n} evidence file(s)', { score: r.score, h: r.headcount, r: r.register_count, n: r.evidence.length })}</Text>
          <Text style={[s.muted, { fontSize: 10, marginTop: 4 }]}>sig {r.signature}</Text>
          <Button tone="ghost" style={{ marginTop: 8 }} title={t('Download PDF')} onPress={() => Linking.openURL(absoluteUrl(r.pdfUrl))} />
        </View>
      ))}
    </ScrollView>
  );
}
