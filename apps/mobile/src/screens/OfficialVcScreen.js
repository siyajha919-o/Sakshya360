import { useCallback, useEffect, useState } from 'react';
import { Modal, RefreshControl, ScrollView, Switch, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { WebView } from 'react-native-webview';
import { useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { api, currentSession, getSocket } from '../api';
import { Button, fmt, Pill } from '../components';
import { jitsiUrl } from '../jitsi';
import { t, useLang } from '../i18n';
import { C, s } from '../theme';

const CHECKS = [
  ['identity', 'Face matches registered person'],
  ['premises', 'Premises / signboard shown live'],
  ['beneficiaries', 'Beneficiaries physically present'],
  ['register', 'Attendance register shown on camera'],
];

// Officials start a random video verification from the phone; the server picks the project and person.
export default function OfficialVcScreen({ route, navigation }) {
  useLang();
  const projectId = route.params?.projectId;
  const [history, setHistory] = useState([]);
  const [call, setCall] = useState(null);
  const [answered, setAnswered] = useState(null);
  const [checks, setChecks] = useState({});
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [camPerm, requestCam] = useCameraPermissions();
  const [micPerm, requestMic] = useMicrophonePermissions();

  const load = useCallback(async () => {
    setRefreshing(true);
    try { setHistory(await api('/vc')); } catch (e) { setError(e.message); }
    setRefreshing(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    if (!call) return undefined;
    const t0 = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
    const sock = getSocket();
    const onAnswer = (v) => { if (v.id === call.id) setAnswered(v.seconds); };
    sock.on('vc:answered', onAnswer);
    return () => { clearInterval(timer); sock.off('vc:answered', onAnswer); };
  }, [call]);

  const start = async () => {
    setBusy(true); setError('');
    try {
      if (!camPerm?.granted) await requestCam();
      if (!micPerm?.granted) await requestMic();
      setChecks({}); setAnswered(null); setElapsed(0);
      setCall(await api('/vc/random', { body: projectId ? { projectId } : {} }));
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const close = async (outcome) => {
    setBusy(true);
    try { await api(`/vc/${call.id}/close`, { body: { outcome, checks } }); setCall(null); load(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}>
      <View style={s.card}>
        <Text style={s.h2}>{t('Random video verification')}</Text>
        <Text style={[s.muted, { marginBottom: 10 }]}>{t('The server picks a project and a person at random. Their phone rings, even if the app is closed, and they have 60 seconds to answer.')}</Text>
        {!!projectId && (
          <View style={[s.between, { marginBottom: 6 }]}>
            <Text style={s.muted}>{t('Limited to project {id}', { id: projectId })}</Text>
            <Button tone="ghost" title={t('Any project')} onPress={() => navigation.setParams({ projectId: undefined })} />
          </View>
        )}
        <Button tone="saffron" title={t('Start random VC')} onPress={start} busy={busy} />
        {!!error && <Text style={[s.error, { marginTop: 8 }]}>{error}</Text>}
      </View>
      <Text style={s.h2}>{t('Call history')}</Text>
      {history.map((v) => (
        <View key={v.id} style={s.card}>
          <View style={s.between}>
            <Text style={{ fontWeight: '700', color: C.text, flex: 1 }}>{v.person_name} <Text style={s.muted}>({t(v.person_kind)})</Text></Text>
            {v.outcome ? <Pill tone={v.outcome === 'verified' ? 'green' : 'red'}>{t(v.outcome)}</Pill> : <Pill tone="amber">{t('open')}</Pill>}
          </View>
          <Text style={s.muted}>{v.project_name} · {fmt(v.started_at)}{v.answered_at ? ` · ${t('answered in {s}s', { s: Math.round((new Date(v.answered_at) - new Date(v.started_at)) / 1000) })}` : ''}</Text>
        </View>
      ))}

      <Modal visible={!!call} animationType="slide" onRequestClose={() => {}}>
        {call && (
          <View style={{ flex: 1, backgroundColor: '#000' }}>
            <WebView source={{ uri: jitsiUrl(call, `DoSJE – ${currentSession().user.name}`) }} style={{ flex: 1 }}
              mediaPlaybackRequiresUserAction={false} allowsInlineMediaPlayback javaScriptEnabled domStorageEnabled mediaCapturePermissionGrantType="grant" />
            <ScrollView style={{ maxHeight: 330, backgroundColor: '#fff' }} contentContainerStyle={{ padding: 12 }}>
              <View style={s.between}>
                <Text style={{ fontWeight: '700', color: C.text, flex: 1 }}>{call.person_name} · {call.project_name}</Text>
                <Text style={{ fontVariant: ['tabular-nums'], color: C.text }}>{mmss}</Text>
              </View>
              {answered == null
                ? <Pill tone={elapsed > call.answerWindowS ? 'red' : 'amber'}>{elapsed > call.answerWindowS ? t('Not answered in time') : t('Ringing on their phone…')}</Pill>
                : <Pill tone={answered > call.answerWindowS ? 'amber' : 'green'}>{t('Answered in {s}s', { s: answered })}</Pill>}
              {CHECKS.map(([k, label]) => (
                <View key={k} style={[s.between, { paddingVertical: 4 }]}>
                  <Text style={{ color: C.text, flex: 1 }}>{k === 'identity' ? t('Face matches {name}', { name: call.person_name }) : t(label)}</Text>
                  <Switch value={!!checks[k]} onValueChange={(v) => setChecks({ ...checks, [k]: v })} />
                </View>
              ))}
              <View style={[s.row, { marginTop: 8 }]}>
                <Button style={{ flex: 1 }} tone="green" title={t('Close & record')} busy={busy} onPress={() => close(null)} />
                <Button style={{ flex: 1 }} tone="red" title={t('Flag suspicious')} disabled={busy} onPress={() => close('suspicious')} />
              </View>
            </ScrollView>
          </View>
        )}
      </Modal>
    </ScrollView>
  );
}
