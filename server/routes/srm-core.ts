import { SrmAiService } from '../srm-ai/service.js';
import { AiAnalyzeInput, aiPurposes } from '../../shared/srm-ai.js';
import { LifecycleError, lifecycleErrorFields } from '@nocobase/lifecycle';
import { BusinessError } from '../providers/operations/service.js';
import type { Application } from '@nocobase/app-server/application';
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
  defineApiRoutes,
  apiValidator,
  describeRoute,
  dataResponse,
  listResponse,
  apiErrorResponses,
  apiErrorHandler,
  ApiError,
} from '@nocobase/app-server/router';
import { coreToken } from '../srm-core/provider.js';
import {
  coreFail,
  appendFilter,
  statusFilter,
  type CoreActor,
} from '../srm-core/service.js';
import { coreContext } from '../srm-core/policy-context.js';
import { businessMembership } from '../services/business-membership.js';
import {
  coreKinds,
  coreActions,
  CoreInput,
  CoreActionInput,
  decodeCore,
  CoreRowSchema,
  type CoreKind,
} from '../../shared/srm-core.js';
import type { Doc } from '../../shared/operations.js';
const Params = z.object({
  kind: z.enum(coreKinds),
  id: z.string().uuid().optional(),
  action: z.enum(coreActions).optional(),
});
const Query = z.object({
  q: z.string().max(200).optional(),
  status: z.string().optional(),
  page: z.string().optional(),
  sort: z.string().optional(),
  direction: z.string().optional(),
});
const Output = z.object({ id: z.string() }).passthrough();
export const coreRoutes = defineApiRoutes((app: Application) => {
  const router = new Hono<AuthEnv & AuthorizationEnv>(),
    auth = app.container.resolve(authenticationToken),
    authz = app.container.resolve(authorizationToken),
    service = app.container.resolve(coreToken);
  router.use('*', auth.required(), authz.middleware());
  router.onError((e, c) =>
    apiErrorHandler(
      e instanceof LifecycleError
        ? new ApiError({
            ...lifecycleErrorFields(e),
            status: lifecycleErrorFields(e)?.status ?? 'INTERNAL',
            reason:
              e.blockers[0]?.code ??
              lifecycleErrorFields(e)?.reason ??
              'INVALID',
            domain: 'srmCore',
            message: e.message,
          })
        : e instanceof BusinessError
          ? new ApiError({
              status:
                e.code === 'FORBIDDEN'
                  ? 'PERMISSION_DENIED'
                  : e.code === 'NOT_FOUND'
                    ? 'NOT_FOUND'
                    : 'FAILED_PRECONDITION',
              reason: e.code,
              domain: 'srmCore',
              message: e.code,
            })
          : e,
      c,
    ),
  );
  const doc = (name: string, list = false) =>
    describeRoute({
      tags: ['SRM core'],
      operationId: `srmCore${name}`,
      summary: name,
      responses: {
        200: list
          ? listResponse(Output)
          : dataResponse(z.object({}).passthrough()),
        ...apiErrorResponses,
      },
    });
  async function permissions(c: Context<AuthEnv & AuthorizationEnv>) {
    const result: Record<CoreKind, string[]> = {
      admission: [],
      rfq: [],
      quote: [],
      inspection: [],
      return: [],
    };
    for (const kind of coreKinds)
      for (const action of coreActions)
        if (
          await c.get('authz').can({
            resource: { type: 'composite', id: `srmCore.${kind}` },
            action,
          })
        )
          result[kind].push(action);
    const member = await businessMembership(
      service.db,
      app.container,
      c.get('auth')!.user.id,
      (await c.get('authz').snapshot()).unrestricted,
    );
    if (!member) {
      for (const kind of coreKinds) result[kind] = [];
    } else if (member.supplierId) {
      for (const kind of coreKinds)
        if (!['rfq', 'quote', 'return'].includes(kind)) result[kind] = [];
    } else {
      result.quote = result.quote.filter((action) => action !== 'create');
    }
    return result;
  }
  async function actor(
    c: Context<AuthEnv & AuthorizationEnv>,
    kind: CoreKind,
    action: string,
  ): Promise<CoreActor> {
    const decision = await c.get('authz').authorize({
      resource: { type: 'composite', id: `srmCore.${kind}` },
      action,
    });
    if (decision.effect === 'deny' || !decision.conditions?.database)
      coreFail('FORBIDDEN', 'PERMISSION_DENIED');
    const id = c.get('auth')!.user.id,
      member = await businessMembership(
        service.db,
        app.container,
        id,
        (await c.get('authz').snapshot()).unrestricted,
      );
    if (!member) coreFail('FORBIDDEN', 'PERMISSION_DENIED');
    return {
      id,
      organizationId: member.organizationId,
      supplierId: member.supplierId ?? null,
      policies: decision.conditions.database,
      permissions: await permissions(c),
    };
  }
  const ai = new SrmAiService(service, app);
  const aiAction = (purpose: (typeof aiPurposes)[number]) =>
    purpose === 'qualityReturn'
      ? { kind: 'return' as const, action: 'create' }
      : {
          kind: 'rfq' as const,
          action: purpose === 'requestDraft' ? 'edit' : 'nominate',
        };
  const AiParams = z.object({
    purpose: z.enum(aiPurposes),
    id: z.string().uuid(),
  });
  router.get('/srmCore/ai/status', doc('AI model configuration'), async (c) => {
    const caps = await permissions(c);
    if (!coreKinds.some((k) => caps[k].includes('view')))
      coreFail('FORBIDDEN', 'PERMISSION_DENIED');
    return c.json({ data: await ai.status() });
  });
  router.post(
    '/srmCore/ai/analyze',
    doc('AI business proposal'),
    apiValidator('json', AiAnalyzeInput),
    async (c) => {
      const input = c.req.valid('json'),
        target = aiAction(input.purpose);
      const readActor = await actor(c, input.kind, 'view');
      return c.json({
        data: await ai.analyze(
          await actor(c, target.kind, target.action),
          input,
          readActor,
        ),
      });
    },
  );
  router.get(
    '/srmCore/ai/:purpose/proposals/:id',
    doc('AI proposal'),
    apiValidator('param', AiParams),
    async (c) => {
      const { purpose, id } = c.req.valid('param'),
        target = aiAction(purpose),
        a = await actor(c, target.kind, target.action),
        p = await ai.get(a, id);
      if (p.purpose !== purpose) coreFail('NOT_FOUND', 'NOT_FOUND');
      await service.get(
        service.db.connection(),
        await actor(c, p.kind, 'view'),
        p.kind,
        p.recordId,
      );
      return c.json({ data: ai.public(p) });
    },
  );
  router.post(
    '/srmCore/ai/:purpose/proposals/:id/confirm',
    doc('Confirm AI business proposal'),
    apiValidator('param', AiParams),
    apiValidator('json', z.object({}).strict()),
    async (c) => {
      const { purpose, id } = c.req.valid('param'),
        target = aiAction(purpose),
        a = await actor(c, target.kind, target.action),
        p = await ai.get(a, id);
      if (p.purpose !== purpose) coreFail('NOT_FOUND', 'NOT_FOUND');
      const readActor = await actor(c, p.kind, 'view');
      return c.json({ data: await ai.confirm(a, id, readActor) });
    },
  );
  router.get('/srmCore/capabilities', doc('Capabilities'), async (c) => {
    const member = await businessMembership(
      service.db,
      app.container,
      c.get('auth')!.user.id,
      (await c.get('authz').snapshot()).unrestricted,
    );
    return c.json({
      data: {
        permissions: member
          ? await permissions(c)
          : Object.fromEntries(coreKinds.map((k) => [k, []])),
        supplierId: member?.supplierId ?? null,
      },
    });
  });
  router.get(
    '/srmCore/lookups/:kind',
    doc('Lookups'),
    apiValidator('param', Params),
    async (c) => {
      const kind = c.req.valid('param').kind,
        a = await actor(c, kind, 'view');
      return coreContext.run(a, async () => {
        const conn = service.db.connection();
        const suppliers = (
          await service.ops.all(conn, { ...a, supplierId: null }, 'suppliers')
        ).filter((s) => !a.supplierId || s.id === a.supplierId);
        const materials = await service.ops.all(
          conn,
          { ...a, supplierId: null },
          'materials',
        );
        let rfqs: ReturnType<typeof decodeCore>[] = [],
          receipts: Doc[] = [];
        const inspections: ReturnType<typeof decodeCore>[] = [];
        if (kind === 'quote') {
          const rows = await service.repo(conn, a).findMany({
            filter: appendFilter(await service.filter(conn, a, 'rfq'), [
              statusFilter(['open']),
            ]),
            limit: 1000,
          });
          rfqs = await Promise.all(
            rows
              .filter((r) => r.status === 'open')
              .map((r) => service.public(conn, a, CoreRowSchema.parse(r))),
          );
        }
        if (kind === 'inspection')
          receipts = (await service.ops.all(conn, a, 'receipts')).filter(
            (r) => r.status === 'draft',
          );
        if (kind === 'return') {
          const rows = await service.repo(conn, a).findMany({
            filter: appendFilter(await service.filter(conn, a, 'inspection'), [
              statusFilter(['approved']),
            ]),
            limit: 1000,
          });
          for (const raw of rows) {
            const r = CoreRowSchema.parse(raw),
              receipt = await service.doc(conn, r, 'receipts', r.sourceId);
            if (receipt.status === 'posted') inspections.push(decodeCore(r));
          }
        }
        return c.json({
          data: {
            suppliers,
            materials,
            rfqs,
            receipts,
            inspections,
            capped: rfqs.length === 1000 || inspections.length === 1000,
          },
        });
      });
    },
  );
  router.get('/srmCore/workbench', doc('Workbench'), async (c) => {
    const caps = await permissions(c),
      first = coreKinds.find((k) => caps[k].includes('view'));
    if (!first) coreFail('FORBIDDEN', 'PERMISSION_DENIED');
    const base = await actor(c, first, 'view'),
      tasks: {
        id: string;
        name: string;
        number: string;
        kind: string;
        action: string;
        path: string;
        deadline: string;
      }[] = [],
      blocked: {
        id: string;
        name: string;
        path: string;
        remaining: number;
        overdue: boolean;
      }[] = [];
    let capped = false;
    for (const kind of coreKinds) {
      if (!caps[kind].includes('view')) continue;
      const a = await actor(c, kind, 'view');
      await coreContext.run(a, async () => {
        const conn = service.db.connection(),
          rows = await service.repo(conn, a).findMany({
            filter: appendFilter(await service.filter(conn, a, kind), [
              statusFilter([
                'draft',
                'open',
                'pending',
                'submitted',
                'rejected',
                'shipped',
              ]),
            ]),
            limit: 101,
          });
        if (rows.length > 100) capped = true;
        for (const raw of rows.slice(0, 100)) {
          const r = CoreRowSchema.parse(raw),
            view = await service.runtime.view('srmCoreRecords', r.id, {
              id: a.id,
            });
          const available = view.available
            .filter((transition) => transition.allowed)
            .map((v) => v.name)
            .filter((action) => caps[kind].includes(action));
          let action = [
            'approve',
            'submit',
            'nominate',
            'open',
            'confirm',
            'ship',
            'revise',
          ].find((v) => available.includes(v));
          if (
            kind === 'rfq' &&
            a.supplierId &&
            r.status === 'open' &&
            r.deadline >= new Date().toISOString().slice(0, 10)
          ) {
            const quote = await conn.repository('srmCoreRecords').findOne({
              filter: {
                kind: 'quote',
                sourceId: r.id,
                supplierId: a.supplierId,
                organizationId: a.organizationId,
              },
            });
            if (!quote && caps.quote.includes('create'))
              tasks.push({
                id: r.id,
                name: r.name,
                number: r.number,
                kind: 'quote',
                action: 'create',
                path: `/supply/srm/quotes/new?sourceId=${r.id}`,
                deadline: r.deadline,
              });
          }
          if (action === 'nominate') {
            const quotes = await conn.repository('srmCoreRecords').count({
              filter: {
                kind: 'quote',
                sourceId: r.id,
                status: 'submitted',
                organizationId: a.organizationId,
              },
            });
            if (!quotes) action = undefined;
          }
          if (action)
            tasks.push({
              id: r.id,
              name: r.name,
              number: r.number,
              kind,
              action,
              path: `/srm-workbench/${kind}/${r.id}`,
              deadline: r.deadline,
            });
        }
        // Returns approved for dispatch are included separately because they are not completed.
        if (kind === 'return' && caps.return.includes('ship')) {
          const rows = await service.repo(conn, a).findMany({
            filter: appendFilter(await service.filter(conn, a, kind), [
              statusFilter(['approved']),
            ]),
            limit: 101,
          });
          if (rows.length > 100) capped = true;
          for (const r of rows.slice(0, 100))
            tasks.push({
              id: r.id!,
              name: r.name!,
              number: r.number!,
              kind,
              action: 'ship',
              path: `/srm-workbench/return/${r.id}`,
              deadline: '',
            });
        }
      });
    }
    await coreContext.run(base, async () => {
      const conn = service.db.connection();
      if (!base.supplierId && caps.inspection.includes('create'))
        for (const r of (await service.ops.all(conn, base, 'receipts')).filter(
          (r) => r.status === 'draft',
        )) {
          const inspections = await service.repo(conn, base).findMany({
            filter: {
              kind: 'inspection',
              sourceId: r.id,
              organizationId: base.organizationId,
            },
            limit: 100,
          });
          const approved = inspections
            .map((v) => decodeCore(CoreRowSchema.parse(v)))
            .find(
              (v) =>
                v.status === 'approved' &&
                v.data.decidedReceiptVersion === r.version,
            );
          if (
            approved &&
            (await c.get('authz').can({
              resource: { type: 'composite', id: 'operations.receipts' },
              action: 'post',
            }))
          )
            tasks.push({
              id: r.id,
              name: r.name,
              number: r.number,
              kind: 'receipt',
              action: 'post',
              path: `/supply/receipts/${r.id}`,
              deadline: '',
            });
          const existing =
            !!approved ||
            inspections.some(
              (v) =>
                ['draft', 'pending'].includes(v.status!) &&
                decodeCore(CoreRowSchema.parse(v)).data.sourceVersion ===
                  r.version,
            );
          if (!existing)
            tasks.push({
              id: r.id,
              name: r.name,
              number: r.number,
              kind: 'inspection',
              action: 'create',
              path: `/supply/srm/inspections/new?sourceId=${r.id}`,
              deadline: '',
            });
        }
      if (caps.admission.includes('create'))
        for (const supplier of (
          await service.ops.all(
            conn,
            { ...base, supplierId: null },
            'suppliers',
          )
        ).filter((s) => s.status === 'candidate')) {
          const existing = await conn.repository('srmCoreRecords').findOne({
            filter: {
              kind: 'admission',
              sourceId: supplier.id,
              organizationId: base.organizationId,
            },
          });
          if (!existing)
            tasks.push({
              id: supplier.id,
              name: supplier.name,
              number: supplier.number,
              kind: 'admission',
              action: 'create',
              path: `/supply/srm/admissions/new?sourceId=${supplier.id}`,
              deadline: '',
            });
        }
      const orders = await service.ops.all(conn, base, 'orders'),
        receipts = (await service.ops.all(conn, base, 'receipts')).filter(
          (r) => r.status === 'posted',
        );
      for (const order of orders.filter((o) =>
        ['confirmed', 'partial'].includes(o.status),
      )) {
        let remaining = 0;
        for (const line of order.payload.lines ?? []) {
          const accepted = receipts
            .filter((r) => r.payload.orderId === order.id)
            .flatMap((r) => r.payload.lines ?? [])
            .filter((l) => l.sourceLineId === line.id)
            .reduce((sum, l) => sum + (l.accepted ?? l.quantity), 0);
          remaining += Math.max(0, line.quantity - accepted);
        }
        if (remaining)
          blocked.push({
            id: order.id,
            name: order.name,
            path: `/supply/orders/${order.id}`,
            remaining,
            overdue:
              !!order.payload.expectedDeliveryDate &&
              order.payload.expectedDeliveryDate <
                new Date().toISOString().slice(0, 10),
          });
      }
      if (
        base.supplierId &&
        (await c.get('authz').can({
          resource: { type: 'composite', id: 'operations.orders' },
          action: 'confirm',
        }))
      )
        for (const order of orders.filter((o) => o.status === 'approved'))
          tasks.push({
            id: order.id,
            name: order.name,
            number: order.number,
            kind: 'order',
            action: 'confirm',
            path: `/portal/orders/${order.id}`,
            deadline: order.payload.expectedDeliveryDate ?? '',
          });
    });
    return c.json({
      data: { tasks, blocked, capped, supplierId: base.supplierId },
    });
  });
  router.get(
    '/srmCore/:kind',
    doc('List', true),
    apiValidator('param', Params),
    apiValidator('query', Query),
    async (c) => {
      const kind = c.req.valid('param').kind,
        a = await actor(c, kind, 'view');
      return c.json(await service.list(a, kind, c.req.valid('query')));
    },
  );
  router.get(
    '/srmCore/:kind/:id',
    doc('Detail'),
    apiValidator('param', Params),
    async (c) => {
      const { kind, id } = c.req.valid('param');
      return c.json({
        data: await service.detail(await actor(c, kind, 'view'), kind, id!),
      });
    },
  );
  router.post(
    '/srmCore/:kind',
    doc('Create'),
    apiValidator('param', Params),
    apiValidator('json', CoreInput),
    async (c) => {
      const kind = c.req.valid('param').kind,
        a = await actor(c, kind, 'create');
      const row = await service.create(a, kind, c.req.valid('json'));
      return c.json({
        data: await service.public(service.db.connection(), a, row),
      });
    },
  );
  router.post(
    '/srmCore/:kind/:id/actions/:action',
    doc('Action'),
    apiValidator('param', Params),
    apiValidator('json', CoreActionInput),
    async (c) => {
      const { kind, id, action } = c.req.valid('param'),
        a = await actor(c, kind, action!);
      const row = await service.action(
        a,
        kind,
        id!,
        action!,
        c.req.valid('json'),
      );
      return c.json({
        data: await service.public(service.db.connection(), a, row),
      });
    },
  );
  const root = new Hono();
  root.route('/', router);
  return root;
});
