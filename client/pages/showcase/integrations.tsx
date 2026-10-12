import { useSearchParams } from 'react-router';
import { Button } from '#components/ui/button';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Card, CardHeader, CardTitle, CardContent } from '#components/ui/card';
import { DataTable } from '#components/data-table';
import { State, Refresh } from './states.js';
import { useCopy, useShowcase } from './common.js';
import { Badge } from '#components/ui/badge';
export default function Integrations() {
  const [params, setParams] = useSearchParams(),
    page = Math.max(1, Number(params.get('page')) || 1),
    direction = params.get('direction') === 'asc' ? 'asc' : 'desc',
    { t, i18n } = useCopy(),
    status = useShowcase<{
      data: { webhookReady: boolean; callbackPath: string };
    }>('integrations/status'),
    events = useShowcase<{
      data: {
        id: string;
        source: string;
        direction: string;
        state: string;
        updatedAt: string;
      }[];
      meta: { total: number };
    }>('integrations/events', { page, sort: 'updatedAt', direction });
  return (
    <PageContainer>
      <PageHeader
        title={t('showcase.integrations')}
        description={t('showcase.signatureNotice')}
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
      {status.data && (
        <Card>
          <CardHeader>
            <CardTitle>{t('showcase.integrations')}</CardTitle>
          </CardHeader>
          <CardContent className='flex flex-col gap-3'>
            <p>
              {t(
                status.data.data.webhookReady
                  ? 'showcase.connectorReady'
                  : 'showcase.connectorUnconfigured',
              )}
            </p>
            <p className='break-all'>{status.data.data.callbackPath}</p>
            <p className='text-sm text-muted-foreground'>
              {t('srm.outboundNotice')}
            </p>
            <p className='text-sm text-muted-foreground'>
              {t('srm.noEvidence')}
            </p>
          </CardContent>
        </Card>
      )}
      <State
        loading={events.isPending}
        error={events.error}
        retry={() => void events.refetch()}
        empty={events.data?.data.length === 0}
      />
      {!!events.data?.data.length && (
        <>
          <DataTable
            data={events.data.data}
            sorting={[{ id: 'updatedAt', desc: direction === 'desc' }]}
            onSort={(sorting) => {
              const next = new URLSearchParams(params);
              next.set('direction', sorting[0]?.desc ? 'desc' : 'asc');
              next.set('page', '1');
              setParams(next, { replace: true });
            }}
            columns={[
              {
                accessorKey: 'id',
                header: t('showcase.eventIdentity'),
                enableSorting: false,
              },
              {
                accessorKey: 'source',
                header: t('showcase.externalReference'),
                enableSorting: false,
                cell: ({ getValue }) =>
                  ['fixture', 'localExternal'].includes(String(getValue()))
                    ? t('srm.legacy')
                    : String(getValue()) === 'webhook'
                      ? t('srm.webhook')
                      : String(getValue()),
              },
              {
                accessorKey: 'direction',
                header: t('showcase.direction'),
                enableSorting: false,
                cell: ({ getValue }) => t(`showcase.${String(getValue())}`),
              },
              {
                accessorKey: 'state',
                header: t('ops.fields.status'),
                enableSorting: false,
                cell: ({ getValue }) => (
                  <Badge variant='secondary'>
                    {t(`showcase.${String(getValue())}`, {
                      defaultValue: String(getValue()),
                    })}
                  </Badge>
                ),
              },
              {
                accessorKey: 'updatedAt',
                header: t('srm.updatedAt'),
                enableSorting: true,
                cell: ({ getValue }) =>
                  new Date(String(getValue())).toLocaleString(i18n.language),
              },
            ]}
          />
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <p>{t('srm.total', { count: events.data.meta.total })}</p>
            <div className='flex gap-2'>
              <Button
                variant='outline'
                disabled={page <= 1 || events.isFetching}
                onClick={() => {
                  const next = new URLSearchParams(params);
                  next.set('page', String(page - 1));
                  setParams(next);
                }}
              >
                {t('srm.previous')}
              </Button>
              <Button
                variant='outline'
                disabled={
                  page * 20 >= events.data.meta.total || events.isFetching
                }
                onClick={() => {
                  const next = new URLSearchParams(params);
                  next.set('page', String(page + 1));
                  setParams(next);
                }}
              >
                {t('srm.next')}
              </Button>
            </div>
          </div>
        </>
      )}
    </PageContainer>
  );
}
