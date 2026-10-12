import type { DatabaseManager } from '@nocobase/db';
import type { ServiceResolver } from '@nocobase/service-provider';
import { userRoleScopeRegistryToken } from '@nocobase/app-plugin-users/server/tokens';
export interface BusinessMembership {
  id: string;
  userId: string;
  organizationId: string;
  supplierId: string | null;
  enabled: boolean;
  version: number;
}
// Roles are native; this service only enforces the app's business visibility boundary.
export async function businessMembership(
  db: DatabaseManager,
  services: ServiceResolver,
  userId: string,
  unrestricted: boolean,
) {
  const member = await db
    .repository<BusinessMembership>('opsMemberships')
    .findOne({ filter: { userId } });
  if (unrestricted)
    return member?.enabled
      ? member
      : { organizationId: 'main', supplierId: null };
  if (!member?.enabled) return null;
  const scope = services.resolve(userRoleScopeRegistryToken).get('app');
  const roles = scope ? await scope.get(userId, db.connection()) : [];
  if (
    (Array.isArray(roles) ? roles : [roles]).includes('operations-supplier') &&
    !member.supplierId
  )
    return null;
  return member;
}
