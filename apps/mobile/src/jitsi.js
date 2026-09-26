import { currentSession } from './api';

// Jitsi Meet in a WebView. Production can switch to @jitsi/react-native-sdk in a development build.
export function jitsiUrl(call, displayName) {
  const name = encodeURIComponent(`"${displayName || currentSession().user.name}"`);
  return `https://${call.jitsiDomain}/${call.room}#config.prejoinPageEnabled=false&config.disableDeepLinking=true&userInfo.displayName=${name}`;
}
