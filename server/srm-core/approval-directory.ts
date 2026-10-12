import type { ApprovalDirectory } from '@nocobase/app-plugin-approval/server';
import type { DatabaseConnection } from '@nocobase/db';
import type { ServiceResolver } from '@nocobase/service-provider';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication';
import { userRoleScopeRegistryToken } from '@nocobase/app-plugin-users/server/tokens';
import type { BusinessMembership } from '../services/business-membership.js';

// Materialized before the native synchronous directory callbacks. Each request
// reloads account status, business membership and native qualification.
export async function awardDirectory(
  c: DatabaseConnection,
  services: ServiceResolver,
  org: string,
) {
  const members = await c
    .repository<BusinessMembership>('opsMemberships')
    .findMany({ filter: { organizationId: org, enabled: true }, limit: 10001 });
  if (members.length > 10000)
    throw new Error('Directory exceeds supported size');
  const active = new Map<string, string>();
  const users = services
      .resolve(userAdministrationServiceToken)
      .withConnection(c),
    scope = services.resolve(userRoleScopeRegistryToken).get('app');
  for (const m of members) {
    if (m.supplierId) continue;
    const user = await users.get(m.userId),
      roles = scope ? await scope.get(m.userId, c) : [];
    if (
      user?.kind === 'person' &&
      !user.disabledAt &&
      (typeof roles === 'string' ? [roles] : roles).some((r) =>
        ['operations-approver', 'operations-admin'].includes(r),
      )
    )
      active.set(user.id, user.name);
  }
  const directory: ApprovalDirectory = {
    isActive: (id) => active.has(id),
    managerOf: () => undefined,
    hasRole: (id, role) => role === 'operations-approver' && active.has(id),
  };
  return { directory, people: [...active].map(([id, name]) => ({ id, name })) };
}
