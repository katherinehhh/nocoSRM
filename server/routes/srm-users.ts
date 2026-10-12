import type { Application } from '@nocobase/app-server/application';
import { randomUUID, createHash } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import {
  authenticationToken,
  userAdministrationServiceToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization/server';
import {
  userRoleScopeRegistryToken,
  type UserRoleValue,
} from '@nocobase/app-plugin-users/server/tokens';
import { databaseManagerToken } from '@nocobase/db';
import {
  ApiError,
  apiErrorHandler,
  defineApiRoutes,
  describeRoute,
  apiValidator,
  dataResponse,
  apiErrorResponses,
} from '@nocobase/app-server/router';
import type { BusinessMembership } from '../services/business-membership.js';
const Params = z.object({ id: z.string().min(1).max(64) });
const Profile = z
  .object({
    organizationId: z.literal('main'),
    supplierId: z.string().min(1).max(64).nullable(),
    enabled: z.boolean(),
    expectedVersion: z.number().int().nonnegative(),
    requestId: z.string().min(1).max(100),
  })
  .strict();
const SafeUser = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  username: z.string().nullable().optional(),
  kind: z.literal('person'),
  disabledAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  emailVerified: z.boolean(),
  roleScopes: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
});
const spec = (name: string, schema: z.ZodType = z.json()) =>
  describeRoute({
    tags: ['SRM user administration'],
    operationId: `srm${name}`,
    summary: name,
    responses: { 200: dataResponse(schema), ...apiErrorResponses },
  });
