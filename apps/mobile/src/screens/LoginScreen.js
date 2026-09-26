import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { API_BASE, api, saveSession } from '../api';
import { Button, LangToggle, Tricolor } from '../components';
import { t, useLang } from '../i18n';
import { C, s } from '../theme';

const DEMO = [
  ['official@dosje.gov.in', 'DoSJE Division official'],
  ['district.lucknow@dosje.gov.in', 'District authority – Lucknow'],
  ['i01@pmu.sakshya360.in', 'PMU Inspector – Arjun Mehta'],
  ['i05@pmu.sakshya360.in', 'PMU Inspector – Farhan Qureshi'],
  ['p101@ngo.sakshya360.in', 'NGO – Rehab Centre, Lucknow'],
  ['p103@ngo.sakshya360.in', 'NGO – SMILE Shelter, Bhopal'],
];
const DEMO_PHONES = [['9000000101', 'P101 · Lucknow'], ['9000000103', 'P103 · Bhopal']];

function Tabs({ mode, setMode }) {
  return (
    <View style={[s.row, { marginBottom: 12 }]}>
      {[['staff', t('Officials & staff')], ['beneficiary', t('Beneficiary')]].map(([m, label]) => (
        <Pressable key={m} onPress={() => setMode(m)} style={{ flex: 1, paddingVertical: 8, borderBottomWidth: 3, borderColor: mode === m ? C.saffron : C.line }}>
          <Text style={{ textAlign: 'center', fontWeight: '700', color: mode === m ? C.navy : C.muted }}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function StaffLogin({ onLogin }) {
  const [email, setEmail] = useState(DEMO[2][0]);
  const [password, setPassword] = useState('demo@123');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true); setError('');
    try {
      const sess = await api('/login', { body: { email: email.trim(), password } });
      await saveSession(sess);
      onLogin(sess);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Text style={s.muted}>{t('Email')}</Text>
      <TextInput style={[s.input, { marginBottom: 10 }]} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <Text style={s.muted}>{t('Password')}</Text>
      <TextInput style={[s.input, { marginBottom: 12 }]} value={password} onChangeText={setPassword} secureTextEntry />
      {!!error && <Text style={[s.error, { marginBottom: 8 }]}>{error}</Text>}
      <Button title={t('Sign in')} onPress={submit} busy={busy} />
      <Text style={[s.muted, { marginTop: 14 }]}>{t('Demo accounts (password demo@123):')}</Text>
      {DEMO.map(([e, label]) => (
        <Pressable key={e} onPress={() => setEmail(e)} style={{ paddingVertical: 4 }}>
          <Text style={{ color: C.navy2 }}>{e}</Text><Text style={s.muted}>{label}</Text>
        </Pressable>
      ))}
    </>
  );
}

function BeneficiaryLogin({ onLogin }) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [devOtp, setDevOtp] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const request = async () => {
    setBusy(true); setError('');
    try {
      const r = await api('/auth/otp/request', { body: { phone } });
      setSent(true);
      setDevOtp(r.devOtp || '');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const verify = async () => {
    setBusy(true); setError('');
    try {
      const sess = await api('/auth/otp/verify', { body: { phone, code } });
      await saveSession(sess);
      onLogin(sess);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <>
      <Text style={[s.muted, { marginBottom: 10 }]}>{t('Registered beneficiaries can give feedback and report problems at their centre. Your complaint goes directly to the Department.')}</Text>
      <Text style={s.muted}>{t('Mobile number')}</Text>
      <TextInput style={[s.input, { marginBottom: 10 }]} value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={14} placeholder="98XXXXXXXX" editable={!sent} />
      {sent && (
        <>
          <Text style={s.muted}>{t('OTP sent by SMS')}</Text>
          <TextInput style={[s.input, { marginBottom: 10, letterSpacing: 6, fontSize: 20 }]} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} />
          {!!devOtp && <Text style={[s.muted, { marginBottom: 8 }]}>{t('Demo mode – no SMS gateway configured. OTP: {code}', { code: devOtp })}</Text>}
        </>
      )}
      {!!error && <Text style={[s.error, { marginBottom: 8 }]}>{error}</Text>}
      {sent
        ? <><Button title={t('Verify and sign in')} onPress={verify} busy={busy} disabled={code.length !== 6} />
            <Button tone="ghost" style={{ marginTop: 8 }} title={t('Change number')} onPress={() => { setSent(false); setCode(''); }} /></>
        : <Button title={t('Send OTP')} onPress={request} busy={busy} disabled={phone.replace(/\D/g, '').length < 10} />}
      <Text style={[s.muted, { marginTop: 14 }]}>{t('Demo numbers:')}</Text>
      {DEMO_PHONES.map(([p, label]) => (
        <Pressable key={p} onPress={() => { setPhone(p); setSent(false); }} style={{ paddingVertical: 4 }}>
          <Text style={{ color: C.navy2 }}>{p}</Text><Text style={s.muted}>{label}</Text>
        </Pressable>
      ))}
    </>
  );
}

export default function LoginScreen({ onLogin }) {
  useLang();
  const [mode, setMode] = useState('staff');
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.navy }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20 }} keyboardShouldPersistTaps="handled">
        <View style={s.card}>
          <View style={s.between}>
            <View style={{ flex: 1 }}>
              <Text style={s.h1}>Sakshya360</Text>
              <Text style={s.muted}>{t('Smart Monitoring & Inspection · DoSJE')}</Text>
            </View>
            <LangToggle />
          </View>
          <Tricolor />
          <Tabs mode={mode} setMode={setMode} />
          {mode === 'staff' ? <StaffLogin onLogin={onLogin} /> : <BeneficiaryLogin onLogin={onLogin} />}
          <Text style={[s.muted, { marginTop: 10, fontSize: 11 }]}>{t('Server')}: {API_BASE}</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
