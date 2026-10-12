import { defineSeed } from '@nocobase/db';
import { defineCompositeResource } from '@nocobase/authorization/core';
import { defineDatabasePermission } from '@nocobase/app-plugin-authorization/server';
const coreKinds = [
  'admission',
  'rfq',
  'quote',
  'inspection',
  'return',
] as const;
type CoreKind = (typeof coreKinds)[number];
const coreActions = [
  'view',
  'create',
  'edit',
  'open',
  'submit',
  'nominate',
  'approve',
  'reject',
  'revise',
  'withdraw',
  'renew',
  'disable',
  'enable',
  'ship',
  'confirm',
  'cancel',
] as const;
type CoreAction = (typeof coreActions)[number];
function coreRoleActions(role: string, kind: CoreKind): CoreAction[] {
  const rules: Record<string, Partial<Record<CoreKind, CoreAction[]>>> = {
    buyer: {
      admission: [
        'view',
        'create',
        'edit',
        'submit',
        'revise',
        'renew',
        'disable',
        'enable',
      ],
      rfq: ['view', 'create', 'edit', 'open', 'nominate', 'revise', 'cancel'],
      quote: ['view'],
      inspection: ['view'],
      return: ['view'],
    },
    approver: Object.fromEntries(
      coreKinds.map((k) => [
        k,
        ['view', ...(k === 'quote' ? [] : ['approve', 'reject'])],
      ]),
    ),
    warehouse: {
      inspection: ['view', 'create', 'edit', 'submit', 'revise'],
      return: ['view', 'create', 'edit', 'submit', 'revise', 'ship', 'cancel'],
    },
    supplier: {
      rfq: ['view'],
      quote: ['view', 'create', 'edit', 'submit', 'withdraw'],
      return: ['view', 'confirm'],
    },
    reader: Object.fromEntries(coreKinds.map((k) => [k, ['view']])),
  };
  return role === 'admin' ? [...coreActions] : (rules[role]?.[kind] ?? []);
}
const coreTables = [
  'srmCoreRecords',
  'srmCoreTransitions',
  'srmCoreEffects',
  'srmCoreKeys',
  'srmCoreInvitations',
];
const related = [
  'opsSuppliers',
  'opsMaterials',
  'opsOrders',
  'opsReceipts',
  'opsWarehouses',
  'opsAudit',
];
const coreResources = coreKinds.map((kind) =>
  defineCompositeResource(`srmCore.${kind}`, (r) => {
    let resource = r.title({ key: `core.kinds.${kind}`, ns: 'app' });
    for (const action of coreActions)
      resource = resource.action(action, (a) => {
        let grant = a.title({ key: `core.actions.${action}`, ns: 'app' });
        for (const table of [...coreTables, ...related]) {
          let permission = defineDatabasePermission((b) =>
            b.collection(table).read('*'),
          );
          if (action !== 'view' && table === 'srmCoreRecords')
            permission = permission.create('*').update('*');
          if (
            ['create', 'edit'].includes(action) &&
            table === 'srmCoreInvitations'
          )
            permission = permission.create('*').delete();
          if (
            action === 'approve' &&
            ((kind === 'admission' && table === 'opsSuppliers') ||
              (kind === 'inspection' && table === 'opsReceipts'))
          )
            permission = permission.update('*');
          if (action === 'approve' && kind === 'rfq' && table === 'opsOrders')
            permission = permission.create('*');
          if (
            ['approve', 'disable', 'enable', 'renew', 'submit'].includes(
              action,
            ) &&
            table === 'opsAudit'
          )
            permission = permission.create('*');
          if (
            ['disable', 'enable', 'renew', 'submit'].includes(action) &&
            kind === 'admission' &&
            table === 'opsSuppliers'
          )
            permission = permission.update('*');
          grant = grant.grant(table, permission);
        }
        return grant;
      });
    return resource;
  }),
);

export default defineSeed({
  name: '202610120005_srm_core_permissions',
  async run({ query }) {
    for (const role of [
      'buyer',
      'approver',
      'warehouse',
      'supplier',
      'reader',
      'admin',
    ]) {
      const key = `operations-${role}`,
        old = await query
          .selectFrom('authorizationPermissionSets')
          .selectAll()
          .where('key', '=', key)
          .executeTakeFirst();
      if (!old) continue;
      const grants = JSON.parse(String(old.grants)) as {
        resource: { type: string; id: string };
        actions: readonly unknown[];
      }[];
      for (const kind of coreKinds) {
        const actions = coreRoleActions(role, kind);
        if (!actions.length) continue;
        const id = `srmCore.${kind}`;
        if (
          !grants.some(
            (g) => g.resource?.id === id && g.resource.type === 'composite',
          )
        ) {
          const resource = coreResources[coreKinds.indexOf(kind)];
          const scopes = Object.fromEntries(
            actions.map((action) => [
              action,
              Object.fromEntries(
                [
                  'srmCoreRecords',
                  'srmCoreTransitions',
                  'srmCoreEffects',
                  'srmCoreKeys',
                  'srmCoreInvitations',
                  'opsSuppliers',
                  'opsMaterials',
                  'opsOrders',
                  'opsReceipts',
                  'opsWarehouses',
                  'opsAudit',
                ].map((t) => [t, 'allRecords']),
              ),
            ]),
          );
          const built = resource.reference().grant(scopes);
          grants.push(built);
        }
        const page = `srmCore.${kind}`;
        if (
          !grants.some(
            (g) => g.resource?.id === page && g.resource.type === 'page',
          )
        )
          grants.push({
            resource: { type: 'page', id: page },
            actions: [{ action: 'access' }],
          });
      }
      if (
        !grants.some(
          (g) =>
            g.resource?.id === 'srmCore.workbench' &&
            g.resource.type === 'page',
        )
      )
        grants.push({
          resource: { type: 'page', id: 'srmCore.workbench' },
          actions: [{ action: 'access' }],
        });
      if (JSON.stringify(grants) !== String(old.grants))
        await query
          .updateTable('authorizationPermissionSets')
          .set({ grants: JSON.stringify(grants), updatedAt: new Date() })
          .where('id', '=', old.id)
          .execute();
    }
  },
});
