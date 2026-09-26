// Tiny i18n: English source strings are the keys; hi.js maps them to Hindi. Missing keys fall back to English.
import { useSyncExternalStore } from 'react';
import * as SecureStore from 'expo-secure-store';
import HI from './hi';

const KEY = 'sakshya360.lang';
let lang = 'en';
const listeners = new Set();

export async function loadLang() {
  try { const v = await SecureStore.getItemAsync(KEY); if (v === 'hi' || v === 'en') lang = v; } catch { /* default en */ }
  return lang;
}
export function setLang(l) {
  lang = l === 'hi' ? 'hi' : 'en';
  SecureStore.setItemAsync(KEY, lang).catch(() => {});
  listeners.forEach((f) => f());
}
export const getLang = () => lang;

// t('Due {date}', { date }) – interpolates {name} placeholders.
export function t(s, vars) {
  let out = (lang === 'hi' && HI[s]) || s;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
  return out;
}

// Re-render on language change: const lang = useLang();
export function useLang() {
  return useSyncExternalStore((f) => { listeners.add(f); return () => listeners.delete(f); }, () => lang);
}

export const locale = () => (lang === 'hi' ? 'hi-IN' : 'en-IN');
