// Offline outbox for inspection reports. Remote sites often have no signal, so a report that cannot be
// uploaded is kept on the phone (evidence copied out of the cache into app documents) and retried when
// the network comes back, when the app returns to the foreground, and every minute while it is open.
// The server records the original capture time and flags reports that arrive late.
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { Directory, File, Paths } from 'expo-file-system';
import { api, ApiError, currentSession, filePart, NetworkError } from './api';

const KEY = 'sakshya360.outbox';
const listeners = new Set();
let items = [];
let loaded = false;
let flushing = null;

async function load() {
  if (loaded) return items;
  try { items = JSON.parse((await AsyncStorage.getItem(KEY)) || '[]'); } catch { items = []; }
  loaded = true;
  return items;
}
async function save() {
  await AsyncStorage.setItem(KEY, JSON.stringify(items));
  listeners.forEach((f) => f(items));
}

export function subscribe(fn) {
  listeners.add(fn);
  load().then(() => fn(items));
  return () => listeners.delete(fn);
}
export const pending = () => items;

function dirFor(id) {
  const root = new Directory(Paths.document, 'outbox');
  root.create({ idempotent: true });
  const d = new Directory(root, id);
  d.create({ idempotent: true });
  return d;
}

// Copy a captured file into permanent storage (camera/cache URIs can be purged by the OS).
function persist(dir, uri, name) {
  const dest = new File(dir, name);
  if (dest.exists) dest.delete();
  new File(uri).copySync(dest);
  return dest.uri;
}

function buildForm(item) {
  const form = new FormData();
  form.append('data', JSON.stringify(item.data));
  item.photos.forEach((uri, i) => form.append('photos', filePart(uri, `photo-${i + 1}.jpg`, 'image/jpeg')));
  if (item.video) form.append('video', filePart(item.video, 'walkthrough.mp4', 'video/mp4'));
  return form;
}

// data: the report JSON (must include capturedAt); photos: [uri]; video: uri | null
export async function enqueue({ data, photos, video, label }) {
  await load();
  const id = `${data.assignmentId}-${Date.now()}`;
  const dir = dirFor(id);
  const item = {
    id, label, data, queuedAt: new Date().toISOString(), attempts: 0, lastError: null,
    owner: currentSession()?.user.id,
    photos: photos.map((uri, i) => persist(dir, uri, `photo-${i + 1}.jpg`)),
    video: video ? persist(dir, video, 'walkthrough.mp4') : null,
  };
  items = [...items.filter((x) => x.data.assignmentId !== data.assignmentId), item];
  await save();
  return item;
}

async function remove(id) {
  items = items.filter((x) => x.id !== id);
  try { const d = new Directory(Paths.document, 'outbox', id); if (d.exists) d.delete(); } catch { /* already gone */ }
  await save();
}
export const discard = remove;

// Submit directly; if the network is unavailable, queue it. Returns { queued } or the server response.
export async function submitOrQueue({ data, photos, video, label }) {
  try {
    return await api('/reports', { form: buildForm({ data, photos, video }) });
  } catch (e) {
    if (!(e instanceof NetworkError)) throw e;
    await enqueue({ data, photos, video, label });
    return { queued: true };
  }
}

// Upload queued reports in order. Stops at the first network failure; server rejections stay in the
// queue with their error so the inspector can see and discard them.
export function flush() {
  if (flushing) return flushing;
  flushing = (async () => {
    await load();
    const me = currentSession()?.user.id;
    let sent = 0;
    for (const item of [...items]) {
      if (!me || item.owner !== me) continue;
      try {
        await api('/reports', { form: buildForm(item) });
        await remove(item.id);
        sent++;
      } catch (e) {
        if (e instanceof NetworkError) break;
        if (e instanceof ApiError && e.status === 409) { await remove(item.id); sent++; continue; } // already on the server
        item.attempts += 1;
        item.lastError = e.message;
        await save();
      }
    }
    return sent;
  })().finally(() => { flushing = null; });
  return flushing;
}

// Auto-sync triggers. Returns an unsubscribe function.
export function startAutoSync(onSent) {
  const run = () => flush().then((n) => { if (n && onSent) onSent(n); }).catch(() => {});
  const net = NetInfo.addEventListener((s) => { if (s.isConnected && s.isInternetReachable !== false) run(); });
  const app = AppState.addEventListener('change', (st) => { if (st === 'active') run(); });
  const timer = setInterval(run, 60000);
  run();
  return () => { net(); app.remove(); clearInterval(timer); };
}
