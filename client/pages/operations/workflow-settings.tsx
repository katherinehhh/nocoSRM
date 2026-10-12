import { useSrmQueryScope } from '#hooks/use-srm-query-scope';
import { useState } from 'react';
import { useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@nocobase/i18n/client';
import { Card, CardHeader, CardTitle, CardContent } from '#components/ui/card';
import { Button } from '#components/ui/button';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Spinner } from '#components/ui/spinner';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '#components/ui/alert-dialog';
import { State } from '../showcase/states.js';
export default function WorkflowSettings() {
  const { t } = useTranslation(),
    api = useApiClient(),
    { can } = useCan({
      resource: { type: 'settings', id: 'workflow' },
      action: 'manage',
    }),
    q = useQuery({
      queryKey: ['srm-workflow-settings', ...useSrmQueryScope()],
      queryFn: () =>
        api.request<{
          data: {
            id: string | null;
            hash: string | null;
            key: string;
            enabled: boolean;
          }[];
        }>({
          path: 'workflows',
          query: { q: 'delivery-approval', pageSize: 100 },
        }),
      enabled: can,
      retry: false,
      refetchOnWindowFocus: false,
    }),
    workflow = !q.error
      ? q.data?.data.find((w) => w.key === 'delivery-approval')
      : undefined,
    [confirm, setConfirm] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState('');
  async function apply() {
    if (!workflow || pending) return;
    setPending(true);
    setError('');
    try {
      await api.request({
        path: `workflows/${workflow.id ?? workflow.hash}/${workflow.enabled ? 'disable' : 'enable'}`,
        method: 'POST',
        json: {},
      });
      await q.refetch();
      setConfirm(false);
    } catch {
      setError(t('srm.error'));
    } finally {
      setPending(false);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('srm.workflowTitle')}</CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {can ? (
          <>
            <State
              loading={q.isPending}
              error={q.error}
              retry={() => void q.refetch()}
            />
            {workflow ? (
              <>
                <p>{t(workflow.enabled ? 'srm.enabled' : 'srm.disabled')}</p>
                <Button
                  className='self-start'
                  variant='outline'
                  disabled={pending || (!workflow.id && !workflow.hash)}
                  onClick={() => {
                    setError('');
                    setConfirm(true);
                  }}
                >
                  {t(
                    workflow.enabled
                      ? 'srm.workflowDisable'
                      : 'srm.workflowEnable',
                  )}
                </Button>
              </>
            ) : (
              !q.isPending && <p>{t('srm.workflowUnavailable')}</p>
            )}
          </>
        ) : (
          <p>{t('srm.workflowForbidden')}</p>
        )}
      </CardContent>
      <AlertDialog
        open={confirm}
        onOpenChange={(v) => {
          if (!pending) setConfirm(v);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t(
                workflow?.enabled
                  ? 'srm.workflowDisable'
                  : 'srm.workflowEnable',
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('srm.workflowConsequence')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <Alert variant='destructive'>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>
              {t('srm.cancel')}
            </AlertDialogCancel>
            <Button
              variant={workflow?.enabled ? 'destructive' : 'default'}
              disabled={pending}
              onClick={() => void apply()}
            >
              {pending && <Spinner />}
              {t(
                workflow?.enabled
                  ? 'srm.workflowDisable'
                  : 'srm.workflowEnable',
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
