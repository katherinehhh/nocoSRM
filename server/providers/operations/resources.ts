import { defineCompositeResource } from '@nocobase/authorization/core';
import { defineDatabasePermission } from '@nocobase/app-plugin-authorization/server';
import {
  kinds,
  tables,
  transitions,
  writers,
  type Kind,
} from '../../../shared/operations.js';
export const allTables = [
  ...Object.values(tables),
  'opsAudit',
  'opsKeys',
  'opsMemberships',
  'opsSettings',
  'opsStock',
];
export const actionNames = [
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
export const resources = kinds.map((kind) =>
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
export function roleActions(role: string, kind: Kind): string[] {
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
