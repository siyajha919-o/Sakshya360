import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Modal, RefreshControl, ScrollView, Switch, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import * as ImageManipulator from 'expo-image-manipulator';
import { api, filePart } from '../api';
import { Button, Pill, Tricolor } from '../components';
import { t, useLang } from '../i18n';
import { C, s } from '../theme';

// Face (OpenCV YuNet + SFace on the server) + geofence verified attendance.
export default function AttendanceScreen() {
  useLang();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [capture, setCapture] = useState(null); // { person, mode: 'enroll' | 'checkin' }
  const [simulate, setSimulate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [camPerm, requestCam] = useCameraPermissions();
  const camera = useRef(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try { setData(await api('/attendance/people')); setError(''); } catch (e) { setError(e.message); }
    setRefreshing(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { if (camPerm && !camPerm.granted) requestCam(); }, [camPerm]);

  const location = async () => {
    if (simulate) return { lat: data.site.lat + 0.0002, lng: data.site.lng, accuracy: 10, simulated: true };
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') throw new Error(t('Location permission is required'));
    const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    if (p.mocked) throw new Error(t('Mock location detected'));
    return { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, simulated: false };
  };

  const shoot = async () => {
    setBusy(true);
    try {
      const shot = await camera.current.takePictureAsync({ quality: 0.8 });
      const img = await ImageManipulator.manipulateAsync(shot.uri, [{ resize: { width: 720 } }], { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG });
      const form = new FormData();
      const { person, mode } = capture;
      if (mode === 'enroll') {
        form.append('image', filePart(img.uri, 'face.jpg', 'image/jpeg'));
        await api(`/attendance/enroll/${person.id}`, { form });
        Alert.alert(t('Face enrolled'), person.name);
      } else {
        const loc = await location();
        form.append('selfie', filePart(img.uri, 'selfie.jpg', 'image/jpeg'));
        form.append('data', JSON.stringify({ personId: person.id, ...loc }));
        const r = await api('/attendance/checkin', { form });
        Alert.alert(r.accepted ? `✅ ${t('Attendance recorded')}` : `❌ ${t('Check-in rejected')}`,
          `${r.reason ? t(r.reason) + '\n' : ''}${t('Face score {score} · {m} m from site', { score: r.faceScore ?? '—', m: r.distanceM })}`);
      }
      setCapture(null);
      load();
    } catch (e) {
      Alert.alert(t('Failed'), e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}>
      {data && (
        <View style={[s.card, { backgroundColor: C.navy }]}>
          <Text style={[s.h1, { color: '#fff' }]}>{data.site.name}</Text>
          <Text style={{ color: '#d0d5dd' }}>{data.site.district} · {t('geofence {m} m', { m: data.site.geofence_m })}</Text>
          <Tricolor />
          <Text style={{ color: '#d0d5dd', fontSize: 12 }}>{t('Attendance counts only with a live face match inside the geofence. Proxy or remote check-ins are rejected and reported.')}</Text>
        </View>
      )}
      {!!error && <Text style={s.error}>{error}</Text>}
      <View style={[s.card, s.between]}>
        <Text style={[s.muted, { flex: 1 }]}>{t('Demo: simulate being on site')}</Text>
        <Switch value={simulate} onValueChange={setSimulate} />
      </View>
      {data && data.people.map((p) => (
        <View key={p.id} style={s.card}>
          <View style={s.between}>
            <View style={{ flex: 1 }}>
              <Text style={s.h2}>{p.name}</Text>
              <Text style={s.muted}>{t(p.kind)}</Text>
            </View>
            {p.today ? <Pill tone={p.today.accepted ? 'green' : 'red'}>{p.today.accepted ? t('Present') : t('Rejected')}</Pill> : <Pill>{t('Not marked')}</Pill>}
          </View>
          <View style={[s.row, { marginTop: 10 }]}>
            <Button style={{ flex: 1 }} tone="ghost" title={p.face_enrolled ? t('Re-enrol face') : t('Enrol face')} onPress={() => setCapture({ person: p, mode: 'enroll' })} />
            <Button style={{ flex: 1 }} tone="green" title={t('Mark present')} disabled={!p.face_enrolled} onPress={() => setCapture({ person: p, mode: 'checkin' })} />
          </View>
        </View>
      ))}

      <Modal visible={!!capture} animationType="slide" onRequestClose={() => setCapture(null)}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          {camPerm?.granted ? <CameraView ref={camera} style={{ flex: 1 }} facing="front" /> : <Button title={t('Allow camera')} onPress={requestCam} />}
          <View style={{ padding: 16, backgroundColor: C.navy, gap: 8 }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{capture?.mode === 'enroll' ? t('Enrol') : t('Verify')}: {capture?.person.name}</Text>
            <Text style={{ color: '#d0d5dd', fontSize: 12 }}>{t('One face, well lit, looking at the camera.')}</Text>
            <Button tone="saffron" title={`📸 ${t('Capture')}`} onPress={shoot} busy={busy} />
            <Button tone="ghost" title={t('Cancel')} onPress={() => setCapture(null)} />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
