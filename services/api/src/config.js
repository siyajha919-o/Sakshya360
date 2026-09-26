require('dotenv').config();

const production = process.env.NODE_ENV === 'production';
const DEV_SECRET = 'dev-only-change-me';
// First non-internal IPv4 address – lets QR codes work on phones in development (localhost would not).
const lanIp = () => Object.values(require('os').networkInterfaces()).flat()
  .find(i => i && i.family === 'IPv4' && !i.internal)?.address || 'localhost';
const flag = (v, dflt) => (v == null || v === '' ? dflt : !['0', 'false', 'no', 'off'].includes(String(v).toLowerCase()));

const config = {
  production,
  port: +process.env.PORT || 4000,
  databaseUrl: process.env.DATABASE_URL || 'postgres://sakshya:sakshya@localhost:5432/sakshya360',
  mongoUrl: process.env.MONGO_URL || 'mongodb://localhost:27017',
  mongoDb: process.env.MONGO_DB || 'sakshya360_evidence',
  mlUrl: process.env.ML_URL || 'http://127.0.0.1:8001',
  mediamtxUrl: process.env.MEDIAMTX_URL || 'http://127.0.0.1:8889',
  mediamtxApiUrl: process.env.MEDIAMTX_API_URL || 'http://127.0.0.1:9997',
  // RTSP base as seen by the ML service (it pulls frames for automatic CCTV analysis).
  rtspBaseUrl: process.env.RTSP_BASE_URL || 'rtsp://127.0.0.1:8554',
  // Demo only: MediaMTX refuses to start simulated cameras that have a file here (see infra/mediamtx.yml).
  cameraOutageDir: process.env.CAMERA_OUTAGE_DIR || require('path').resolve(__dirname, '../../../infra/outages'),
  jitsiDomain: process.env.JITSI_DOMAIN || 'meet.jit.si',
  jwtSecret: process.env.JWT_SECRET || DEV_SECRET,
  corsOrigins: (process.env.CORS_ORIGINS || (production ? '' : '*')).split(',').filter(Boolean),
  maxUploadBytes: 50 * 1024 * 1024,
  // Public URL of the web app – used in QR codes and SSO redirects.
  publicWebUrl: (process.env.PUBLIC_WEB_URL || `http://${production ? 'localhost' : lanIp()}:5180`).replace(/\/$/, ''),

  // Background jobs
  jobsEnabled: flag(process.env.JOBS_ENABLED, true),
  cameraHealthIntervalS: +process.env.CAMERA_HEALTH_INTERVAL_S || 60,
  cctvWatchIntervalS: +process.env.CCTV_WATCH_INTERVAL_S || 120,
  timezone: process.env.TZ_REGION || 'Asia/Kolkata',

  // Beneficiary OTP. Without SMS_WEBHOOK_URL (dev), the OTP is returned in the API response.
  smsWebhookUrl: process.env.SMS_WEBHOOK_URL || '',
  smsWebhookToken: process.env.SMS_WEBHOOK_TOKEN || '',
  exposeDevOtp: flag(process.env.EXPOSE_DEV_OTP, !production),

  // Expo push service. Optional access token (Expo "enhanced security for push").
  expoPushUrl: process.env.EXPO_PUSH_URL || 'https://exp.host/--/api/v2/push/send',
  expoAccessToken: process.env.EXPO_ACCESS_TOKEN || '',

  // Parichay / Jan Parichay (or any OIDC provider). SSO is enabled when these are set.
  oidc: {
    issuer: (process.env.OIDC_ISSUER || '').replace(/\/$/, ''),
    clientId: process.env.OIDC_CLIENT_ID || '',
    clientSecret: process.env.OIDC_CLIENT_SECRET || '',
    redirectUri: process.env.OIDC_REDIRECT_URI || '',
    scope: process.env.OIDC_SCOPE || 'openid email profile',
    label: process.env.OIDC_LABEL || 'Parichay',
  },
};

if (config.jwtSecret === DEV_SECRET || config.jwtSecret.length < 32) {
  if (production) throw new Error('JWT_SECRET must be set to a random value of at least 32 characters in production');
  console.warn('WARNING: using a development JWT secret. Set JWT_SECRET before deploying.');
}
if (production && !config.corsOrigins.length) throw new Error('CORS_ORIGINS must list the allowed web origins in production');

module.exports = config;
