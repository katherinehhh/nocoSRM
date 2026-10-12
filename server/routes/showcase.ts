import type { Application } from '@nocobase/app-server/application';
import { businessMembership } from '../services/business-membership.js';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization/server';
import {
  ApiError,
  apiErrorHandler,
  defineApiRoutes,
  defineRootRoutes,
  describeRoute,
  dataResponse,
  listResponse,
  apiErrorResponses,
  apiValidator,
} from '@nocobase/app-server/router';
import { LifecycleError, lifecycleErrorFields } from '@nocobase/lifecycle';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import { showcaseToken } from '../providers/showcase/index.js';
import {
  ShowcaseError,
  type ShowcaseActor,
} from '../providers/showcase/service.js';
import { showcaseActions } from '../providers/showcase/resources.js';
import { DeliveryInput, TemplateSchema } from '../../shared/showcase.js';
import { extractPdf } from '../providers/showcase/documents.js';
import { deliveryPdf } from '../providers/showcase/pdf.js';
const Id = z.object({ id: z.string().min(1).max(150) });
const Key = z.object({ requestId: z.string().min(1).max(100) }).strict();
const Query = z.object({
  q: z.string().max(200).optional(),
  orderId: z.string().max(64).optional(),
  status: z.string().max(32).optional(),
  supplier: z.string().max(64).optional(),
  eventDirection: z.enum(['inbound', 'outbound', '']).optional(),
  source: z.string().max(64).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().max(32).optional(),
  direction: z.enum(['asc', 'desc']).optional(),
});
const Row = z
  .object({
    id: z.string(),
    number: z.string(),
    name: z.string(),
    status: z.string(),
    lifecycleVersion: z.number().int(),
    lines: z.string(),
    amount: z.number(),
    updatedAt: z.string(),
  })
  .passthrough();
const spec = (id: string, schema: z.ZodType = z.json(), list = false) =>
  describeRoute({
    tags: ['SRM delivery collaboration'],
    summary: id,
    operationId: `showcase${id}`,
    responses: {
      '200': list ? listResponse(schema) : dataResponse(schema),
      ...apiErrorResponses,
    },
  });
