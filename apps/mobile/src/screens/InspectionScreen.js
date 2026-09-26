import { useEffect, useRef, useState } from 'react';
import { Alert, Image, Linking, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as Location from 'expo-location';
import * as ImageManipulator from 'expo-image-manipulator';
import { absoluteUrl, currentSession } from '../api';
import { Button, Pill } from '../components';
import { submitOrQueue } from '../outbox';
import SiteMap, { distanceM } from '../SiteMap';
import { t, useLang } from '../i18n';
import { useWatermark } from '../Watermark';
import { C, s } from '../theme';

// Sent to the server in English so records are consistent; shown translated.
const CHECKLIST = [
  'Signboard with scheme name displayed',
  'Beneficiary register maintained & signed',
  'Biometric / face attendance in use',
  'Kitchen & toilets hygienic',
  'Food served as per menu',
  'Staff present as per sanctioned posts',
  'Grievance box / helpline displayed',
  'CCTV cameras functional',
  'Fire safety & first-aid available',
  'Fund utilisation records available',
];

const stampTime = (d) => d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' IST';

export default function InspectionScreen({ route, navigation }) {
  useLang();
  const { assignment: a } = route.params;
  const site = { lat: a.lat, lng: a.lng };
  const [camPerm, requestCam] = useCameraPermissions();
  const [micPerm, requestMic] = useMicrophonePermissions();
  const camera = useRef(null);
  const { stage, stamp } = useWatermark();
  const [position, setPosition] = useState(null);
  const [simulate, setSimulate] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [video, setVideo] = useState(null);
  const [recording, setRecording] = useState(false);
  const [shooting, setShooting] = useState(false);
  const [checks, setChecks] = useState(CHECKLIST.map(() => false));
  const [headcount, setHeadcount] = useState('');
  const [register, setRegister] = useState(String(a.register_count ?? ''));
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);

  // Live GPS lock (or a clearly flagged simulated on-site position for demos).
  useEffect(() => {
    if (simulate) { setPosition({ lat: site.lat + 0.0004, lng: site.lng + 0.0003, accuracy: 8, simulated: true }); return undefined; }
    let sub;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert(t('Location required'), t('Inspection reports must be geo-tagged.')); return; }
      sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 5 },
        (p) => setPosition({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, simulated: false, mocked: p.mocked }));
    })();
    return () => sub && sub.remove();
  }, [simulate]);

  useEffect(() => { if (camPerm && !camPerm.granted) requestCam(); }, [camPerm]);

  const dist = position ? distanceM(position, site) : null;
  const within = dist != null && dist <= (a.geofence_m || 250);

  const takePhoto = async () => {
    if (!camera.current || shooting) return;
    if (photos.length >= 6) return Alert.alert(t('Limit reached'), t('Up to 6 photos per report.'));
    if (!position) return Alert.alert(t('Waiting for GPS lock'));
    setShooting(true);
    try {
      const at = new Date();
      const shot = await camera.current.takePictureAsync({ quality: 0.8, exif: true });
      const small = await ImageManipulator.manipulateAsync(shot.uri, [{ resize: { width: 1280 } }], { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG });
      const { uri, stamped } = await stamp(small.uri, small.width, small.height, [
        `Sakshya360 · DoSJE surprise inspection · ${a.project_id}`,
        `${a.project_name}, ${a.district}`,
        `GPS ${position.lat.toFixed(6)}, ${position.lng.toFixed(6)} ±${Math.round(position.accuracy)} m · ${dist} m from site${position.simulated ? ' · SIMULATED' : ''}`,
        `${stampTime(at)} · ${currentSession().user.name} · ${a.id}`,
      ]);
      setPhotos((p) => [...p, { uri, at: at.toISOString(), stamped }]);
    } catch (e) {
      Alert.alert(t('Camera error'), e.message);
    } finally {
      setShooting(false);
    }
  };

  const recordVideo = async () => {
    if (recording) { camera.current.stopRecording(); return; }
    if (!micPerm?.granted) { const r = await requestMic(); if (!r.granted) return; }
    setRecording(true);
    try {
      const v = await camera.current.recordAsync({ maxDuration: 20 });
      if (v) setVideo(v.uri);
    } catch (e) {
      Alert.alert(t('Recording failed'), e.message);
    } finally {
      setRecording(false);
    }
  };

  const submit = async () => {
    if (!position) return Alert.alert(t('Waiting for GPS lock'));
    if (!photos.length) return Alert.alert(t('Capture at least one live photo'));
    if (headcount === '' || Number.isNaN(parseInt(headcount, 10))) return Alert.alert(t('Enter the physical headcount'));
    if (position.mocked) return Alert.alert(t('Mock location detected'), t('Disable mock-location apps to submit.'));
    setBusy(true);
    try {
      const data = {
        assignmentId: a.id, lat: position.lat, lng: position.lng, accuracy: position.accuracy, simulated: !!position.simulated,
        capturedAt: photos[0].at, // time of the first live photo = when the inspector was on site
        checklist: CHECKLIST.map((item, i) => ({ item, ok: checks[i] })),
        headcount: parseInt(headcount, 10), registerCount: register === '' ? undefined : parseInt(register, 10), remarks,
      };
      const r = await submitOrQueue({ data, photos: photos.map((p) => p.uri), video, label: a.project_name });
      if (r.queued) {
        Alert.alert(t('Saved offline'), t('No network. The report and its evidence are stored on this phone and will upload automatically when you are back online. The original inspection time is kept.'),
          [{ text: t('OK'), onPress: () => navigation.popToTop() }]);
        return;
      }
      Alert.alert(r.withinFence ? t('Report submitted') : t('Submitted – outside geofence'),
        t('Compliance {score}% · {n} evidence file(s) fingerprinted', { score: r.score, n: r.evidence.length }) + `\n${t('Signature')} ${r.signature.slice(0, 16)}…`,
        [{ text: t('Open PDF'), onPress: () => { Linking.openURL(absoluteUrl(r.pdfUrl)); navigation.popToTop(); } }, { text: t('OK'), onPress: () => navigation.popToTop() }]);
    } catch (e) {
      Alert.alert(t('Submission failed'), e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      {stage}
      <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
        <Text style={s.h1}>{a.project_name}</Text>
        <Text style={[s.muted, { marginBottom: 12 }]}>{a.ngo} · {a.district}, {a.state}</Text>

        <View style={s.card}>
          <Text style={s.h2}>1 · {t('Location lock')}</Text>
          <SiteMap site={site} radius={a.geofence_m || 250} position={position} withinFence={within} />
          <View style={[s.between, { marginTop: 8 }]}>
            <Text style={s.muted}>{position ? t('±{acc} m · {dist} from site', { acc: Math.round(position.accuracy), dist: dist > 5000 ? (dist / 1000).toFixed(1) + ' km' : dist + ' m' }) : t('Acquiring GPS…')}</Text>
            {position && <Pill tone={within ? 'green' : 'red'}>{within ? t('Inside geofence') : t('Outside geofence')}</Pill>}
          </View>
          <View style={[s.between, { marginTop: 8 }]}>
            <Text style={[s.muted, { flex: 1 }]}>{t('Demo: simulate being on site (flagged on the report)')}</Text>
            <Switch value={simulate} onValueChange={setSimulate} />
          </View>
        </View>

        <View style={s.card}>
          <Text style={s.h2}>2 · {t('Live evidence')}</Text>
          <Text style={[s.muted, { marginBottom: 8 }]}>{t('In-app camera only. GPS, time and inspector are stamped on every photo; every file is SHA-256 fingerprinted and duplicates are rejected.')}</Text>
          {camPerm?.granted ? (
            <CameraView ref={camera} style={{ height: 260, borderRadius: 10, overflow: 'hidden' }} facing="back" mode={recording ? 'video' : 'picture'} />
          ) : <Button title={t('Allow camera')} onPress={requestCam} />}
          <View style={[s.row, { marginTop: 8 }]}>
            <Button style={{ flex: 1 }} tone="saffron" title={`📸 ${t('Photo')}`} onPress={takePhoto} busy={shooting} disabled={!camPerm?.granted || recording} />
            <Button style={{ flex: 1 }} tone={recording ? 'red' : 'ghost'} title={recording ? `■ ${t('Stop')}` : video ? `🎥 ${t('Re-record')}` : `🎥 ${t('20s video')}`} onPress={recordVideo} disabled={!camPerm?.granted || shooting} />
          </View>
          <ScrollView horizontal style={{ marginTop: 8 }}>
            {photos.map((p) => <Image key={p.uri} source={{ uri: p.uri }} style={{ width: 90, height: 120, borderRadius: 8, marginRight: 6 }} />)}
          </ScrollView>
          <Text style={s.muted}>{t('{n} photo(s)', { n: photos.length })}{video ? ` · ${t('1 video')}` : ''}{photos.some((p) => !p.stamped) ? ` · ${t('some photos could not be stamped')}` : ''}</Text>
        </View>

        <View style={s.card}>
          <Text style={s.h2}>3 · {t('Checklist')}</Text>
          {CHECKLIST.map((item, i) => (
            <View key={item} style={[s.between, { paddingVertical: 6, borderBottomWidth: 1, borderColor: C.line }]}>
              <Text style={{ flex: 1, color: C.text }}>{t(item)}</Text>
              <Switch value={checks[i]} onValueChange={(v) => setChecks((c) => c.map((x, j) => (j === i ? v : x)))} />
            </View>
          ))}
        </View>

        <View style={s.card}>
          <Text style={s.h2}>4 · {t('Headcount')}</Text>
          <View style={s.row}>
            <View style={{ flex: 1 }}><Text style={s.muted}>{t('Physically present')}</Text><TextInput style={s.input} keyboardType="number-pad" value={headcount} onChangeText={setHeadcount} /></View>
            <View style={{ flex: 1 }}><Text style={s.muted}>{t('Register claims today')}</Text><TextInput style={s.input} keyboardType="number-pad" value={register} onChangeText={setRegister} /></View>
          </View>
          <Text style={[s.muted, { marginTop: 10 }]}>{t('Remarks')}</Text>
          <TextInput style={[s.input, { minHeight: 80, textAlignVertical: 'top' }]} multiline value={remarks} onChangeText={setRemarks} />
        </View>

        <Button tone="green" title={t('Submit signed report')} onPress={submit} busy={busy} />
        <Text style={[s.muted, { marginTop: 8, textAlign: 'center' }]}>{t('No signal? The report is saved on the phone and sent automatically later.')}</Text>
      </ScrollView>
    </View>
  );
}