export const srmUsersRoutes = defineApiRoutes((app: Application) => {
  const root = new Hono(),
    router = new Hono<AuthEnv & AuthorizationEnv>();
  const db = app.container.resolve(databaseManagerToken),
    users = app.container.resolve(userAdministrationServiceToken),
    registry = app.container.resolve(userRoleScopeRegistryToken);
  router.use(
    '*',
    app.container.resolve(authenticationToken).required(),
    app.container.resolve(authorizationToken).middleware(),
  );
  router.onError(apiErrorHandler);
  async function requireUser(
    c: Context<AuthEnv & AuthorizationEnv>,
    id: string,
  ) {
    await c
      .get('authz')
      .require({ resource: { type: 'user', id }, action: 'read' });
    const user = await users.get(id);
    if (!user || user.kind !== 'person')
      throw new ApiError({
        status: 'NOT_FOUND',
        reason: 'USER_NOT_FOUND',
        domain: 'srm',
        message: 'User not found.',
      });
    return user;
  }
  router.get(
    '/users/:id',
    spec('ReadUser', SafeUser),
    apiValidator('param', Params),
    async (c) => {
      const user = await requireUser(c, c.req.valid('param').id);
      const roleScopes: Record<string, UserRoleValue> = {};
      for (const scope of registry.list())
        roleScopes[scope.key] = await scope.get(user.id, db.connection());
      return c.json({
        data: {
          id: user.id,
          name: user.name,
          email: user.email,
          username: user.username,
          kind: 'person',
          emailVerified: user.emailVerified,
          disabledAt: user.disabledAt?.toISOString() ?? null,
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
          roleScopes,
        },
      });
    },
  );
  router.get(
    '/users/:id/business-profile',
    spec('ReadBusinessProfile'),
    apiValidator('param', Params),
    async (c) => {
      const user = await requireUser(c, c.req.valid('param').id);
      await c.get('authz').require({
        resource: { type: 'settings', id: 'operations.admin' },
        action: 'read',
      });
      const profile = await db
        .repository<BusinessMembership>('opsMemberships')
        .findOne({ filter: { userId: user.id } });
      const supplier = profile?.supplierId
        ? await db
            .repository<{ id: string; name: string; organizationId: string }>(
              'opsSuppliers',
            )
            .findOne({
              filter: { id: profile.supplierId, organizationId: 'main' },
              select: (s) => s.fields('id', 'name'),
            })
        : null;
      return c.json({
        data: profile
          ? { ...profile, supplierName: supplier?.name ?? null }
          : null,
      });
    },
  );
  router.put(
    '/users/:id/business-profile',
    spec('SaveBusinessProfile'),
    apiValidator('param', Params),
    apiValidator('json', Profile),
    async (c) => {
      const user = await requireUser(c, c.req.valid('param').id),
        input = c.req.valid('json'),
        actorId = c.get('auth')!.user.id;
      await c.get('authz').require({
        resource: { type: 'settings', id: 'operations.admin' },
        action: 'update',
      });
      const digest = createHash('sha256')
        .update(JSON.stringify({ userId: user.id, ...input }))
        .digest('hex');
      const conflict = () =>
        new ApiError({
          status: 'ABORTED',
          reason: 'CONFLICT',
          domain: 'srm',
          message: 'Business membership changed. Reload and review.',
        });
      const saved = await db.transaction(async (tx) => {
        const audit = tx.repository<{
          id: string;
          actorId: string;
          requestId: string;
          digest: string;
          after: string;
          userId: string;
          before: string | null;
          at: string;
        }>('srmMembershipAudit');
        const prior = await audit.findOne({
          filter: { actorId, requestId: input.requestId },
        });
        if (prior) {
          if (prior.digest !== digest) throw conflict();
          return JSON.parse(prior.after) as BusinessMembership;
        }
        if (input.supplierId) {
          const supplier = await tx
            .repository<{ id: string; organizationId: string; status: string }>(
              'opsSuppliers',
            )
            .findOne({
              filter: {
                id: input.supplierId,
                organizationId: 'main',
                status: 'active',
              },
            });
          if (!supplier)
            throw new ApiError({
              status: 'INVALID_ARGUMENT',
              reason: 'SUPPLIER_INACTIVE',
              domain: 'srm',
              message: 'Select an active supplier.',
            });
        }
        const scope = registry.get('app'),
          roles = scope ? await scope.get(user.id, tx) : [];
        if (
          input.enabled &&
          !input.supplierId &&
          (Array.isArray(roles) ? roles : [roles]).includes(
            'operations-supplier',
          )
        )
          throw new ApiError({
            status: 'INVALID_ARGUMENT',
            reason: 'SUPPLIER_REQUIRED',
            domain: 'srm',
            message: 'A supplier member must have a supplier.',
          });
        const repo = tx.repository<BusinessMembership>('opsMemberships'),
          old = await repo.findOne({ filter: { userId: user.id } });
        if ((old?.version ?? 0) !== input.expectedVersion) throw conflict();
        const value = {
          id: old?.id ?? randomUUID(),
          userId: user.id,
          organizationId: 'main',
          supplierId: input.supplierId,
          enabled: input.enabled,
          version: (old?.version ?? 0) + 1,
        };
        const result = old
          ? await repo.updateOne({
              filter: { id: old.id, version: old.version },
              values: value,
            })
          : await repo.createOne({ values: value });
        if (!result) throw conflict();
        await audit.createOne({
          values: {
            id: randomUUID(),
            userId: user.id,
            actorId,
            requestId: input.requestId,
            digest,
            before: old ? JSON.stringify(old) : null,
            after: JSON.stringify(value),
            at: new Date().toISOString(),
          },
        });
        return value;
      });
      return c.json({ data: saved });
    },
  );
  router.get(
    '/suppliers',
    spec('BusinessSupplierOptions'),
    apiValidator(
      'query',
      z.object({
        q: z.string().max(200).default(''),
        page: z.coerce.number().int().positive().default(1),
      }),
    ),
    async (c) => {
      await c.get('authz').require({
        resource: { type: 'settings', id: 'operations.admin' },
        action: 'read',
      });
      const { q, page } = c.req.valid('query');
      const filter: import('@nocobase/repository-input').FilterAst = {
        kind: 'filter',
        version: 1,
        root: {
          kind: 'group',
          logic: 'and',
          items: [
            {
              kind: 'condition',
              path: ['organizationId'],
              operator: '$eq',
              value: 'main',
            },
            {
              kind: 'condition',
              path: ['status'],
              operator: '$eq',
              value: 'active',
            },
            ...(q
              ? [
                  {
                    kind: 'condition' as const,
                    path: ['name'],
                    operator: '$includes' as const,
                    value: q,
                  },
                ]
              : []),
          ],
        },
      };
      const repo = db.repository<{
        id: string;
        name: string;
        organizationId: string;
        status: string;
      }>('opsSuppliers');
      return c.json({
        data: await repo.findMany({
          filter,
          select: (s) => s.fields('id', 'name'),
          limit: 20,
          offset: (page - 1) * 20,
          sort: (s) => s.field('id').asc(),
        }),
        meta: { page, pageSize: 20, total: await repo.count({ filter }) },
      });
    },
  );
  root.route('/srm', router);
  return root;
});
