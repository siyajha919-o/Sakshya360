// Push notifications (Expo). Incoming verification calls, new / overdue duties and high-severity alerts
// reach the phone even when the app is closed.
// Note: Android remote push needs a development or production build (not Expo Go), and an EAS projectId.
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { api } from './api';
import { getLang } from './i18n';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

async function channels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('calls', {
    name: 'Verification calls', importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 600, 400, 600, 400, 600], lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC, sound: 'default',
  });
  await Notifications.setNotificationChannelAsync('duties', { name: 'Inspection duties', importance: Notifications.AndroidImportance.HIGH });
  await Notifications.setNotificationChannelAsync('alerts', { name: 'Monitoring alerts', importance: Notifications.AndroidImportance.HIGH });
  await Notifications.setNotificationChannelAsync('default', { name: 'General', importance: Notifications.AndroidImportance.DEFAULT });
}

let token = null;

// Returns { ok, token } or { ok: false, reason } – never throws, so sign-in never fails because of push.
export async function registerForPush() {
  try {
    await channels();
    if (!Device.isDevice) return { ok: false, reason: 'Push needs a physical device' };
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== 'granted') return { ok: false, reason: 'Notification permission denied' };
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return { ok: false, reason: 'EAS projectId missing (run `eas init`)' };
    token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await api('/push/register', { body: { token, platform: Platform.OS, lang: getLang() } });
    return { ok: true, token };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

export async function unregisterPush() {
  if (!token) return;
  await api('/push/unregister', { body: { token } }).catch(() => {});
  token = null;
}

// Calls `onOpen(data)` when the user taps a notification (including the one that launched the app).
export function onNotificationOpen(onOpen) {
  const last = Notifications.getLastNotificationResponse();
  if (last) { onOpen(last.notification.request.content.data || {}); Notifications.clearLastNotificationResponse(); }
  const sub = Notifications.addNotificationResponseReceivedListener((r) => onOpen(r.notification.request.content.data || {}));
  return () => sub.remove();
}
