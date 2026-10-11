import { defineCompositeResource } from '@nocobase/authorization/core';
import { defineDatabasePermission } from '@nocobase/app-plugin-authorization/server';
export const showcaseTables = [
  'showcaseDeliveries',
  'showcaseExternal',
  'showcaseEvents',
  'showcaseResolutions',
  'showcaseTemplates',
  'showcaseKeys',
  'showcaseProposals',
  'lifecycleTransitions',
  'lifecycleEffectRuns',
  'opsOrders',
  'opsSuppliers',
  'opsReceipts',
  'opsInvoices',
  'opsPayments',
  'opsSettlements',
  'opsMemberships',
];
export const showcaseActions = [
  'view',
  'create',
  'edit',
  'submit',
  'approve',
  'reject',
  'ship',
  'receive',
  'rework',
  'print',
  'resolve',
  'sync',
  'configure',
  'assistant',
] as const;
export const showcaseResource = defineCompositeResource(
  'showcase.delivery',
  (r) => {
    let out = r.title('Customer demonstration');
    for (const action of showcaseActions)
      out = out.action(action, (a) => {
        let g = a.title(action);
        for (const table of showcaseTables) {
          let p = defineDatabasePermission((b) =>
            b.collection(table).read('*'),
          );
          if (
            table.startsWith('showcase') &&
            action !== 'view' &&
            action !== 'print'
          )
            p = p.create('*').update('*');
          g = g.grant(table, p);
        }
        return g;
      });
    return out;
  },
);
