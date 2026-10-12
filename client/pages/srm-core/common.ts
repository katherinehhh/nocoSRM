import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiClient, useToaster, ApiClientError } from '@nocobase/app-client';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useAuthorizationRevision } from '@nocobase/app-plugin-authorization/client';
import { useLocation, useParams } from 'react-router';
import { useTranslation } from '@nocobase/i18n/client';
import {
  corePaths,
  coreKinds,
  type CoreKind,
  type CoreView,
} from '../../../shared/srm-core.js';
import type { Doc } from '../../../shared/operations.js';
export { money } from '../operations/common.js';
export interface CoreLookups {
  suppliers: Doc[];
  materials: Doc[];
  rfqs: CoreView[];
  receipts: Doc[];
  inspections: CoreView[];
  capped: boolean;
}
export interface DetailData {
  returnBalances?: Record<string, { reserved: number; available: number }>;
  record: CoreView;
  available: string[];
  history: {
    transition: string;
    at: string;
    actorId: string;
    version: number;
  }[];
  quotes: CoreView[];
  source: Doc | CoreView | null;
}
export function useCoreKind(): CoreKind {
  const { kind } = useParams(),
    path = useLocation().pathname;
  return coreKinds.includes(kind as CoreKind)
    ? (kind as CoreKind)
    : (coreKinds.find(
        (k) => path.startsWith(corePaths[k]) || path.split('/').includes(k),
      ) ?? 'rfq');
}
export function useCore<T>(
  path: string,
  query: Record<string, string | number> = {},
  enabled = true,
) {
  const api = useApiClient(),
    { session } = useAuthentication(),
    revision = useAuthorizationRevision();
  return useQuery({
    queryKey: ['srmCore', path, query, session?.user.id, revision],
    queryFn: ({ signal }) =>
      api.request<T>({ path: `srmCore/${path}`, query, signal }),
    enabled: enabled && !!session,
    retry: false,
  });
}
export function useCoreWrite() {
  const api = useApiClient(),
    cache = useQueryClient(),
    toast = useToaster(),
    { t } = useTranslation();
  return async (path: string, body: object, name: string) => {
    const result = await api.request<{ data: CoreView }>({
      path: `srmCore/${path}`,
      method: 'POST',
      json: body,
    });
    for (const [key] of cache.getQueriesData({
      queryKey: ['srmCore', `${result.data.kind}/${result.data.id}`],
    }))
      cache.setQueryData(key, (old: unknown) => ({
        data: {
          ...((old as { data?: object })?.data ?? {}),
          record: result.data,
        },
      }));
    await Promise.all(
      ['srmCore', 'operations', 'showcase'].map((prefix) =>
        cache.invalidateQueries({ queryKey: [prefix] }),
      ),
    );
    toast.show({
      type: 'success',
      title: t('core.saved', {
        action: t(`core.actions.${name}`),
        name: result.data.name,
      }),
    });
    return result.data;
  };
}
export function coreError(error: unknown) {
  return error instanceof ApiClientError
    ? (error.reason ?? String(error.status))
    : 'NETWORK_ERROR';
}
