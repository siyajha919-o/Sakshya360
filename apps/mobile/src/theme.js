import { StyleSheet } from 'react-native';

export const C = {
  navy: '#0b1d3a', navy2: '#173463', saffron: '#ff9933', green: '#138808',
  bg: '#f3f5f9', card: '#ffffff', text: '#14213d', muted: '#667085', line: '#e4e7ec',
  red: '#d92d20', redBg: '#fee4e2', amber: '#b54708', amberBg: '#fef0c7', ok: '#067647', okBg: '#dcfae6',
};

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  pad: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: C.line },
  h1: { fontSize: 22, fontWeight: '700', color: C.text },
  h2: { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 8 },
  muted: { color: C.muted, fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  btn: { backgroundColor: C.navy, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  input: { borderWidth: 1, borderColor: C.line, borderRadius: 8, padding: 10, backgroundColor: '#fff', fontSize: 15, color: C.text },
  error: { color: C.red, fontSize: 14 },
});

export const pill = (tone) => ({
  wrap: { alignSelf: 'flex-start', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: { red: C.redBg, amber: C.amberBg, green: C.okBg }[tone] || '#eef4ff' },
  text: { fontSize: 11, fontWeight: '700', color: { red: C.red, amber: C.amber, green: C.ok }[tone] || '#3538cd' },
});
