import {
  defineAppConfig,
  envString,
  envBoolean,
} from '@nocobase/app-server/config';
export default defineAppConfig({
  defaults: {
    enabled: false,
    secret: '',
    srmBaseUrl: 'http://127.0.0.1:13001/main',
    financeBaseUrl: 'http://localhost:13002/main',
  },
  env: {
    SRM_FINANCE_BRIDGE_ENABLED: envBoolean('enabled'),
    SRM_FINANCE_BRIDGE_SECRET: envString('secret', {
      secret: true,
      required: false,
    }),
    SRM_BRIDGE_BASE_URL: envString('srmBaseUrl'),
    FINANCE_BRIDGE_BASE_URL: envString('financeBaseUrl'),
  },
  validate(value, ctx) {
    if (value.enabled && value.secret.length < 32)
      ctx.error(
        'secret',
        'Integration secret must contain at least32characters',
      );
    for (const key of ['srmBaseUrl', 'financeBaseUrl'] as const) {
      try {
        const url = new URL(value[key]);
        if (
          url.username ||
          url.password ||
          url.search ||
          url.hash ||
          !['http:', 'https:'].includes(url.protocol) ||
          (url.protocol === 'http:' &&
            !['localhost', '127.0.0.1'].includes(url.hostname))
        )
          ctx.error(key, 'Use a trusted HTTPS endpoint or local loopback URL');
      } catch {
        ctx.error(key, 'Invalid integration URL');
      }
    }
  },
});
