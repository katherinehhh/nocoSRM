import type { Application } from '@nocobase/app-server/application';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import {
  authenticationToken,
  type AuthEnv,
  userAdministrationServiceToken,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization/server';
import {
  ApiError,
  apiErrorHandler,
  defineApiRoutes,
  describeRoute,
  dataResponse,
  listResponse,
  apiErrorResponses,
  apiValidator,
} from '@nocobase/app-server/router';
import { operationsToken } from '../providers/operations/index.js';
import { BusinessError, type Actor } from '../providers/operations/service.js';
import { actionNames } from '../providers/operations/resources.js';
import {
  kinds,
  portalKinds,
  type Kind,
  type Doc,
} from '../../shared/operations.js';
import { createDemo } from '../providers/operations/demo.js';
const Output = z.object({ id: z.string() }).passthrough();
const LineSchema = z
  .object({
    id: z.string().max(64),
    materialId: z.string().min(1).max(64),
    sourceLineId: z.string().max(64).optional(),
    quantity: z.number().positive().max(100000000),
    price: z.number().nonnegative().max(100000000),
    taxRate: z.number().min(0).max(100),
    accepted: z.number().nonnegative().optional(),
    rejected: z.number().nonnegative().optional(),
    warehouseId: z.string().optional(),
  })
  .strict();
const Field = z
  .object({
    lines: z.array(LineSchema).max(100).optional(),
    sourceId: z.string().optional(),
    orderId: z.string().optional(),
    receiptId: z.string().optional(),
    invoiceId: z.string().optional(),
    settlementId: z.string().optional(),
    warehouseId: z.string().optional(),
    contact: z.string().max(300).optional(),
    terms: z.number().int().min(0).max(365).optional(),
    unit: z.string().max(30).optional(),
    reorderPoint: z.number().nonnegative().optional(),
    openingStock: z.number().nonnegative().optional(),
    tracking: z.string().max(200).optional(),
    reference: z.string().max(200).optional(),
    invoiceNumber: z.string().max(200).optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    inputTax: z.number().nonnegative().optional(),
    outputTax: z.number().nonnegative().optional(),
    deductible: z.number().min(0).max(100).optional(),
    template: z.enum(['reorder', 'delivery', 'matching', 'payment']).optional(),
    threshold: z.number().nonnegative().optional(),
    timezone: z.string().optional(),
    validFrom: z.string().optional(),
    validTo: z.string().optional(),
  })
  .strip();
const Input = z
  .object({
    name: z.string().min(1).max(200),
    supplierId: z.string().nullable().optional(),
    businessDate: z.string(),
    notes: z.string().max(4000).optional(),
    payload: Field,
    amount: z.number().int().nonnegative().optional(),
    version: z.number().int().optional(),
    requestId: z.string().min(1).max(100),
  })
  .strict();
const ActionInput = z
  .object({
    version: z.number().int(),
    requestId: z.string().min(1).max(100),
    reason: z.string().max(2000).optional(),
    reference: z.string().max(200).optional(),
    businessDate: z.string().optional(),
  })
  .strict();
const Query = z.object({
  q: z.string().optional(),
  status: z.string().optional(),
  supplierId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.string().optional(),
  pageSize: z.string().optional(),
  sort: z.string().optional(),
  direction: z.string().optional(),
});
const Param = z.object({
  kind: z.enum(kinds),
  id: z.string().optional(),
  action: z.enum(actionNames).optional(),
});
export const operationsRoutes = defineApiRoutes((app: Application) => {
  const router = new Hono<AuthEnv & AuthorizationEnv>();
  const auth = app.container.resolve(authenticationToken),
    authz = app.container.resolve(authorizationToken),
    service = app.container.resolve(operationsToken);
  router.use('*', auth.required(), authz.middleware());
  router.onError((error, c) =>
    apiErrorHandler(
      error instanceof BusinessError
        ? new ApiError({
            status:
              error.code === 'FORBIDDEN'
                ? 'PERMISSION_DENIED'
                : error.code === 'NOT_FOUND'
                  ? 'NOT_FOUND'
                  : ['REQUIRED', 'INVALID'].includes(error.code)
                    ? 'INVALID_ARGUMENT'
                    : 'ABORTED',
            reason: error.code,
            domain: 'operations',
            message: error.code,
            fieldViolations: error.field
              ? [
                  {
                    field: error.field,
                    description: error.code,
                    reason: error.code,
                  },
                ]
              : undefined,
          })
        : error,
      c,
    ),
  );
  async function actor(
    c: Context<AuthEnv & AuthorizationEnv>,
    kind: Kind,
    action: string,
  ): Promise<Actor> {
    const decision = await c.get('authz').authorize({
      resource: { type: 'composite', id: `operations.${kind}` },
      action,
    });
    if (decision.effect === 'deny' || !decision.conditions?.database)
      throw new BusinessError('FORBIDDEN');
    const user = c.get('auth')!.user;
    const member = await service.db
      .repository<{
        userId: string;
        organizationId: string;
        supplierId: string | null;
      }>('opsMemberships')
      .findOne({ filter: { userId: user.id } });
    const unrestricted = (await c.get('authz').snapshot()).unrestricted;
    if (!member && !unrestricted) throw new BusinessError('FORBIDDEN');
    if (member?.supplierId && !portalKinds.includes(kind))
      throw new BusinessError('FORBIDDEN');
    return {
      id: user.id,
      organizationId: member?.organizationId ?? 'main',
      supplierId: member?.supplierId ?? null,
      policies: decision.conditions.database,
    };
  }
  const description = (name: string, list = false) =>
    describeRoute({
      tags: ['Operations'],
      summary: name,
      operationId: `operations${name}`,
      responses: {
        '200': list ? listResponse(Output) : dataResponse(Output),
        ...apiErrorResponses,
      },
    });
  router.get('/capabilities', description('Capabilities'), async (c) => {
    const permissions: Record<string, string[]> = {};
    for (const kind of kinds) {
      permissions[kind] = [];
      for (const action of actionNames)
        if (
          await c.get('authz').can({
            resource: { type: 'composite', id: `operations.${kind}` },
            action,
          })
        )
          permissions[kind].push(action);
    }
    const user = c.get('auth')!.user;
    const member = await service.db
      .repository<{ userId: string; supplierId: string | null }>(
        'opsMemberships',
      )
      .findOne({ filter: { userId: user.id } });
    return c.json({
      data: {
        permissions,
        supplierId: member?.supplierId ?? null,
        admin: await c.get('authz').can({
          resource: { type: 'settings', id: 'operations.admin' },
          action: 'update',
        }),
      },
    });
  });
  router.post(
    '/demo',
    description('CreateDemo'),
    apiValidator('json', z.object({ password: z.string().min(12).max(100) })),
    async (c) => {
      await c.get('authz').require({
        resource: { type: 'settings', id: 'operations.admin' },
        action: 'update',
      });
      if (process.env.NODE_ENV === 'production')
        throw new BusinessError('FORBIDDEN');
      const result = await createDemo(
        service,
        authz,
        app.container.resolve(userAdministrationServiceToken),
        c.req.valid('json').password,
      );
      return c.json({ data: result });
    },
  );
  router.get('/settings', description('ReadSettings'), async (c) => {
    await c.get('authz').require({
      resource: { type: 'settings', id: 'operations.admin' },
      action: 'read',
    });
    const rows = await service.db
      .repository<{ id: string; payload: string; version: number }>(
        'opsSettings',
      )
      .findMany({ limit: 20 });
    return c.json({
      data: rows.map((r) => ({
        ...r,
        payload: JSON.parse(r.payload) as unknown,
      })),
    });
  });
  router.patch(
    '/settings/:section',
    description('SaveSettings'),
    apiValidator(
      'param',
      z.object({ section: z.enum(['organization', 'finance', 'automation']) }),
    ),
    apiValidator(
      'json',
      z.object({
        version: z.number().int(),
        payload: z
          .object({
            name: z.string().max(200).optional(),
            terms: z.number().int().min(0).max(365).optional(),
            tolerance: z.number().int().min(0).max(10000).optional(),
            approvalLimit: z.number().int().min(0).optional(),
            timezone: z.string().optional(),
            start: z
              .string()
              .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
              .optional(),
            end: z
              .string()
              .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
              .optional(),
          })
          .strict(),
      }),
    ),
    async (c) => {
      await c.get('authz').require({
        resource: { type: 'settings', id: 'operations.admin' },
        action: 'update',
      });
      const id = c.req.valid('param').section,
        input = c.req.valid('json');
      if (input.payload.timezone) {
        try {
          new Intl.DateTimeFormat('en', { timeZone: input.payload.timezone });
        } catch {
          throw new BusinessError('INVALID', 'timezone');
        }
      }
      await service.db.transaction(async (tx) => {
        const repo = tx.repository<{
            id: string;
            payload: string;
            version: number;
          }>('opsSettings'),
          row = await repo.findOne({ filter: { id } });
        if (row) {
          if (row.version !== input.version)
            throw new BusinessError('VERSION_CONFLICT');
          await repo.updateOne({
            filter: { id, version: input.version },
            values: {
              payload: JSON.stringify(input.payload),
              version: input.version + 1,
            },
          });
        } else {
          if (input.version !== 0) throw new BusinessError('VERSION_CONFLICT');
          await repo.createOne({
            values: { id, payload: JSON.stringify(input.payload), version: 1 },
          });
        }
      });
      return c.json({ data: { id, version: input.version + 1 } });
    },
  );
  router.get(
    '/lookups/:kind',
    description('Lookups'),
    apiValidator('param', Param),
    async (c) => {
      const a = await actor(c, c.req.valid('param').kind, 'view'),
        tx = service.db.connection();
      const data: Record<string, unknown> = {};
      for (const k of [
        'suppliers',
        'materials',
        'warehouses',
        'orders',
        'receipts',
        'invoices',
        'settlements',
      ] as Kind[]) {
        const scope = ['suppliers', 'materials', 'warehouses'].includes(k)
          ? { ...a, supplierId: null }
          : a;
        data[k] = await service.all(
          tx,
          scope,
          k,
          k === 'suppliers' && a.supplierId ? { id: a.supplierId } : {},
        );
      }
      return c.json({ data });
    },
  );
  router.get('/dashboard', description('Dashboard'), async (c) => {
    await c.get('authz').require({
      resource: { type: 'page', id: 'operations.dashboard' },
      action: 'access',
    });
    const cards = [];
    for (const kind of ['plans', 'orders', 'payments', 'runs'] as Kind[]) {
      const a = await actor(c, kind, 'view'),
        docs = await service.all(service.db.connection(), a, kind);
      cards.push({
        kind,
        count: docs.length,
        amount: docs.reduce((v, d) => v + d.amount, 0),
      });
    }
    const tasks = (
      await service.list(await actor(c, 'tasks', 'view'), 'tasks', {
        status: 'open',
        pageSize: '6',
      })
    ).data;
    const recent = (
      await service.list(await actor(c, 'orders', 'view'), 'orders', {
        pageSize: '6',
      })
    ).data;
    const stock = (await service.stock(await actor(c, 'materials', 'view')))
      .slice(0, 6)
      .map((m) => ({
        name: m.name,
        stock: m.stock,
        threshold: m.payload.reorderPoint ?? 0,
      }));
    return c.json({ data: { cards, tasks, recent, stock } });
  });
  router.get('/stock', description('Stock'), async (c) =>
    c.json({ data: await service.stock(await actor(c, 'materials', 'view')) }),
  );
  router.get(
    '/:kind',
    description('List', true),
    apiValidator('param', Param),
    apiValidator('query', Query),
    async (c) => {
      const k = c.req.valid('param').kind;
      return c.json(
        await service.list(await actor(c, k, 'view'), k, c.req.valid('query')),
      );
    },
  );
  router.get(
    '/:kind/:id/history',
    description('History', true),
    apiValidator('param', Param),
    async (c) => {
      const { kind, id } = c.req.valid('param');
      return c.json({
        data: await service.history(await actor(c, kind, 'view'), kind, id!),
      });
    },
  );
  router.get(
    '/:kind/:id',
    description('Get'),
    apiValidator('param', Param),
    async (c) => {
      const { kind, id } = c.req.valid('param');
      return c.json({
        data: await service.get(
          service.db.connection(),
          await actor(c, kind, 'view'),
          kind,
          id!,
        ),
      });
    },
  );
  router.post(
    '/:kind',
    description('Create'),
    apiValidator('param', Param),
    apiValidator('json', Input),
    async (c) => {
      const { kind } = c.req.valid('param'),
        input = c.req.valid('json');
      if (['runs', 'tasks'].includes(kind))
        throw new BusinessError('FORBIDDEN');
      return c.json({
        data: await service.create(
          await actor(c, kind, 'create'),
          kind,
          input as Partial<Doc>,
          input.requestId,
        ),
      });
    },
  );
  router.patch(
    '/:kind/:id',
    description('Edit'),
    apiValidator('param', Param),
    apiValidator('json', Input),
    async (c) => {
      const { kind, id } = c.req.valid('param');
      return c.json({
        data: await service.edit(
          await actor(c, kind, 'edit'),
          kind,
          id!,
          c.req.valid('json') as Partial<Doc>,
        ),
      });
    },
  );
  router.post(
    '/:kind/:id/actions/:action',
    description('Action'),
    apiValidator('param', Param),
    apiValidator('json', ActionInput),
    async (c) => {
      const { kind, id, action } = c.req.valid('param');
      return c.json({
        data: await service.action(
          await actor(c, kind, action!),
          kind,
          id!,
          action!,
          c.req.valid('json'),
        ),
      });
    },
  );
  const root = new Hono();
  root.route('/operations', router);
  return root;
});
