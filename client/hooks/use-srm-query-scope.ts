import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useAuthorizationRevision } from '@nocobase/app-plugin-authorization/client';
export function useSrmQueryScope() {
  const { session } = useAuthentication();
  const revision = useAuthorizationRevision();
  return [session?.user.id, revision] as const;
}
