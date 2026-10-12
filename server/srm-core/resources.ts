import { defineCompositeResource } from '@nocobase/authorization/core';
import { defineDatabasePermission } from '@nocobase/app-plugin-authorization/server';
import { coreKinds, coreActions } from '../../shared/srm-core.js';
export const coreTables = [
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
export const coreResources = coreKinds.map((kind) =>
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
