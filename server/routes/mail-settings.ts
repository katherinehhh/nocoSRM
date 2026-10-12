import { Hono } from 'hono';
import type { Application } from '@nocobase/app-server/application';
import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization/server';
import { defineApiRoutes } from '@nocobase/app-server/router';
import {
  apiErrorHandler,
  apiValidator,
  describeRoute,
  dataResponse,
  apiErrorResponses,
} from '@nocobase/app-server/router';
import { z } from 'zod';
import { ProviderSave, ProviderToggle } from '../../shared/mail-settings.js';
import { MailSettingsService } from '../mail-settings/service.js';
export const mailSettingsRoutes = defineApiRoutes((app: Application) => {
  const root = new Hono(),
    router = new Hono<AuthEnv & AuthorizationEnv>(),
    service = new MailSettingsService(app);
  router.use(
    '*',
    app.container.resolve(authenticationToken).required(),
    app.container.resolve(authorizationToken).middleware(),
  );
  router.use('*', async (c, next) => {
    await c.get('authz').require({
      resource: { type: 'settings', id: 'operations.admin' },
      action: 'update',
    });
    await next();
  });
  router.onError(apiErrorHandler);
  const spec = (name: string) =>
    describeRoute({
      operationId: 'srmMail' + name,
      tags: ['SRM mail configuration'],
      responses: { 200: dataResponse(z.json()), ...apiErrorResponses },
    });
  router.get('/providers', spec('ReadProviders'), async (c) =>
    c.json({ data: await service.view(new URL(c.req.url).origin) }),
  );
  router.post(
    '/providers',
    spec('SaveProvider'),
    apiValidator('json', ProviderSave),
    async (c) =>
      c.json({
        data: await service.write(
          c.req.valid('json'),
          new URL(c.req.url).origin,
        ),
      }),
  );
  router.post(
    '/providers/enabled',
    spec('SetProviderEnabled'),
    apiValidator('json', ProviderToggle),
    async (c) =>
      c.json({
        data: await service.write(
          c.req.valid('json'),
          new URL(c.req.url).origin,
        ),
      }),
  );
  root.route('/srmMail', router);
  return root;
});
