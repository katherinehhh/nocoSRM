import { useAuthorizationRevision } from '@nocobase/app-plugin-authorization/client';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useEffect } from 'react';
import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { failure } from '../operations/common.js';
export function useCopy() {
  return useTranslation();
}
export function useShowcase<T>(
  path: string,
  query: Record<string, string | number> = {},
  enabled = true,
  editing = false,
) {
  const api = useApiClient(),
    { session } = useAuthentication(),
    authorizationRevision = useAuthorizationRevision();
  return useQuery({
    queryKey: [
      'showcase',
      path,
      query,
      session?.user.id,
      authorizationRevision,
    ],
    queryFn: ({ signal }) =>
      api.request<T>({ path: `showcase/${path}`, query, signal }),
    retry: false,
    refetchInterval:
      !editing && path.startsWith('deliveryPlans/') ? 2000 : false,
    refetchOnWindowFocus: !editing,
    enabled: enabled && !!session,
  });
}
export function useWrite() {
  const api = useApiClient(),
    cache = useQueryClient(),
    toast = useToaster(),
    { t } = useCopy();
  return useMutation({
    mutationFn: ({
      path,
      json,
      method = 'POST',
    }: {
      path: string;
      json: unknown;
      method?: 'POST' | 'PATCH';
    }) => api.request<{ data: unknown }>({ path, json, method }),
    onSuccess: async (response, request) => {
      const result = response.data as {
        record?: import('../../../shared/showcase.js').Delivery;
        name?: string;
      } | null;
      if (result?.record) {
        for (const [queryKey] of cache.getQueriesData({
          queryKey: ['showcase', `deliveryPlans/${result.record.id}`],
        }))
          cache.setQueryData(queryKey, response);
      }
      const operation = request.path.includes('/analyze')
        ? 'analyze'
        : request.path.includes('/extractPdf')
          ? 'extractDocument'
          : request.path.includes('/prepare')
            ? 'preview'
            : request.path.includes('/commit')
              ? 'apply'
              : request.path.includes('/sync')
                ? 'sync'
                : request.path.includes('/callback')
                  ? 'callback'
                  : request.path.includes('/retry')
                    ? 'retryEvent'
                    : request.path.includes('/resolve')
                      ? 'resolve'
                      : 'saved';
      toast.show({
        type: 'success',
        title: t('showcase.operationComplete', {
          operation: t(`showcase.${operation}`),
          name: result?.record?.name ?? result?.name ?? '',
        }),
      });
      await cache.invalidateQueries({ queryKey: ['showcase'] });
    },
    onError: (e) =>
      toast.show({
        type: 'error',
        title: t(`showcase.errors.${failure(e)}`, {
          defaultValue: t('showcase.error'),
        }),
      }),
  });
}
export interface Overview {
  count: number;
  pending: number;
  completed: number;
  modelReady: boolean;
  modelManage: boolean;
  workflowManage: boolean;
  externalMode: string;
  actions: string[];
  supplierId: string | null;
  pages: Record<string, boolean>;
  presets: { key: string; name: string }[];
}
export interface Ledger {
  financeBridgeEnabled?: boolean;
  finance?: {
    receiptNo: string;
    receiptLineId: string;
    updatedAt: string;
    original: {
      netAmount: number;
      taxAmount: number;
      grossAmount: number;
    } | null;
    id: string;
    state: string;
    error: string;
    stale: boolean;
    result: {
      status: string;
      netAmount: number;
      taxAmount: number;
      grossAmount: number;
    } | null;
    url: string | null;
  }[];
  id: string;
  number: string;
  name: string;
  status: string;
  supplierName: string;
  externalReference: string | null;
  localAmount: number;
  externalAmount: number | null;
  difference: number | null;
  quantity: number | null;
  localQuantity: number;
  externalQuantity: number | null;
  quantityDifference: number | null;
  provenance: string | null;
  recordedAt: string | null;
  legacyEvidence: boolean;
  invoiceAmount: number;
  registeredPayments: number;
  disposition: string;
  version: string;
  updatedAt: string;
  resolution: unknown;
}
export interface DeliveryView {
  record: import('../../../shared/showcase.js').Delivery;
  available: { name: string; allowed: boolean; denied?: unknown }[];
  history: {
    transition: string;
    from: string | null;
    to: string;
    at: string;
    actorId: string;
    version: number;
  }[];
  effectRuns: { effect: string; status: string; attempts: number }[];
  wait: { status: string } | null;
  decisionRequest: { status: string } | null;
}

export function useChildFocus() {
  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const headings = document.querySelectorAll<HTMLElement>(
      '[data-slot="route-child-page"] h1',
    );
    const heading = headings.item(headings.length - 1);
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
    return () =>
      queueMicrotask(() => {
        if (previous?.isConnected && !previous.closest('[inert]'))
          previous.focus({ preventScroll: true });
      });
  }, []);
}
