import { useAuthorizationRevision } from '@nocobase/app-plugin-authorization/client';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useApiClient, ApiClientError } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useParams } from 'react-router';
import { kinds, type Kind, type Doc } from '../../../shared/operations.js';
export const paths: Record<Kind, string> = {
  suppliers: '/supply/suppliers',
  materials: '/supply/materials',
  warehouses: '/supply/warehouses',
  plans: '/supply/plans',
  orders: '/supply/orders',
  dispatches: '/supply/dispatches',
  receipts: '/supply/receipts',
  invoices: '/finance/invoices',
  settlements: '/finance/settlements',
  payments: '/finance/payments',
  reconciliations: '/finance/reconciliations',
  taxScenarios: '/finance/taxScenarios',
  policies: '/automation/policies',
  runs: '/automation/runs',
  tasks: '/automation/tasks',
};
export function useKind(): Kind {
  const path = useLocation().pathname;
  const resource = useParams().resource;
  if (kinds.includes(resource as Kind)) return resource as Kind;
  return kinds.find((k) => path.split('/').includes(k)) ?? 'orders';
}
export function useCopy() {
  return useTranslation();
}
export function useData<T>(
  path: string,
  query: Record<string, string | number> = {},
  enabled = true,
) {
  const api = useApiClient(),
    { session } = useAuthentication(),
    authorizationRevision = useAuthorizationRevision();
  return useQuery({
    queryKey: [
      'operations',
      path,
      query,
      session?.user.id,
      authorizationRevision,
    ],
    queryFn: ({ signal }) =>
      api.request<T>({ path: `operations/${path}`, query, signal }),
    enabled: enabled && !!session,
    retry: false,
  });
}
export interface Capabilities {
  permissions: Record<Kind, string[]>;
  supplierId: string | null;
  admin: boolean;
}
export function useCapabilities() {
  return useData<{ data: Capabilities }>('capabilities');
}
export function failure(error: unknown): string {
  return error instanceof ApiClientError
    ? (error.reason ?? String(error.status))
    : 'NETWORK_ERROR';
}
export function money(value: number, locale = 'zh-CN') {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'CNY',
  }).format(value / 100);
}
export type Lookups = Partial<Record<Kind, Doc[]>>;
