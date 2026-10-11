import { defineSeed } from '@nocobase/db';
import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
const kinds = [
  'suppliers',
  'materials',
  'warehouses',
  'plans',
  'orders',
  'dispatches',
  'receipts',
  'invoices',
  'settlements',
  'payments',
  'reconciliations',
  'taxScenarios',
  'policies',
  'runs',
  'tasks',
] as const;
type Kind = (typeof kinds)[number];
const tables: Record<Kind, string> = Object.fromEntries(
  kinds.map((k) => [k, `ops${k[0].toUpperCase()}${k.slice(1)}`]),
) as Record<Kind, string>;
interface Transition {
  from: string[];
  to: string;
  roles: string[];
}
const transition = (
  from: string[],
  to: string,
  roles: string[],
): Transition => ({ from, to, roles });
const transitions: Partial<Record<Kind, Record<string, Transition>>> = {
  plans: {
    submit: transition(['draft'], 'pending', ['planner']),
    approve: transition(['pending'], 'approved', ['buyer']),
    reject: transition(['pending'], 'draft', ['buyer']),
    convert: transition(['approved'], 'completed', ['buyer']),
  },
  orders: {
    submit: transition(['draft'], 'pending', ['buyer']),
    approve: transition(['pending'], 'approved', ['admin']),
    reject: transition(['pending'], 'draft', ['admin']),
    confirm: transition(['approved'], 'confirmed', ['supplier']),
    close: transition(['received'], 'closed', ['buyer']),
  },
  dispatches: {
    ship: transition(['draft'], 'shipped', ['supplier']),
    arrive: transition(['shipped'], 'arrived', ['warehouse']),
  },
  receipts: { post: transition(['draft'], 'posted', ['warehouse']) },
  invoices: {
    submit: transition(['draft'], 'pending', ['supplier', 'finance']),
    match: transition(['pending', 'disputed'], 'matched', ['finance']),
    reject: transition(['pending', 'disputed'], 'draft', ['finance']),
  },
  settlements: {
    match: transition(['draft', 'disputed'], 'matched', ['finance']),
    submit: transition(['matched'], 'pending', ['finance']),
    approve: transition(['pending'], 'approved', ['approver']),
    reject: transition(['pending'], 'draft', ['approver']),
  },
  payments: {
    submit: transition(['draft'], 'pending', ['finance']),
    approve: transition(['pending'], 'approved', ['approver']),
    reject: transition(['pending'], 'draft', ['approver']),
    record: transition(['approved'], 'paid', ['finance']),
  },
  reconciliations: {
    publish: transition(['draft'], 'pending', ['finance']),
    confirm: transition(['pending'], 'confirmed', ['supplier']),
    dispute: transition(['pending'], 'disputed', ['supplier']),
    revise: transition(['disputed'], 'draft', ['finance']),
  },
  taxScenarios: {
    calculate: transition(['draft', 'calculated'], 'calculated', ['finance']),
    submit: transition(['calculated'], 'pending', ['finance']),
    review: transition(['pending'], 'reviewed', ['approver']),
    reject: transition(['pending'], 'draft', ['approver']),
  },
  policies: {
    enable: transition(['disabled'], 'enabled', ['policy']),
    disable: transition(['enabled'], 'disabled', ['policy']),
    run: transition(['enabled'], 'enabled', ['policy']),
    dryRun: transition(['disabled', 'enabled'], 'disabled', ['policy']),
  },
  tasks: {
    complete: transition(['open'], 'completed', [
      'planner',
      'buyer',
      'warehouse',
      'finance',
      'approver',
      'policy',
    ]),
  },
  suppliers: {
    disable: transition(['active'], 'inactive', ['buyer']),
    enable: transition(['inactive'], 'active', ['buyer']),
  },
  materials: {
    disable: transition(['active'], 'inactive', ['buyer']),
    enable: transition(['inactive'], 'active', ['buyer']),
  },
  warehouses: {
    disable: transition(['active'], 'inactive', ['warehouse']),
    enable: transition(['inactive'], 'active', ['warehouse']),
  },
};
const writers: Record<Kind, string[]> = {
  suppliers: ['buyer'],
  materials: ['buyer'],
  warehouses: ['warehouse'],
  plans: ['planner'],
  orders: ['buyer'],
  dispatches: ['supplier'],
  receipts: ['warehouse'],
  invoices: ['supplier', 'finance'],
  settlements: ['finance'],
  payments: ['finance'],
  reconciliations: ['finance'],
  taxScenarios: ['finance'],
  policies: ['policy'],
  runs: [],
  tasks: [],
};
const roleNames: Record<string, [string, string]> = {
  reader: ['运营查看', 'Operations reader'],
  planner: ['计划员', 'Planner'],
  buyer: ['采购员', 'Buyer'],
  warehouse: ['仓储员', 'Warehouse operator'],
  finance: ['财务经办', 'Finance clerk'],
  approver: ['财务审批', 'Finance approver'],
  policy: ['策略管理员', 'Policy administrator'],
  supplier: ['供应商成员', 'Supplier member'],
  admin: ['运营管理员', 'Operations administrator'],
};