export const showcaseRoutes = defineApiRoutes((app: Application) => {
  const router = new Hono<AuthEnv & AuthorizationEnv>(),
    service = app.container.resolve(showcaseToken),
    auth = app.container.resolve(authenticationToken),
    authz = app.container.resolve(authorizationToken);
  router.use('*', auth.required(), authz.middleware());
  router.use('*', async (c, next) => {
    const path = c.req.path;
    if (
      path.endsWith('/scenarios') ||
      path.includes('/integrations/demo/') ||
      path.endsWith('/retry') ||
      /\/assistant\/(prepare|commit)$/.test(path)
    )
      return c.json(
        {
          error: {
            code: 410,
            status: 'FAILED_PRECONDITION',
            reason: 'DEMO_DISABLED',
            domain: 'srm',
            message: 'Demonstration operations are disabled.',
          },
        },
        410,
      );
    await next();
  });
  router.onError((e, c) => {
    if (e instanceof ShowcaseError && e.code === 'DEMO_DISABLED')
      return c.json(
        {
          error: {
            code: 410,
            status: 'FAILED_PRECONDITION',
            reason: 'DEMO_DISABLED',
            domain: 'srm',
            message: 'Demonstration analysis is disabled.',
          },
        },
        410,
      );
    if (e instanceof LifecycleError) {
      const fields = lifecycleErrorFields(e);
      if (fields) e = new ApiError({ ...fields, domain: 'showcase' });
    }
    if (e instanceof ShowcaseError)
      e = new ApiError({
        status: ['FORBIDDEN', 'SELF_APPROVAL', 'INVALID_SIGNATURE'].includes(
          e.code,
        )
          ? 'PERMISSION_DENIED'
          : e.code === 'NOT_FOUND'
            ? 'NOT_FOUND'
            : [
                  'MODEL_UNCONFIGURED',
                  'PRINT_FONT_UNCONFIGURED',
                  'WORKFLOW_DISABLED',
                ].includes(e.code)
              ? 'UNAVAILABLE'
              : ['CONFLICT', 'KEY_REUSED'].includes(e.code)
                ? 'ABORTED'
                : 'INVALID_ARGUMENT',
        reason: e.code,
        domain: 'showcase',
        message: e.code,
        fieldViolations: e.field
          ? [{ field: e.field, description: e.code, reason: e.code }]
          : undefined,
      });
    return apiErrorHandler(e, c);
  });
  async function actor(
    c: Context<AuthEnv & AuthorizationEnv>,
    action: string,
  ): Promise<ShowcaseActor> {
    const decision = await c.get('authz').authorize({
      resource: { type: 'composite', id: 'showcase.delivery' },
      action,
    });
    if (decision.effect === 'deny' || !decision.conditions?.database)
      throw new ShowcaseError('FORBIDDEN');
    const user = c.get('auth')!.user;
    const member = await businessMembership(
      service.db,
      app.container,
      user.id,
      (await c.get('authz').snapshot()).unrestricted,
    );
    if (!member) throw new ShowcaseError('FORBIDDEN');
    const actions = [];
    for (const action of showcaseActions)
      if (
        await c.get('authz').can({
          resource: { type: 'composite', id: 'showcase.delivery' },
          action,
        })
      )
        actions.push(action);
    return {
      id: user.id,
      organizationId: member?.organizationId ?? 'main',
      supplierId: member?.supplierId ?? null,
      policies: decision.conditions.database,
      actions,
    };
  }
  router.get('/overview', spec('Overview'), async (c) => {
    const a = await actor(c, 'view'),
      deliveries = await service.deliveries(a),
      agents = app.container.resolve(agentsToken),
      catalog = await agents.online.gateway.catalog('chat');
    return c.json({
      data: {
        count: deliveries.length,
        pending: deliveries.filter((r) => r.status === 'pending').length,
        completed: deliveries.filter((r) => r.status === 'completed').length,
        native: { lifecycle: true, workflow: true, agents: true, mail: true },
        modelReady: Boolean(catalog.defaultModel),
        modelManage: await c.get('authz').can({
          resource: { type: 'settings', id: 'agents.services' },
          action: 'manage',
        }),
        workflowManage: await c.get('authz').can({
          resource: { type: 'settings', id: 'workflow' },
          action: 'manage',
        }),
        externalMode: 'unconfigured',
        actions: a.actions,
        presets: agents.presets.list(),
        supplierId: a.supplierId,
        pages: Object.fromEntries(
          await Promise.all(
            Object.entries({
              'delivery-plans': 'deliveryPlans',
              'work-board': 'workBoard',
              'business-ledger': 'ledger',
              integrations: 'integrations',
              'print-templates': 'templates',
              'ai-workbench': 'ai',
              'mail-center': 'mail',
            }).map(async ([path, id]): Promise<[string, boolean]> => [
              path,
              await c.get('authz').can({
                resource: { type: 'page', id: `showcase.${id}` },
                action: 'access',
              }),
            ]),
          ),
        ),
      },
    });
  });
  router.post(
    '/scenarios',
    spec('Scenario', z.array(Row)),
    apiValidator('json', Key),
    async (c) =>
      c.json({
        data: await service.scenario(
          await actor(c, 'create'),
          c.req.valid('json').requestId,
        ),
      }),
  );
  function paged<T extends { id?: string }>(
    rows: T[],
    query: z.infer<typeof Query>,
  ) {
    const raw = rows as (T & Record<string, unknown>)[];
    const matching = raw.filter(
      (r) =>
        (!query.q ||
          JSON.stringify(r).toLowerCase().includes(query.q.toLowerCase())) &&
        (!query.status ||
          r.status === query.status ||
          r.disposition === query.status ||
          r.state === query.status) &&
        (!query.supplier ||
          r.supplierId === query.supplier ||
          (typeof r.supplierName === 'string' ? r.supplierName : '')
            .toLowerCase()
            .includes(query.supplier.toLowerCase())) &&
        (!query.eventDirection || r.direction === query.eventDirection) &&
        (!query.source ||
          (typeof r.source === 'string' ? r.source : '').includes(
            query.source,
          )),
    );
    const allowed = [
      'amount',
      'businessDate',
      'updatedAt',
      'localAmount',
      'externalAmount',
      'difference',
      'localQuantity',
      'externalQuantity',
      'quantityDifference',
      'attempts',
      'allocation',
      'boxes',
    ];
    const sort = allowed.includes(query.sort ?? '') ? query.sort! : 'updatedAt';
    matching.sort((a, b) => {
      const left = a[sort],
        right = b[sort];
      if (left === null || left === undefined)
        return right === null || right === undefined
          ? String(a.id).localeCompare(String(b.id))
          : 1;
      if (right === null || right === undefined) return -1;
      const v =
        typeof left === 'number' && typeof right === 'number'
          ? left - right
          : (typeof left === 'string' ? left : '').localeCompare(
              typeof right === 'string' ? right : '',
            );
      return (
        (query.direction === 'asc' ? v : -v) ||
        String(a.id).localeCompare(String(b.id))
      );
    });
    return {
      data: matching.slice(
        (query.page - 1) * query.pageSize,
        query.page * query.pageSize,
      ),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total: matching.length,
        capped: false,
      },
    };
  }
  router.get(
    '/deliveryPlans',
    spec('ListDelivery', Row, true),
    apiValidator('query', Query),
    async (c) =>
      c.json(
        paged(
          await (async () => {
            const a = await actor(c, 'view');
            return service.presentation(a, await service.deliveries(a));
          })(),
          c.req.valid('query'),
        ),
      ),
  );
  router.get(
    '/orders',
    spec('OrderOptions', z.json(), true),
    apiValidator('query', Query),
    async (c) => {
      const a = await actor(c, 'create'),
        repo = service.repo<import('../../shared/operations.js').Doc>(
          'opsOrders',
          a,
        ),
        all: Partial<import('../../shared/operations.js').Doc>[] = [];
      for (let offset = 0; ; offset += 1000) {
        const batch = await repo.findMany({
          filter: service.scope(a),
          limit: 1000,
          offset,
          sort: (s) => s.field('id').asc(),
        });
        all.push(...batch);
        if (batch.length < 1000) break;
      }
      const permission = await c.get('authz').authorize({
        resource: { type: 'composite', id: 'operations.materials' },
        action: 'view',
      });
      const materialPolicy =
        permission.effect !== 'deny'
          ? permission.conditions?.database?.opsMaterials
          : undefined;
      const rows = await Promise.all(
        all
          .filter(
            (o) =>
              ['confirmed', 'partial'].includes(o.status ?? '') &&
              (!c.req.valid('query').orderId ||
                o.id === c.req.valid('query').orderId),
          )
          .map(async (order) => {
            const payload =
              typeof order.payload === 'string'
                ? (JSON.parse(
                    order.payload,
                  ) as import('../../shared/operations.js').Payload)
                : order.payload;
            const receiptRows = await service
              .repo<import('../../shared/operations.js').Doc>('opsReceipts', a)
              .findMany({
                filter: { ...service.scope(a), status: 'posted' },
                limit: 10001,
              });
            if (receiptRows.length > 10000)
              throw new ShowcaseError('TOO_MANY_RECORDS');
            const received = receiptRows
              .map((r) => ({
                ...r,
                payload:
                  typeof r.payload === 'string'
                    ? (JSON.parse(
                        r.payload,
                      ) as import('../../shared/operations.js').Payload)
                    : r.payload,
              }))
              .filter((r) => r.payload?.orderId === order.id);
            const sourceLines = await Promise.all(
              (payload?.lines ?? []).map(async (line) => {
                const material = materialPolicy
                  ? await service.db
                      .repository<import('../../shared/operations.js').Doc>(
                        'opsMaterials',
                      )
                      .withPolicy(materialPolicy)
                      .findOne({
                        filter: {
                          id: line.materialId,
                          organizationId: a.organizationId,
                        },
                      })
                  : null;
                return {
                  ...line,
                  quantity: Math.max(
                    0,
                    line.quantity -
                      received
                        .flatMap((r) => r.payload?.lines ?? [])
                        .filter((l) => l.sourceLineId === line.id)
                        .reduce((n, l) => n + (l.accepted ?? l.quantity), 0),
                  ),
                  sku: material?.number ?? '',
                  name: material?.name ?? '',
                };
              }),
            );
            return {
              ...order,
              payload,
              sourceLines: sourceLines.filter((line) => line.quantity > 0),
            };
          }),
      );
      return c.json(paged(rows, c.req.valid('query')));
    },
  );
  router.post(
    '/businessLedger/:id/acknowledgment',
    spec('RecordAcknowledgment'),
    apiValidator('param', Id),
    apiValidator(
      'json',
      z
        .object({
          amount: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
          quantity: z.number().int().min(0).max(10000000),
          reference: z.string().trim().min(1).max(100),
          reason: z.string().trim().min(1).max(2000),
          expectedVersion: z.string().min(1).max(256),
          requestId: z.string().min(1).max(100),
        })
        .strict(),
    ),
    async (c) =>
      c.json({
        data: await service.acknowledgment(
          await actor(c, 'sync'),
          c.req.valid('param').id,
          c.req.valid('json'),
        ),
      }),
  );
  router.post(
    '/deliveryPlans',
    spec('CreateDelivery', Row),
    apiValidator('json', DeliveryInput),
    async (c) =>
      c.json({
        data: await service.create(
          await actor(c, 'create'),
          c.req.valid('json'),
        ),
      }),
  );
  router.patch(
    '/deliveryPlans/:id',
    spec('EditDelivery', Row),
    apiValidator('param', Id),
    apiValidator('json', DeliveryInput),
    async (c) => {
      const a = await actor(c, 'edit');
      await service.edit(a, c.req.valid('param').id, c.req.valid('json'));
      return c.json({ data: await service.get(a, c.req.valid('param').id) });
    },
  );
  router.get(
    '/deliveryPlans/:id',
    spec('DeliveryView'),
    apiValidator('param', Id),
    async (c) =>
      c.json({
        data: await service.view(
          await actor(c, 'view'),
          c.req.valid('param').id,
        ),
      }),
  );
  router.post(
    '/deliveryPlans/:id/fire',
    spec('FireDelivery'),
    apiValidator('param', Id),
    apiValidator(
      'json',
      z
        .object({
          transition: z.enum([
            'submit',
            'approve',
            'reject',
            'ship',
            'receive',
            'rework',
          ]),
          expectVersion: z.number().int().nonnegative(),
          requestId: z.string().min(1).max(100),
        })
        .strict(),
    ),
    async (c) => {
      const input = c.req.valid('json');
      return c.json({
        data: await service.fire(
          await actor(c, input.transition),
          c.req.valid('param').id,
          input.transition,
          input.expectVersion,
          input.requestId,
        ),
      });
    },
  );
  router.post(
    '/deliveryPlans/:id/policy',
    spec('LowRiskPolicy', Row),
    apiValidator('param', Id),
    apiValidator(
      'json',
      z
        .object({
          enabled: z.boolean(),
          expectVersion: z.number().int().nonnegative(),
        })
        .strict(),
    ),
    async (c) => {
      const a = await actor(c, 'configure'),
        r = await service.get(a, c.req.valid('param').id),
        input = c.req.valid('json');
      if (r.status !== 'draft' || r.lifecycleVersion !== input.expectVersion)
        throw new ShowcaseError('CONFLICT');
      await service.repo('showcaseDeliveries', a).updateOne({
        filter: {
          id: r.id,
          lifecycleVersion: r.lifecycleVersion,
          status: 'draft',
        },
        values: {
          autoApprove: input.enabled,
          lifecycleVersion: r.lifecycleVersion + 1,
        },
      });
      return c.json({ data: await service.get(a, r.id) });
    },
  );
  router.get(
    '/deliveryPlans/:id/pdf',
    describeRoute({
      tags: ['SRM delivery collaboration'],
      summary: 'Delivery PDF',
      operationId: 'showcasePdf',
      responses: {
        '200': {
          description: 'Private printable PDF',
          content: {
            'application/pdf': { schema: { type: 'string', format: 'binary' } },
          },
        },
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', Id),
    apiValidator(
      'query',
      z.object({ revision: z.coerce.number().int().min(0).optional() }),
    ),
    async (c) => {
      const a = await actor(c, 'print'),
        r = await service.get(a, c.req.valid('param').id),
        template = await service.template(a, c.req.valid('query').revision);
      const order = await service
        .repo<{ id: string; number: string }>('opsOrders', a)
        .findOne({ filter: { id: r.orderId, ...service.scope(a) } });
      const bytes = await deliveryPdf(
        { ...r, orderNumber: order?.number },
        template.config,
      );
      return new Response(new Uint8Array(bytes), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${r.number}.pdf"`,
          'Cache-Control': 'private, no-store',
        },
      });
    },
  );
  router.get(
    '/businessLedger',
    spec('Ledger', z.json(), true),
    apiValidator('query', Query),
    async (c) =>
      c.json(
        paged(
          await service.ledger(await actor(c, 'view')),
          c.req.valid('query'),
        ),
      ),
  );
  router.get(
    '/businessLedger/:id',
    spec('LedgerDetail'),
    apiValidator('param', Id),
    async (c) => {
      const rows = await service.ledger(await actor(c, 'view')),
        row = rows.find((r) => r.id === c.req.valid('param').id);
      if (!row) throw new ShowcaseError('NOT_FOUND');
      return c.json({ data: row });
    },
  );
  router.post(
    '/businessLedger/:id/resolve',
    spec('ResolveLedger'),
    apiValidator('param', Id),
    apiValidator(
      'json',
      z
        .object({
          expectedVersion: z.string(),
          reason: z.string().trim().min(1).max(2000),
          requestId: z.string().min(1).max(100),
        })
        .strict(),
    ),
    async (c) => {
      const a = await actor(c, 'resolve'),
        input = c.req.valid('json');
      await service.resolve(
        a,
        c.req.valid('param').id,
        input.expectedVersion,
        input.reason,
        input.requestId,
      );
      return c.json({
        data: (await service.ledger(a)).find(
          (r) => r.id === c.req.valid('param').id,
        ),
      });
    },
  );
  router.get(
    '/workBoard',
    spec('Board'),
    apiValidator('query', Query),
    async (c) => {
      const a = await actor(c, 'view'),
        q = c.req.valid('query').q?.toLowerCase() ?? '';
      const rows = (await service.deliveries(a))
        .filter(
          (r) =>
            !q || `${r.number} ${r.name} ${r.lines}`.toLowerCase().includes(q),
        )
        .sort(
          (a, b) =>
            b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
        );
      return c.json({
        data: rows.slice(0, 200),
        meta: { cap: 200, total: rows.length },
      });
    },
  );
  router.get('/integrations/status', spec('Integrations'), async (c) => {
    await actor(c, 'sync');
    return c.json({
      data: {
        mode:
          process.env.SHOWCASE_WEBHOOK_SECRET &&
          process.env.SHOWCASE_WEBHOOK_ORGANIZATION
            ? 'webhook'
            : 'unconfigured',
        outboundConfigured: false,
        webhookReady:
          !!process.env.SHOWCASE_WEBHOOK_SECRET &&
          !!process.env.SHOWCASE_WEBHOOK_ORGANIZATION,
        callbackPath: 'callbacks/showcase',
        signature: 'HMAC-SHA256',
        maxSkewSeconds: 300,
        externalEndpoints: [],
      },
    });
  });
  router.get(
    '/integrations/events',
    spec('Events', z.json(), true),
    apiValidator('query', Query),
    async (c) => {
      const rows = await service.rows(await actor(c, 'sync'), 'showcaseEvents');
      return c.json(
        paged(
          rows.map((r) => ({
            ...r,
            ...(JSON.parse(r.payload) as Record<string, unknown>),
          })),
          c.req.valid('query'),
        ),
      );
    },
  );
  router.post(
    '/integrations/demo/sync',
    spec('Sync'),
    apiValidator('json', Key),
    async (c) =>
      c.json({
        data: await service.sync(
          await actor(c, 'sync'),
          c.req.valid('json').requestId,
        ),
      }),
  );
  router.post(
    '/integrations/demo/callback',
    spec('DemoCallback'),
    apiValidator('json', Key),
    async (c) =>
      c.json({
        data: await service.callback(
          await actor(c, 'sync'),
          c.req.valid('json').requestId,
        ),
      }),
  );
  router.post(
    '/integrations/demo/failure',
    spec('DemoFailure'),
    apiValidator('json', Key),
    async (c) =>
      c.json({
        data: await service.failure(
          await actor(c, 'sync'),
          c.req.valid('json').requestId,
        ),
      }),
  );
  router.post(
    '/integrations/events/:id/retry',
    spec('RetryEvent'),
    apiValidator('param', Id),
    apiValidator('json', Key),
    async (c) =>
      c.json({
        data: await service.retryEvent(
          await actor(c, 'sync'),
          c.req.valid('param').id,
        ),
      }),
  );
  router.get(
    '/printTemplates/delivery',
    spec('Template'),
    apiValidator(
      'query',
      z.object({ revision: z.coerce.number().int().min(0).optional() }),
    ),
    async (c) =>
      c.json({
        data: await service.template(
          await actor(c, 'print'),
          c.req.valid('query').revision,
        ),
      }),
  );
  router.patch(
    '/printTemplates/delivery',
    spec('SaveTemplate'),
    apiValidator(
      'json',
      z
        .object({
          expectedRevision: z.number().int().nonnegative(),
          config: TemplateSchema,
        })
        .strict(),
    ),
    async (c) => {
      const input = c.req.valid('json');
      return c.json({
        data: await service.saveTemplate(
          await actor(c, 'configure'),
          input.expectedRevision,
          input.config,
        ),
      });
    },
  );
  router.post(
    '/assistant/extractPdf',
    spec('ExtractPdf'),
    apiValidator(
      'json',
      z.object({ content: z.string().min(8).max(2800000) }).strict(),
    ),
    async (c) => {
      await actor(c, 'assistant');
      return c.json({ data: await extractPdf(c.req.valid('json').content) });
    },
  );
  router.post(
    '/assistant/analyze',
    spec('Analyze'),
    apiValidator(
      'json',
      z
        .object({
          text: z.string().trim().min(1).max(20000),
          mode: z.enum(['rules', 'model']),
          recordId: z.string().uuid().optional(),
          employee: z
            .enum(['showcase.delivery', 'showcase.approval', 'showcase.ledger'])
            .optional(),
        })
        .strict(),
    ),
    async (c) =>
      c.json({
        data: await service.analyze(
          await actor(c, 'assistant'),
          c.req.valid('json').text,
          c.req.valid('json').mode,
          c.req.valid('json').employee,
          c.req.valid('json').recordId,
        ),
      }),
  );
  router.post(
    '/assistant/prepare',
    spec('Prepare'),
    apiValidator(
      'json',
      z
        .object({
          id: z.string().uuid(),
          utterance: z.string().trim().min(1).max(1000),
        })
        .strict(),
    ),
    async (c) => {
      const input = c.req.valid('json');
      return c.json({
        data: await service.prepare(
          await actor(c, 'assistant'),
          input.id,
          input.utterance,
        ),
      });
    },
  );
  router.post(
    '/assistant/commit',
    spec('Commit'),
    apiValidator(
      'json',
      z
        .object({
          proposalId: z.string().uuid(),
          requestId: z.string().min(1).max(100),
        })
        .strict(),
    ),
    async (c) =>
      c.json({
        data: await service.commit(
          await actor(c, 'assistant'),
          c.req.valid('json').proposalId,
          c.req.valid('json').requestId,
        ),
      }),
  );
  const root = new Hono();
  root.route('/showcase', router);
  return root;
});
export const showcaseCallbacks = defineRootRoutes((app: Application) => {
  const router = new Hono();
  router.get(
    '/external-demo',
    app.container.resolve(authenticationToken).required(),
    (c) => c.json({ error: { reason: 'DEMO_DISABLED' } }, 410),
  );
  // Public external protocol endpoint: connector signature replaces session authentication.
  router.post('/callbacks/showcase', async (c) => {
    const secret = process.env.SHOWCASE_WEBHOOK_SECRET;
    if (!secret) return c.json({ error: 'CONNECTOR_UNCONFIGURED' }, 503);
    const body = await c.req.text();
    if (Buffer.byteLength(body) > 65536)
      return c.json({ error: 'TOO_LARGE' }, 413);
    try {
      return c.json(
        await app.container
          .resolve(showcaseToken)
          .ingest(
            body,
            c.req.header('x-timestamp') ?? '',
            c.req.header('x-signature') ?? '',
            secret,
          ),
      );
    } catch (e) {
      if (e instanceof ShowcaseError)
        return c.json(
          { error: e.code },
          ['INVALID_SIGNATURE', 'STALE_SIGNATURE'].includes(e.code) ? 401 : 400,
        );
      throw e;
    }
  });
  return router;
});
