export default () => ({
  port: parseInt(process.env.PORT || '3000', 10) || 3000,
  app: {
    publicBaseUrl: process.env.PUBLIC_API_URL || process.env.API_BASE_URL || '',
  },
  database: {
    url: process.env.DATABASE_URL,
  },
  encryption: {
    key: process.env.ENCRYPTION_KEY,
  },
  logto: {
    endpoint: process.env.LOGTO_ENDPOINT,
    appId: process.env.LOGTO_APP_ID,
    appSecret: process.env.LOGTO_APP_SECRET,
    apiResource: process.env.LOGTO_API_RESOURCE,
  },
  facebook: {
    appId: process.env.FACEBOOK_APP_ID,
    appSecret: process.env.FACEBOOK_APP_SECRET,
    redirectUri: process.env.FACEBOOK_REDIRECT_URI,
    tokenRefreshThresholdDays: parseInt(
      process.env.FACEBOOK_TOKEN_REFRESH_THRESHOLD_DAYS || '7',
      10,
    ),
  },
  cron: {
    interval: process.env.CRON_INTERVAL || '*/5 * * * *',
  },
});
