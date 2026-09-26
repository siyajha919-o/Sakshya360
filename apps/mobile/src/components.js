import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { C, pill, s } from './theme';
import { locale, setLang, useLang } from './i18n';

export function Button({ title, onPress, tone, disabled, busy, style }) {
  const bg = { saffron: C.saffron, green: C.green, red: C.red, ghost: '#fff' }[tone] || C.navy;
  return (
    <Pressable onPress={onPress} disabled={disabled || busy}
      style={({ pressed }) => [s.btn, { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 }, tone === 'ghost' && { borderWidth: 1, borderColor: C.line }, style]}>
      {busy ? <ActivityIndicator color={tone === 'ghost' || tone === 'saffron' ? C.navy : '#fff'} />
        : <Text style={[s.btnText, (tone === 'ghost' || tone === 'saffron') && { color: C.navy }]}>{title}</Text>}
    </Pressable>
  );
}

export function Pill({ tone, children }) {
  const p = pill(tone);
  return <View style={p.wrap}><Text style={p.text}>{children}</Text></View>;
}

export function Tricolor() {
  return (
    <View style={{ flexDirection: 'row', height: 4, borderRadius: 4, overflow: 'hidden', marginVertical: 12 }}>
      <View style={{ flex: 1, backgroundColor: C.saffron }} />
      <View style={{ flex: 1, backgroundColor: '#fff' }} />
      <View style={{ flex: 1, backgroundColor: C.green }} />
    </View>
  );
}

export const fmt = (t) => new Date(t).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' });

// EN | हिं switch, usable in headers (light) and on cards (dark).
export function LangToggle({ light }) {
  const lang = useLang();
  const color = light ? '#fff' : C.navy;
  return (
    <Pressable onPress={() => setLang(lang === 'hi' ? 'en' : 'hi')} hitSlop={10} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: color }}>
      <Text style={{ color, fontWeight: '700' }}>{lang === 'hi' ? 'EN' : 'हिं'}</Text>
    </Pressable>
  );
}

export function Banner({ tone = 'amber', children, onPress }) {
  const p = pill(tone);
  return (
    <Pressable onPress={onPress} style={{ backgroundColor: p.wrap.backgroundColor, borderRadius: 10, padding: 10, marginBottom: 12 }}>
      <Text style={{ color: p.text.color, fontWeight: '600' }}>{children}</Text>
    </Pressable>
  );
}
