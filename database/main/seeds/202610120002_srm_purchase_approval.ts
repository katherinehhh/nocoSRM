import { defineSeed } from '@nocobase/db';
import { defineCompositeResource } from '@nocobase/authorization/core';
import { defineDatabasePermission } from '@nocobase/app-plugin-authorization/server';
// Immutable, incremental grant snapshot. Ordinary approvers must approve purchases without administrator access.
const resource = defineCompositeResource('operations.orders', (r) => {
  let result = r;
  for (const action of ['approve', 'reject']) {
    result = result.action(action, (a) => {
      let grant = a;
      for (const table of ['opsOrders', 'opsAudit', 'opsKeys'])
        grant = grant.grant(
          table,
          defineDatabasePermission((b) =>
            b.collection(table).read('*').create('*').update('*'),
          ),
        );
      return grant;
    });
  }
  return result;
});
const scopes = {
  opsOrders: 'allRecords',
  opsAudit: 'allRecords',
  opsKeys: 'allRecords',
};
export default defineSeed({
  name: '202610120002_srm_purchase_approval',
  transaction: true,
  async run({ query }) {
    const row = await query
      .selectFrom('authorizationPermissionSets')
      .select(['id', 'grants'])
      .where('key', '=', 'operations-approver')
      .executeTakeFirst();
    if (!row)
      throw new Error('Required operations-approver permission set is missing');
    const grants = JSON.parse(String(row.grants)) as {
      resource: { type: string; id: string };
      actions: readonly unknown[];
    }[];
    const extra = resource
      .reference()
      .grant({ approve: scopes, reject: scopes });
    // Keep all prior grants, including unrelated administrator customizations.
    grants.push(extra);
    await query
      .updateTable('authorizationPermissionSets')
      .set({ grants: JSON.stringify(grants), updatedAt: new Date() })
      .where('id', '=', row.id)
      .execute();
  },
});
