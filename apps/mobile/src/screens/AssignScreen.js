import { useCallback, useState } from 'react';
import { Alert, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api, currentSession } from '../api';
import { Button, fmt, Pill } from '../components';
import { t, useLang } from '../i18n';
import { C, s } from '../theme';

const TONE = { completed: 'green', overdue: 'red', in_progress: 'amber', assigned: 'amber' };

export default function AssignScreen() {
  useLang();
  const isOfficial = currentSession().user.role === 'official';
  const [items, setItems] = useState([]);
  const [auto, setAuto] = useState(null);
  const [count, setCount] = useState('3');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [list, automation] = await Promise.all([api('/assignments'), api('/automation')]);
      setItems(list); setAuto(automation.settings.autoAssign); setError('');
    } catch (e) { setError(e.message); }
    setRefreshing(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const generate = async () => {
    setBusy(true);
    try {
      const r = await api('/assignments/optimize', { body: { count: parseInt(count, 10) || 3 } });
      Alert.alert(t('Surprise inspections assigned'), t('{n} inspection(s) assigned · solver {status} · seed {seed}', { n: r.created, status: r.solver.status, seed: r.seed }));
      load();
    } catch (e) { Alert.alert(t('Failed'), e.message); } finally { setBusy(false); }
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}>
      <View style={s.card}>
        <Text style={s.h2}>{t('Random inspection assignment')}</Text>
        <Text style={s.muted}>{t('Risk-weighted random selection with conflict-of-interest, rotation and capacity rules (OR-Tools).')}</Text>
        {auto && (
          <Text style={[s.muted, { marginTop: 6 }]}>
            {auto.enabled
              ? t('Automatic: {n} inspection(s) every {days} at {time} IST', { n: auto.count, days: auto.weekdaysOnly ? t('weekday') : t('day'), time: `${String(auto.hour).padStart(2, '0')}:${String(auto.minute).padStart(2, '0')}` })
              : t('Automatic assignment is switched off')}
          </Text>
        )}
        {isOfficial && (
          <View style={[s.row, { marginTop: 10 }]}>
            <TextInput style={[s.input, { width: 60 }]} keyboardType="number-pad" value={count} onChangeText={setCount} />
            <Button style={{ flex: 1 }} tone="saffron" title={`🎲 ${t('Generate now')}`} onPress={generate} busy={busy} />
          </View>
        )}
      </View>
      {!!error && <Text style={s.error}>{error}</Text>}
      {items.map((a) => (
        <View key={a.id} style={s.card}>
          <View style={s.between}>
            <Text style={[s.h2, { flex: 1, marginBottom: 0 }]}>{a.project_name}</Text>
            <Pill tone={TONE[a.status]}>{t(a.status.replace('_', ' '))}</Pill>
          </View>
          <Text style={s.muted}>{a.inspector_name} · {a.team} · {t('{km} km from base', { km: a.distance_km })}</Text>
          <Text style={s.muted}>{t('assigned {when}', { when: fmt(a.created_at) })} · {t('due {when}', { when: fmt(a.due_at) })}{a.solver?.trigger === 'scheduled' ? ` · ${t('automatic')}` : ''}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