import { defineCompositeResource } from '@nocobase/authorization/core';
import { defineDatabasePermission } from '@nocobase/app-plugin-authorization/server';
const allTables = [
  ...Object.values(tables),
  'opsAudit',
  'opsKeys',
  'opsMemberships',
  'opsSettings',
  'opsStock',
];
const actionNames = [
  'view',
  'create',
  'edit',
  'submit',
  'approve',
  'reject',
  'convert',
  'confirm',
  'close',
  'ship',
  'arrive',
  'post',
  'match',
  'record',
  'publish',
  'dispute',
  'revise',
  'calculate',
  'review',
  'enable',
  'disable',
  'run',
  'dryRun',
  'complete',
  'retry',
] as const;
const resources = kinds.map((kind) =>
  defineCompositeResource(`operations.${kind}`, (r) => {
    let resource = r.title({ key: `ops.kinds.${kind}`, ns: 'app' });
    for (const action of actionNames) {
      resource = resource.action(action, (a) => {
        let grant = a.title({ key: `ops.actions.${action}`, ns: 'app' });
        for (const table of allTables) {
          let p = defineDatabasePermission((b) =>
            b.collection(table).read('*'),
          );
          if (action !== 'view' && action !== 'dryRun')
            p = p.create('*').update('*');
          grant = grant.grant(table, p);
        }
        return grant;
      });
    }
    return resource;
  }),
);
function roleActions(role: string, kind: Kind): string[] {
  if (
    role === 'supplier' &&
    ![
      'orders',
      'dispatches',
      'invoices',
      'reconciliations',
      'payments',
    ].includes(kind)
  )
    return [];
  if (role === 'reader') return ['view'];
  const result = ['view'];
  if (role === 'admin' || writers[kind].includes(role))
    result.push('create', 'edit');
  for (const [action, rule] of Object.entries(transitions[kind] ?? {}))
    if (role === 'admin' || rule.roles.includes(role)) result.push(action);
  if (kind === 'runs' && (role === 'policy' || role === 'admin'))
    result.push('retry');
  return result;
}
export default defineSeed({
  name: '202610100001_operations_roles',
  transaction: true,
  async run({ query }) {
    for (const role of Object.keys(roleNames)) {
      const key = `operations-${role}`;
      if (
        await query
          .selectFrom('authorizationPermissionSets')
          .select('id')
          .where('key', '=', key)
          .executeTakeFirst()
      )
        continue;
      const grants: unknown[] = [];
      for (const [i, kind] of kinds.entries()) {
        const actions = roleActions(role, kind);
        if (!actions.length) continue;
        grants.push({
          resource: { type: 'page', id: `operations.${kind}` },
          actions: [{ action: 'access' }],
        });
        grants.push(
          resources[i]
            .reference()
            .grant(
              Object.fromEntries(
                actions.map((action) => [
                  action,
                  Object.fromEntries(allTables.map((t) => [t, 'allRecords'])),
                ]),
              ),
            ),
        );
      }
      grants.push({
        resource: {
          type: 'page',
          id:
            role === 'supplier' ? 'operations.portal' : 'operations.dashboard',
        },
        actions: [{ action: 'access' }],
      });
      if (role === 'admin')
        grants.push({
          resource: { type: 'settings', id: 'operations.admin' },
          actions: [{ action: 'read' }, { action: 'update' }],
        });
      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: key,
          key,
          title: encodeAuthorizationTitle({
            key: `ops.roles.${role}`,
            ns: 'app',
          }),
          grants: JSON.stringify(grants),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .execute();
    }
  },
});
