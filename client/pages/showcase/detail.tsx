import { useState } from 'react';
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
import { Link, Outlet, useParams, useLocation } from 'react-router';
import { resolveAppUrl } from '@nocobase/app-client';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { RouteChildPage } from '#components/route-child-page';
import { BackButton } from '#components/back-button';
import { Button } from '#components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '#components/ui/card';
import { DataTable } from '#components/data-table';
import { State, Status } from './states.js';
import { money } from '../operations/common.js';
import type { DeliveryLine } from '../../../shared/showcase.js';
import {
  useCopy,
  useChildFocus,
  useShowcase,
  useWrite,
  type DeliveryView,
  type Overview,
} from './common.js';
export default function Detail() {
  useChildFocus();
  const { id } = useParams(),
    location = useLocation(),
    { t, i18n } = useCopy(),
    query = useShowcase<{ data: DeliveryView }>(`deliveryPlans/${id}`),
    caps = useShowcase<{ data: Overview }>('overview'),
    write = useWrite(),
    [disablePolicy, setDisablePolicy] = useState(false);
  const data = query.data?.data,
    r = data?.record;
  return (
    <>
      <RouteChildPage>
        <PageContainer>
          <BackButton />
          <PageHeader
            title={r?.name ?? t('showcase.deliveryPlans')}
            actions={
              <>
                <p className='text-sm text-muted-foreground'>
                  {t('srm.receiptsNotice')}
                </p>
                <p className='text-sm text-muted-foreground'>
                  {t('srm.outboundNotice')}
                </p>
                {r && caps.data?.data.actions.includes('print') && (
                  <Button
                    nativeButton={false}
                    variant='outline'
                    render={
                      <a
                        href={resolveAppUrl(
                          `/api/showcase/deliveryPlans/${r.id}/pdf`,
                        )}
                        target='_blank'
                        rel='noreferrer'
                      />
                    }
                  >
                    {t('showcase.print')}
                  </Button>
                )}
                {r?.status === 'draft' &&
                  caps.data?.data.actions.includes('edit') && (
                    <Button
                      nativeButton={false}
                      render={
                        <Link
                          to={{ pathname: 'edit', search: location.search }}
                        />
                      }
                    >
                      {t('ops.edit')}
                    </Button>
                  )}
                {r && data && (
                  <div className='flex flex-wrap gap-3'>
                    {data.available.map((action) => (
                      <Button
                        key={action.name}
                        variant='outline'
                        title={
                          !action.allowed
                            ? t('showcase.approvalNotice')
                            : undefined
                        }
                        disabled={!action.allowed || write.isPending}
                        onClick={() =>
                          write.mutate({
                            path: `showcase/deliveryPlans/${r.id}/fire`,
                            json: {
                              transition: action.name,
                              expectVersion: r.lifecycleVersion,
                              requestId: crypto.randomUUID(),
                            },
                          })
                        }
                      >
                        {write.isPending && <Spinner />}
                        {r.status === 'pending' && action.name === 'submit'
                          ? t('srm.retryWorkflow')
                          : t(`ops.actions.${action.name}`, {
                              defaultValue: t(
                                `showcase.actionsCopy.${action.name}`,
                              ),
                            })}
                      </Button>
                    ))}
                    {r.status === 'draft' &&
                      caps.data?.data.actions.includes('configure') && (
                        <Button
                          variant='outline'
                          disabled={write.isPending}
                          onClick={() => {
                            if (r.autoApprove) {
                              setDisablePolicy(true);
                              return;
                            }
                            write.mutate({
                              path: `showcase/deliveryPlans/${r.id}/policy`,
                              json: {
                                enabled: !r.autoApprove,
                                expectVersion: r.lifecycleVersion,
                              },
                            });
                          }}
                        >
                          {t(
                            r.autoApprove
                              ? 'showcase.disablePolicy'
                              : 'showcase.enablePolicy',
                          )}
                        </Button>
                      )}
                  </div>
                )}
              </>
            }
          />
          <State
            loading={query.isPending}
            error={query.error}
            retry={() => void query.refetch()}
          />
          {r && data && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>
                    <Status value={r.status} />
                  </CardTitle>
                  <CardDescription>
                    {t('showcase.stateDescription')}
                  </CardDescription>
                </CardHeader>
                <CardContent className='grid gap-4 sm:grid-cols-2'>
                  {[
                    ['number', r.number],
                    [
                      'businessDate',
                      new Date(`${r.businessDate}T12:00:00`).toLocaleDateString(
                        i18n.language,
                      ),
                    ],
                    ['region', r.region],
                    ['supplier', r.supplierName ?? r.supplierId],
                    ['labelCount', r.labelCount],
                    ['orderId', String(r.orderNumber ?? r.orderId)],
                    ['amount', money(r.amount, i18n.language)],
                    ['version', r.lifecycleVersion],
                    ['workflow', r.workflowRunId ?? '—'],
                    ['decision', data.decisionRequest?.status ?? '—'],
                    ['notes', r.notes || '—'],
                  ].map(([key, value]) => (
                    <div key={key} className='min-w-0'>
                      <p className='text-sm text-muted-foreground'>
                        {t(`showcase.fields.${key}`)}
                      </p>
                      <p className='mt-1 break-words whitespace-pre-wrap'>
                        {value}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>{t('showcase.lines')}</CardTitle>
                  <CardDescription>
                    {t('showcase.linesDescription')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <DataTable
                    sorting={[]}
                    onSort={() => {}}
                    data={JSON.parse(r.lines) as DeliveryLine[]}
                    columns={(
                      [
                        'sku',
                        'name',
                        'fnsku',
                        'allocation',
                        'unitsPerBox',
                      ] as const
                    ).map((key) => ({
                      accessorKey: key,
                      header: t(`showcase.fields.${key}`),
                      enableSorting: false,
                    }))}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>{t('showcase.actions')}</CardTitle>
                  <CardDescription>
                    {t('showcase.approvalNotice')}
                  </CardDescription>
                </CardHeader>
                <CardContent className='flex flex-wrap gap-3'>
                  {r.workflowRunId && (
                    <p className='w-full text-sm text-muted-foreground'>
                      {t('showcase.waitStatus', {
                        status: data.wait?.status ?? '—',
                      })}
                    </p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>{t('showcase.history')}</CardTitle>
                  <CardDescription>
                    {t('showcase.historyDescription')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <DataTable
                    sorting={[]}
                    onSort={() => {}}
                    data={data.history}
                    columns={[
                      {
                        accessorKey: 'transition',
                        cell: ({ getValue }) =>
                          t(`showcase.actionsCopy.${String(getValue())}`, {
                            defaultValue: t('ops.create'),
                          }),
                        header: t('showcase.actions'),
                        enableSorting: false,
                      },
                      {
                        accessorKey: 'to',
                        cell: ({ getValue }) => (
                          <Status value={String(getValue())} />
                        ),
                        header: t('ops.fields.status'),
                        enableSorting: false,
                      },
                      {
                        accessorKey: 'actorId',
                        header: t('showcase.actor'),
                        enableSorting: false,
                      },
                      {
                        accessorKey: 'at',
                        header: t('showcase.updatedAt'),
                        enableSorting: false,
                        cell: ({ getValue }) =>
                          new Date(String(getValue())).toLocaleString(
                            i18n.language,
                          ),
                      },
                    ]}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>{t('showcase.effects')}</CardTitle>
                  <CardDescription>
                    {t('showcase.workflowNotice')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <DataTable
                    sorting={[]}
                    onSort={() => {}}
                    data={data.effectRuns ?? []}
                    columns={[
                      {
                        accessorKey: 'effect',
                        header: t('showcase.effectName'),
                        enableSorting: false,
                      },
                      {
                        accessorKey: 'status',
                        header: t('ops.fields.status'),
                        enableSorting: false,
                        cell: ({ getValue }) => (
                          <Status value={String(getValue())} />
                        ),
                      },
                      {
                        accessorKey: 'attempts',
                        header: t('showcase.attempts'),
                        enableSorting: false,
                      },
                    ]}
                  />
                </CardContent>
              </Card>
            </>
          )}
          <AlertDialog open={disablePolicy} onOpenChange={setDisablePolicy}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t('showcase.disablePolicyTitle', { name: r?.name })}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t('showcase.disablePolicyNotice')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={write.isPending}>
                  {t('ops.cancel')}
                </AlertDialogCancel>
                <Button
                  variant='destructive'
                  disabled={write.isPending || !r}
                  onClick={() =>
                    r &&
                    write.mutate(
                      {
                        path: `showcase/deliveryPlans/${r.id}/policy`,
                        json: {
                          enabled: false,
                          expectVersion: r.lifecycleVersion,
                        },
                      },
                      { onSuccess: () => setDisablePolicy(false) },
                    )
                  }
                >
                  {write.isPending && <Spinner />}
                  {t('showcase.disablePolicy')}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </PageContainer>
      </RouteChildPage>
      <Outlet />
    </>
  );
}
