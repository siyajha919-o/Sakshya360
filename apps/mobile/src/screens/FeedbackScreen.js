import { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api, currentSession } from '../api';
import { Button, fmt, Pill, Tricolor } from '../components';
import { getLang, t, useLang } from '../i18n';
import { CATEGORIES, CATEGORY_LABEL } from './GrievancesScreen';
import { C, s } from '../theme';

function YesNo({ value, onChange }) {
  return (
    <View style={s.row}>
      {[[true, t('Yes')], [false, t('No')]].map(([v, label]) => (
        <Button key={label} style={{ flex: 1 }} tone={value === v ? undefined : 'ghost'} title={label} onPress={() => onChange(v)} />
      ))}
    </View>
  );
}

// Beneficiaries (signed in with OTP) rate their centre and report problems directly to the Department.
export default function FeedbackScreen() {
  useLang();
  const me = currentSession().user;
  const empty = { category: '', rating: 0, present: null, servicesOk: null, text: '' };
  const [form, setForm] = useState(empty);
  const [mine, setMine] = useState([]);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const load = useCallback(async () => {
    setRefreshing(true);
    try { setMine(await api('/feedback/mine')); } catch { /* offline */ }
    setRefreshing(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const submit = async () => {
    setBusy(true);
    try {
      await api('/feedback', { body: { ...form, rating: form.rating || null, lang: getLang() } });
      Alert.alert(t('Thank you'), t('Your feedback has been sent to the Department. You will see their reply here.'));
      setForm(empty);
      load();
    } catch (e) { Alert.alert(t('Failed'), e.message); } finally { setBusy(false); }
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}>
      <View style={[s.card, { backgroundColor: C.navy }]}>
        <Text style={[s.h1, { color: '#fff' }]}>{t('Namaste, {name}', { name: me.name })}</Text>
        <Text style={{ color: '#d0d5dd' }}>{me.projectName}</Text>
        <Tricolor />
        <Text style={{ color: '#d0d5dd', fontSize: 12 }}>{t('Your feedback goes directly to the Department of Social Justice & Empowerment, not to the centre.')}</Text>
      </View>

      <View style={s.card}>
        <Text style={s.h2}>{t('What is it about?')}</Text>
        {CATEGORIES.map((c) => (
          <Pressable key={c} onPress={() => set({ category: c })} style={[s.row, { paddingVertical: 7 }]}>
            <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: C.navy, alignItems: 'center', justifyContent: 'center' }}>
              {form.category === c && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.navy }} />}
            </View>
            <Text style={{ color: C.text, flex: 1 }}>{t(CATEGORY_LABEL[c])}</Text>
          </Pressable>
        ))}
        <Text style={[s.muted, { marginTop: 10 }]}>{t('Were you at the centre today?')}</Text>
        <YesNo value={form.present} onChange={(v) => set({ present: v })} />
        <Text style={[s.muted, { marginTop: 10 }]}>{t('Did you receive the services / meals?')}</Text>
        <YesNo value={form.servicesOk} onChange={(v) => set({ servicesOk: v })} />
        <Text style={[s.muted, { marginTop: 10 }]}>{t('Rate the centre')}</Text>
        <View style={s.row}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable key={n} onPress={() => set({ rating: n })} hitSlop={6}><Text style={{ fontSize: 30, color: C.saffron }}>{n <= form.rating ? '★' : '☆'}</Text></Pressable>
          ))}
        </View>
        <Text style={[s.muted, { marginTop: 10 }]}>{t('Describe what happened')}</Text>
        <TextInput style={[s.input, { minHeight: 90, textAlignVertical: 'top' }]} multiline maxLength={2000} value={form.text} onChangeText={(v) => set({ text: v })} />
        <Button style={{ marginTop: 12 }} title={t('Send')} onPress={submit} busy={busy} disabled={!form.category} />
      </View>

      <Text style={s.h2}>{t('My feedback')}</Text>
      {mine.length === 0 && <View style={s.card}><Text style={s.muted}>{t('Nothing sent yet.')}</Text></View>}
      {mine.map((g) => (
        <View key={g.id} style={s.card}>
          <View style={s.between}>
            <Text style={{ fontWeight: '700', color: C.text, flex: 1 }}>{t(CATEGORY_LABEL[g.category])}</Text>
            <Pill tone={{ open: 'amber', in_review: 'amber', resolved: 'green', rejected: 'red' }[g.status]}>{t(g.status.replace('_', ' '))}</Pill>
          </View>
          <Text style={s.muted}>{fmt(g.created_at)}</Text>
          {!!g.text && <Text style={{ color: C.text, marginTop: 4 }}>{g.text}</Text>}
          {!!g.response && <Text style={{ color: C.ok, marginTop: 6 }}>{t('Department reply')}: {g.response}</Text>}
        </View>
      ))}
    </ScrollView>
  );
}
