import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { io } from 'socket.io-client';

// API base: EXPO_PUBLIC_API_URL, else the dev machine running Metro (same LAN IP), port 4000.
function resolveBase() {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, '');
  const host = (Constants.expoConfig && Constants.expoConfig.hostUri ? Constants.expoConfig.hostUri : 'localhost:8081').split(':')[0];
  return `http://${host}:4000`;
}
export const API_BASE = resolveBase();

const KEY = 'sakshya360.session';
let session = null;
let socket = null;

export async function loadSession() {
  try { session = JSON.parse(await SecureStore.getItemAsync(KEY)); } catch { session = null; }
  return session;
}
export async function saveSession(s) {
  session = s;
  if (s) await SecureStore.setItemAsync(KEY, JSON.stringify(s));
  else await SecureStore.deleteItemAsync(KEY);
  if (socket) { socket.disconnect(); socket = null; }
}
export const currentSession = () => session;

// Thrown when the server cannot be reached at all (no signal, server down) – the offline queue retries these.
export class NetworkError extends Error {}
// Thrown for HTTP errors; `status` lets callers treat e.g. 409 "already submitted" as success.
export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

// Absolute URL for API-relative links (signed evidence / PDF URLs).
export const absoluteUrl = (path) => (/^https?:/.test(path) ? path : `${API_BASE}${path}`);

export async function api(path, { body, form, method, timeoutMs = form ? 180000 : 30000 } = {}) {
  const headers = {};
  if (session) headers.Authorization = `Bearer ${session.token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  // React Native's AbortSignal polyfill has no .timeout(), so abort by hand.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    res = await fetch(`${API_BASE}/api${path}`, {
      method: method || (body !== undefined || form ? 'POST' : 'GET'),
      headers,
      body: form || (body !== undefined ? JSON.stringify(body) : undefined),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new NetworkError(`Cannot reach server at ${API_BASE} (${e.name === 'AbortError' ? 'timed out' : e.message})`);
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, res.status);
  return data;
}

// React Native FormData accepts { uri, name, type } file parts.
export const filePart = (uri, name, type) => ({ uri, name, type });

export function getSocket() {
  if (!session) return null;
  if (!socket) socket = io(API_BASE, { auth: { token: session.token }, transports: ['websocket'] });
  return socket;
}
