import { Skeleton } from '#components/ui/skeleton';
import { Link, Outlet } from 'react-router';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Card, CardHeader, CardTitle, CardContent } from '#components/ui/card';
import { Button } from '#components/ui/button';
import { FinanceAppLink } from '#components/finance-app-link';
import { State, Refresh, Status } from '../showcase/states.js';
import { useShowcase, type Overview } from '../showcase/common.js';
import { useData } from '../operations/common.js';
import type { Doc, Kind } from '../../../shared/operations.js';
function Shortcut({
  path,
  title,
  page,
}: {
  path: string;
  title: string;
  page: string;
}) {
  const { t } = useTranslation(),
    { can } = useCan({
      resource: { type: 'page', id: page },
      action: 'access',
    });
  return can ? (
    <Button nativeButton={false} variant='outline' render={<Link to={path} />}>
      {t(title)}
    </Button>
  ) : null;
}
export default function Workspace() {
  const { t, i18n } = useTranslation(),
    dashboard = useCan({
      resource: { type: 'page', id: 'operations.dashboard' },
      action: 'access',
    }),
    deliveries = useCan({
      resource: { type: 'composite', id: 'showcase.delivery' },
      action: 'view',
    }),
    query = useData<{
      data: {
        cards: { kind: Kind; count: number }[];
        availability?: { tasks: boolean; orders: boolean; materials: boolean };
        tasks: Doc[];
        recent: Doc[];
        stock: { name: string; stock: number; threshold: number }[];
      };
    }>('dashboard', {}, dashboard.can),
    overview = useShowcase<{ data: Overview }>('overview', {}, deliveries.can);
  const pending =
    dashboard.isPending ||
    deliveries.isPending ||
    (dashboard.can && query.isPending) ||
    (deliveries.can && overview.isPending);
  return (
    <>
      <PageContainer>
        <PageHeader
          title={t('srm.home')}
          description={t('srm.homeDescription')}
          actions={
            <Refresh
              pending={query.isFetching || overview.isFetching}
              onClick={() => {
                if (dashboard.can) void query.refetch();
                if (deliveries.can) void overview.refetch();
              }}
            />
          }
        />
        <State
          loading={false}
          error={query.error || overview.error}
          retry={() => {
            if (dashboard.can) void query.refetch();
            if (deliveries.can) void overview.refetch();
          }}
        />
        {!pending && !dashboard.can && !deliveries.can && (
          <p>{t('srm.noAccess')}</p>
        )}
        {pending && (
          <div
            className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'
            aria-busy='true'
            aria-label={t('srm.home')}
          >
            {[0, 1, 2, 3].map((n) => (
              <Card key={n}>
                <CardHeader>
                  <Skeleton className='h-4 w-28' />
                </CardHeader>
                <CardContent>
                  <Skeleton className='h-9 w-20' />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
          {query.data?.data.cards.map((c) => (
            <Card key={c.kind}>
              <CardHeader>
                <CardTitle>{t(`ops.kinds.${c.kind}`)}</CardTitle>
              </CardHeader>
              <CardContent className='text-3xl tabular-nums'>
                {new Intl.NumberFormat(i18n.language).format(c.count)}
              </CardContent>
            </Card>
          ))}
          {overview.data && (
            <Card>
              <CardHeader>
                <CardTitle>{t('showcase.metrics.pending')}</CardTitle>
              </CardHeader>
              <CardContent className='text-3xl tabular-nums'>
                {new Intl.NumberFormat(i18n.language).format(
                  overview.data.data.pending,
                )}
              </CardContent>
            </Card>
          )}
        </div>
        {query.data && (
          <div className='grid gap-4 lg:grid-cols-2'>
            <Card>
              <CardHeader>
                <CardTitle>{t('ops.priority')}</CardTitle>
              </CardHeader>
              <CardContent className='flex flex-col gap-3'>
                {query.data.data.tasks.slice(0, 6).map((r) => (
                  <Link
                    key={r.id}
                    className='text-primary hover:underline'
                    to={`records/tasks/${r.id}`}
                  >
                    {r.name} · <Status value={r.status} />
                  </Link>
                ))}
                {query.data.data.availability?.tasks === false ? (
                  <p>{t('srm.noAccess')}</p>
                ) : (
                  !query.data.data.tasks.length && <p>{t('ops.noTasks')}</p>
                )}
                <Shortcut
                  path='/srm-workbench'
                  title='core.workbench'
                  page='srmCore.workbench'
                />
                <Shortcut
                  path='/automation/tasks'
                  title='srm.viewAll'
                  page='operations.tasks'
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t('ops.recentOrders')}</CardTitle>
              </CardHeader>
              <CardContent className='flex flex-col gap-3'>
                {query.data.data.recent.slice(0, 6).map((r) => (
                  <Link
                    key={r.id}
                    className='text-primary hover:underline'
                    to={`records/orders/${r.id}`}
                  >
                    {r.number} · {r.name} · <Status value={r.status} />
                  </Link>
                ))}
                {query.data.data.availability?.orders === false ? (
                  <p>{t('srm.noAccess')}</p>
                ) : (
                  !query.data.data.recent.length && <p>{t('srm.noOrders')}</p>
                )}
                <Shortcut
                  path='/supply/orders'
                  title='srm.viewAll'
                  page='operations.orders'
                />
              </CardContent>
            </Card>
          </div>
        )}
        {query.data && (
          <Card>
            <CardHeader>
              <CardTitle>{t('ops.stockWatch')}</CardTitle>
            </CardHeader>
            <CardContent className='flex flex-col gap-3'>
              {query.data.data.availability?.materials === false ? (
                <p>{t('srm.noAccess')}</p>
              ) : (
                query.data.data.stock.slice(0, 6).map((item) => (
                  <div key={item.name} className='flex justify-between gap-3'>
                    <span>{item.name}</span>
                    <span className='tabular-nums'>
                      {new Intl.NumberFormat(i18n.language).format(item.stock)}{' '}
                      /{' '}
                      {new Intl.NumberFormat(i18n.language).format(
                        item.threshold,
                      )}
                    </span>
                  </div>
                ))
              )}
              {query.data.data.availability?.materials !== false &&
                !query.data.data.stock.length && <p>{t('srm.noStock')}</p>}
              <Shortcut
                path='/supply/materials'
                title='srm.viewAll'
                page='operations.materials'
              />
            </CardContent>
          </Card>
        )}
        <div className='flex flex-wrap gap-3'>
          <Shortcut
            path='/supply/orders'
            title='ops.kinds.orders'
            page='operations.orders'
          />
          <Shortcut
            path='/supply/suppliers'
            title='ops.kinds.suppliers'
            page='operations.suppliers'
          />
          <Shortcut
            path='/delivery-plans'
            title='showcase.deliveryPlans'
            page='showcase.deliveryPlans'
          />
          <Shortcut
            path='/work-board'
            title='showcase.board'
            page='showcase.workBoard'
          />
          <Shortcut
            path='/business-ledger'
            title='showcase.ledger'
            page='showcase.ledger'
          />
        </div>
        <p className='text-sm text-muted-foreground'>
          {t('showcase.financeBoundary')}
        </p>
        <div>
          <FinanceAppLink />
        </div>
      </PageContainer>
      <Outlet />
    </>
  );
}
