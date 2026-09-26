import { useCallback, useEffect, useState } from 'react';
import { Modal, RefreshControl, ScrollView, Text, Vibration, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { WebView } from 'react-native-webview';
import { api, getSocket } from '../api';
import { Button, fmt, Pill } from '../components';
import { jitsiUrl } from '../jitsi';
import { t, useLang } from '../i18n';
import { C, s } from '../theme';

export default function VcScreen() {
  useLang();
  const [incoming, setIncoming] = useState(null);
  const [inCall, setInCall] = useState(null);
  const [history, setHistory] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [camPerm, requestCam] = useCameraPermissions();
  const [micPerm, requestMic] = useMicrophonePermissions();

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setHistory(await api('/vc'));
      const pending = await api('/vc/pending');
      if (pending && !pending.answered_at) setIncoming((cur) => cur || pending);
    } catch { /* offline; socket will retry */ }
    setRefreshing(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    const sock = getSocket();
    const onIncoming = (call) => { setIncoming(call); Vibration.vibrate([0, 600, 400, 600, 400, 600]); };
    const onEnded = ({ id }) => {
      setIncoming((c) => (c && c.id === id ? null : c));
      setInCall((c) => (c && c.id === id ? null : c));
      load();
    };
    sock.on('vc:incoming', onIncoming);
    sock.on('vc:ended', onEnded);
    return () => { sock.off('vc:incoming', onIncoming); sock.off('vc:ended', onEnded); };
  }, [load]);

  const answer = async () => {
    if (!camPerm?.granted) await requestCam();
    if (!micPerm?.granted) await requestMic();
    try { await api(`/vc/${incoming.id}/answer`, { method: 'POST' }); } catch { /* already answered */ }
    Vibration.cancel();
    setInCall(incoming);
    setIncoming(null);
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}>
      <View style={s.card}>
        <Text style={s.h2}>{t('Random video verification')}</Text>
        <Text style={s.muted}>{t('DoSJE officials may call at any time without notice. Answer within 60 seconds and show the premises, register and beneficiaries live. Calls ring on this phone even when the app is closed.')}</Text>
      </View>
      <Text style={[s.h2, { marginTop: 8 }]}>{t('Call history')}</Text>
      {history.length === 0 && <View style={s.card}><Text style={s.muted}>{t('No calls yet.')}</Text></View>}
      {history.map((v) => (
        <View key={v.id} style={s.card}>
          <View style={s.between}>
            <Text style={{ fontWeight: '700', color: C.text }}>{v.person_name}</Text>
            {v.outcome ? <Pill tone={v.outcome === 'verified' ? 'green' : 'red'}>{t(v.outcome)}</Pill> : <Pill tone="amber">{t('open')}</Pill>}
          </View>
          <Text style={s.muted}>{fmt(v.started_at)} · {t('called by {name}', { name: v.caller_name })}</Text>
        </View>
      ))}

      <Modal visible={!!incoming} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.7)', justifyContent: 'center', padding: 24 }}>
          <View style={[s.card, { alignItems: 'center' }]}>
            <Text style={{ fontSize: 40 }}>📞</Text>
            <Text style={s.h1}>{t('Incoming DoSJE verification call')}</Text>
            <Text style={[s.muted, { textAlign: 'center', marginVertical: 8 }]}>{t('From {name}', { name: incoming?.caller_name })}{'\n'}{t('Requested person')}: <Text style={{ fontWeight: '700' }}>{incoming?.person_name}</Text> ({t(incoming?.person_kind || '')})</Text>
            <Button tone="green" title={t('Answer now')} onPress={answer} style={{ alignSelf: 'stretch' }} />
          </View>
        </View>
      </Modal>

      <Modal visible={!!inCall} animationType="slide" onRequestClose={() => setInCall(null)}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          {inCall && (
            <WebView source={{ uri: jitsiUrl(inCall) }} style={{ flex: 1 }}
              mediaPlaybackRequiresUserAction={false} allowsInlineMediaPlayback javaScriptEnabled domStorageEnabled
              mediaCapturePermissionGrantType="grant" />
          )}
          <View style={{ padding: 12, backgroundColor: C.navy }}>
            <Button tone="red" title={t('Leave call')} onPress={() => { setInCall(null); load(); }} />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
