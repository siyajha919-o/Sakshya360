import { currentSession } from './api';

// Jitsi Meet in a WebView. Production can switch to @jitsi/react-native-sdk in a development build.
export function jitsiUrl(call, displayName) {
  const name = encodeURIComponent(`"${displayName || currentSession().user.name}"`);
  // Hide Jitsi branding and promos inside the Department's call.
  const unbranded = ['SHOW_JITSI_WATERMARK', 'SHOW_WATERMARK_FOR_GUESTS', 'SHOW_BRAND_WATERMARK', 'SHOW_POWERED_BY', 'MOBILE_APP_PROMO', 'SHOW_PROMOTIONAL_CLOSE_PAGE']
    .map((k) => `interfaceConfig.${k}=false`).join('&');
  return `https://${call.jitsiDomain}/${call.room}#config.prejoinPageEnabled=false&config.prejoinConfig.enabled=false&config.disableDeepLinking=true&${unbranded}&userInfo.displayName=${name}`;
}
