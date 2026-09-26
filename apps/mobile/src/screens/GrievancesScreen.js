import { useCallback, useState } from 'react';
import { Alert, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api';
import { Button, fmt, Pill } from '../components';
import { t, useLang } from '../i18n';
import { C, s } from '../theme';

export const CATEGORIES = ['fake_attendance', 'staff_absent', 'food', 'facilities', 'behaviour', 'money_demanded', 'other', 'praise'];
export const CATEGORY_LABEL = {
  fake_attendance: 'Fake attendance / ghost beneficiaries', staff_absent: 'Staff absent', food: 'Food / meals',
  facilities: 'Facilities (water, toilets, beds)', behaviour: 'Staff behaviour', money_demanded: 'Money demanded', other: 'Other', praise: 'Appreciation',
};
const SERIOUS = ['fake_attendance', 'money_demanded', 'behaviour'];
const STATUS_TONE = { open: 'red', in_review: 'amber', resolved: 'green' };

function Item({ g, onDone }) {
  const [reply, setReply] = useState(g.response || '');
  const [busy, setBusy] = useState(false);
  const act = async (status) => {
    setBusy(true);
    try { await api(`/feedback/${g.id}/respond`, { body: { status, response: reply } }); onDone(); } catch (e) { Alert.alert(t('Failed'), e.message); } finally { setBusy(false); }
  };
  return (
    <View style={s.card}>
      <View style={s.between}>
        <Pill tone={g.category === 'praise' ? 'green' : SERIOUS.includes(g.category) ? 'red' : 'amber'}>{t(CATEGORY_LABEL[g.category] || g.category)}</Pill>
        <Pill tone={STATUS_TONE[g.status]}>{t(g.status.replace('_', ' '))}</Pill>
      </View>
      <Text style={[s.h2, { marginTop: 6, marginBottom: 0 }]}>{g.project_name}</Text>
      <Text style={s.muted}>{fmt(g.created_at)} · {g.channel === 'qr' ? t('Anonymous (QR code)') : t('{name} (OTP-verified beneficiary)', { name: g.person_name })}</Text>
      {(g.present === false || g.services_ok === false) && (
        <Text style={s.muted}>{g.present === false ? t('Says not present today') : ''}{g.present === false && g.services_ok === false ? ' · ' : ''}{g.services_ok === false ? t('Services not received') : ''}</Text>
      )}
      {!!g.text && <Text style={{ color: C.text, marginVertical: 6, fontSize: 15 }}>“{g.text}”</Text>}
      {g.category !== 'praise' && !['resolved', 'rejected'].includes(g.status) && (
        <>
          <TextInput style={[s.input, { minHeight: 60, textAlignVertical: 'top' }]} multiline placeholder={t('Action taken / reply to the beneficiary')} value={reply} onChangeText={setReply} />
          <View style={[s.row, { marginTop: 8 }]}>
            <Button style={{ flex: 1 }} tone="ghost" title={t('In review')} disabled={busy} onPress={() => act('in_review')} />
            <Button style={{ flex: 1 }} tone="green" title={t('Resolve')} disabled={busy || !reply.trim()} onPress={() => act('resolved')} />
            <Button style={{ flex: 1 }} tone="ghost" title={t('Reject')} disabled={busy} onPress={() => act('rejected')} />
          </View>
        </>
      )}
      {!!g.response && ['resolved', 'rejected'].includes(g.status) && <Text style={[s.muted, { marginTop: 4 }]}>{t('Reply')}: {g.response}</Text>}
    </View>
  );
}

export default function GrievancesScreen({ route, navigation }) {
  useLang();
  const projectId = route.params?.projectId;
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try { setItems(await api(`/feedback${projectId ? `?projectId=${projectId}` : ''}`)); setError(''); } catch (e) { setError(e.message); }
    setRefreshing(false);
  }, [projectId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}>
      <View style={s.card}>
        <Text style={s.h2}>{t('Beneficiary grievances')}</Text>
        <Text style={s.muted}>{t('From beneficiaries in the app and anonymous QR codes at each centre. Serious grievances raise alerts and increase the project risk score.')}</Text>
        {!!projectId && (
          <View style={[s.between, { marginTop: 6 }]}>
            <Text style={s.muted}>{t('Limited to project {id}', { id: projectId })}</Text>
            <Button tone="ghost" title={t('All projects')} onPress={() => navigation.setParams({ projectId: undefined })} />
          </View>
        )}
      </View>
      {!!error && <Text style={s.error}>{error}</Text>}
      {items.length === 0 && !error && <View style={s.card}><Text style={s.muted}>{t('No grievances.')}</Text></View>}
      {items.map((g) => <Item key={g.id} g={g} onDone={load} />)}
    </ScrollView>
  );
}
