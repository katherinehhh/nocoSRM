import { Spinner } from '#components/ui/spinner';
import { Outlet, useSearchParams } from 'react-router';
import { useState } from 'react';
import { Input } from '#components/ui/input';
import { NativeSelect, NativeSelectOption } from '#components/ui/native-select';
import { StatusBadge } from '#components/status-badge';
import { resolveAppUrl } from '@nocobase/app-client';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Button } from '#components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '#components/ui/card';
import { DataTable } from '#components/data-table';
import { State, Refresh } from './states.js';
import { useCopy, useShowcase, useWrite, type Overview } from './common.js';
export default function Integrations() {
  const [params, setParams] = useSearchParams(),
    [search, setSearch] = useState(params.get('q') ?? '');
  const page = Number(params.get('page') ?? 1),
    sort = params.get('sort') ?? 'updatedAt',
    direction = params.get('direction') ?? 'desc';
  function change(values: Record<string, string>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next, { replace: true });
  }
  const { t, i18n } = useCopy(),
    write = useWrite(),
    caps = useShowcase<{ data: Overview }>('overview'),
    status = useShowcase<{
      data: {
        mode: string;
        webhookReady: boolean;
        callbackPath: string;
        signature: string;
        maxSkewSeconds: number;
      };
    }>('integrations/status'),
    events = useShowcase<{
      data: {
        id: string;
        number: string;
        source: string;
        direction: string;
        state: string;
        attempts: number;
        updatedAt: string;
      }[];
      meta: { total: number };
    }>('integrations/events', {
      q: params.get('q') ?? '',
      status: params.get('status') ?? '',
      eventDirection: params.get('eventDirection') ?? '',
      source: params.get('source') ?? '',
      page,
      sort,
      direction,
    });
  return (
    <>
      <PageContainer>
        <PageHeader
          title={t('showcase.integrations')}
          description={t('showcase.integrationDescription')}
          actions={
            <Refresh
              pending={status.isFetching || events.isFetching}
              onClick={() => {
                void status.refetch();
                void events.refetch();
              }}
            />
          }
        />
        <State
          loading={status.isPending}
          error={status.error}
          retry={() => void status.refetch()}
        />
        <Card>
          <CardHeader>
            <CardTitle>
              {write.isPending && <Spinner />}
              {t('showcase.sync')}
            </CardTitle>
            <CardDescription>{t('showcase.localNotice')}</CardDescription>
          </CardHeader>
          <CardContent className='flex flex-col gap-4'>
            <p className='text-sm'>{t('showcase.signatureNotice')}</p>
            <p className='text-sm text-muted-foreground'>
              {t('showcase.syncLimit')}
            </p>
            {caps.data?.data.actions.includes('sync') && (
              <div className='flex flex-wrap gap-3'>
                <Button
                  disabled={write.isPending || !status.data}
                  onClick={() =>
                    write.mutate({
                      path: 'showcase/integrations/demo/sync',
                      json: { requestId: crypto.randomUUID() },
                    })
                  }
                >
                  {write.isPending && <Spinner />}
                  {t('showcase.sync')}
                </Button>
                <Button
                  variant='outline'
                  disabled={write.isPending || !status.data}
                  onClick={() =>
                    write.mutate({
                      path: 'showcase/integrations/demo/callback',
                      json: { requestId: crypto.randomUUID() },
                    })
                  }
                >
                  {write.isPending && <Spinner />}
                  {t('showcase.callback')}
                </Button>
                <Button
                  variant='outline'
                  disabled={write.isPending || !status.data}
                  onClick={() =>
                    write.mutate({
                      path: 'showcase/integrations/demo/failure',
                      json: { requestId: crypto.randomUUID() },
                    })
                  }
                >
                  {write.isPending && <Spinner />}
                  {t('showcase.failDelivery')}
                </Button>
              </div>
            )}
            <p className='text-sm text-muted-foreground'>
              {t(
                status.data?.data.webhookReady
                  ? 'showcase.connectorReady'
                  : 'showcase.connectorUnconfigured',
              )}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('showcase.events')}</CardTitle>
            <CardDescription>{t('showcase.eventsDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className='mb-4 flex flex-wrap gap-3'
              onSubmit={(e) => {
                e.preventDefault();
                change({ q: search, page: '1' });
              }}
            >
              <Input
                className='min-w-44 flex-1'
                aria-label={t('ops.search')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('showcase.eventIdentity')}
              />
              <Button type='submit' variant='outline'>
                {t('ops.searchButton')}
              </Button>
              <NativeSelect
                aria-label={t('showcase.direction')}
                value={params.get('eventDirection') ?? ''}
                onChange={(e) =>
                  change({ eventDirection: e.target.value, page: '1' })
                }
              >
                <NativeSelectOption value=''>
                  {t('showcase.allDirections')}
                </NativeSelectOption>
                {['inbound', 'outbound'].map((value) => (
                  <NativeSelectOption value={value} key={value}>
                    {t(`showcase.${value}`)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <NativeSelect
                aria-label={t('ops.fields.status')}
                value={params.get('status') ?? ''}
                onChange={(e) => change({ status: e.target.value, page: '1' })}
              >
                <NativeSelectOption value=''>
                  {t('ops.allStatus')}
                </NativeSelectOption>
                {['succeeded', 'failed'].map((value) => (
                  <NativeSelectOption key={value} value={value}>
                    {t(`showcase.${value}`)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <Button
                type='button'
                variant='ghost'
                onClick={() => {
                  setSearch('');
                  setParams({});
                }}
              >
                {t('ops.clear')}
              </Button>
            </form>
            <State
              loading={events.isPending}
              error={events.error}
              empty={events.data?.data.length === 0}
              retry={() => void events.refetch()}
            />
            {!!events.data?.data.length && (
              <DataTable
                sorting={[{ id: sort, desc: direction === 'desc' }]}
                onSort={(next) =>
                  change({
                    sort: next[0]?.id ?? 'updatedAt',
                    direction: next[0]?.desc ? 'desc' : 'asc',
                    page: '1',
                  })
                }
                data={events.data.data}
                columns={[
                  {
                    accessorKey: 'number',
                    header: t('showcase.eventIdentity'),
                    enableSorting: false,
                  },
                  {
                    accessorKey: 'source',
                    header: t('showcase.eventSource'),
                    enableSorting: false,
                  },
                  {
                    accessorKey: 'direction',
                    cell: ({ getValue }) => (
                      <StatusBadge
                        tone={getValue() === 'failed' ? 'warning' : 'info'}
                      >
                        {t(`showcase.${String(getValue())}`)}
                      </StatusBadge>
                    ),
                    header: t('showcase.direction'),
                    enableSorting: false,
                  },
                  {
                    accessorKey: 'state',
                    cell: ({ getValue }) => (
                      <StatusBadge
                        tone={getValue() === 'failed' ? 'warning' : 'info'}
                      >
                        {t(`showcase.${String(getValue())}`)}
                      </StatusBadge>
                    ),
                    header: t('ops.fields.status'),
                    enableSorting: false,
                  },
                  {
                    accessorKey: 'attempts',
                    header: t('showcase.attempts'),
                    cell: ({ getValue }) =>
                      Number(getValue()).toLocaleString(i18n.language),
                  },
                  {
                    accessorKey: 'updatedAt',
                    cell: ({ getValue }) =>
                      new Date(String(getValue())).toLocaleString(
                        i18n.language,
                      ),
                    header: t('showcase.updatedAt'),
                  },
                  {
                    id: 'retry',
                    header: t('showcase.actions'),
                    cell: ({ row }) =>
                      row.original.state === 'failed' &&
                      caps.data?.data.actions.includes('sync') ? (
                        <Button
                          variant='outline'
                          disabled={write.isPending}
                          onClick={() =>
                            write.mutate({
                              path: `showcase/integrations/events/${row.original.id}/retry`,
                              json: { requestId: crypto.randomUUID() },
                            })
                          }
                        >
                          {t('ops.retry')}
                        </Button>
                      ) : null,
                  },
                ]}
              />
            )}
            {events.data && (
              <div className='mt-4 flex items-center justify-between gap-3'>
                <p className='text-sm text-muted-foreground'>
                  {t('ops.total', { count: events.data.meta.total })}
                </p>
                <div className='flex items-center gap-3'>
                  <Button
                    variant='outline'
                    disabled={page === 1}
                    onClick={() => change({ page: String(page - 1) })}
                  >
                    {t('ops.previous')}
                  </Button>
                  <span>{page}</span>
                  <Button
                    variant='outline'
                    disabled={page * 20 >= events.data.meta.total}
                    onClick={() => change({ page: String(page + 1) })}
                  >
                    {t('ops.next')}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('showcase.embeds')}</CardTitle>
            <CardDescription>{t('showcase.embedDescription')}</CardDescription>
          </CardHeader>
          <CardContent className='flex flex-col gap-4'>
            <Button
              nativeButton={false}
              variant='outline'
              render={
                <a
                  href={resolveAppUrl(`/external-demo?lang=${i18n.language}`)}
                  target='_blank'
                  rel='noreferrer'
                />
              }
            >
              {t('showcase.externalHost')}
            </Button>
            <iframe
              title={t('showcase.externalPage')}
              sandbox='allow-same-origin'
              className='h-80 w-full rounded-lg border'
              src={resolveAppUrl(
                `/external-demo?view=external&lang=${i18n.language}`,
              )}
            />
          </CardContent>
        </Card>
      </PageContainer>
      <Outlet />
    </>
  );
}
