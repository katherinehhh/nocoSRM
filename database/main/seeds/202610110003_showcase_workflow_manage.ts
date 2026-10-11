import { defineSeed } from '@nocobase/db';
// Native workflow management is part of the demo administrator/policy responsibilities.
// Preserve every unrelated grant; adding this snapshot twice makes no further change.
export default defineSeed({
  name: '202610110003_showcase_workflow_manage',
  transaction: true,
  async run({ query }) {
    for (const key of ['operations-admin', 'operations-policy']) {
      const row = await query
        .selectFrom('authorizationPermissionSets')
        .select(['id', 'grants'])
        .where('key', '=', key)
        .executeTakeFirst();
      if (!row) continue;
      const grants = JSON.parse(row.grants as string) as {
        resource: { type: string; id: string };
        actions: { action: string }[];
      }[];
      if (
        grants.some(
          (g) => g.resource.type === 'settings' && g.resource.id === 'workflow',
        )
      )
        continue;
      grants.push({
        resource: { type: 'settings', id: 'workflow' },
        actions: [{ action: 'read' }, { action: 'manage' }],
      });
      await query
        .updateTable('authorizationPermissionSets')
        .set({ grants: JSON.stringify(grants) })
        .where('id', '=', row.id)
        .execute();
    }
  },
});
