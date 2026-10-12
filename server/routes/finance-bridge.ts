import type { Application } from '@nocobase/app-server/application';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  defineApiRoutes,
  describeRoute,
  dataResponse,
  apiErrorResponses,
  apiErrorHandler,
} from '@nocobase/app-server/router';
import { reject, verify, ResultMessage } from '../integration/protocol.js';
import { bridgeToken } from '../integration/provider.js';
export const financeBridgeRoutes = defineApiRoutes((app: Application) => {
  const router = new Hono(),
    bridge = app.container.resolve(bridgeToken);
  router.onError(apiErrorHandler);
  router.post(
    '/integrations/finance/result',
    describeRoute({
      operationId: 'srmFinanceResult',
      tags: ['Finance integration'],
      responses: {
        200: dataResponse(z.object({ acknowledged: z.boolean() })),
        ...apiErrorResponses,
      },
    }),
    async (c) => {
      const raw = await c.req.text();
      verify(
        raw,
        c.req.header('x-bridge-time') ?? '',
        c.req.header('x-bridge-signature') ?? '',
        bridge.config.enabled ? bridge.config.secret : '',
      );
      let input: unknown;
      try {
        input = JSON.parse(raw);
      } catch {
        reject('INVALID_JSON', 'INVALID_ARGUMENT');
      }
      const parsed = ResultMessage.safeParse(input);
      if (!parsed.success) reject('INVALID_MESSAGE', 'INVALID_ARGUMENT');
      const message = parsed.data;
      return c.json({ data: await bridge.result(message) });
    },
  );
  return router;
});
