import { Link, Outlet } from 'react-router';
import { Boxes, Truck, Wallet, Activity, ArrowUpRight } from 'lucide-react';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { useCopy, useData, money, paths } from './common.js';
import { State, Status } from './states.js';

import { type Doc, type Kind } from '../../../shared/operations.js';
interface Summary {
  cards: { kind: Kind; count: number; amount: number }[];
  tasks: Doc[];
  recent: Doc[];
  stock: { name: string; stock: number; threshold: number }[];
}
export default function Dashboard() {
  const { t, i18n } = useCopy(),
    query = useData<{ data: Summary }>('dashboard');
  const icons = [Boxes, Truck, Wallet, Activity];
  return (
    <>
      <PageContainer>
        <PageHeader
          title={t('ops.dashboard')}
          description={t('ops.dashboardDescription')}
        />
        <State
          loading={query.isPending}
          error={query.error}
          retry={() => void query.refetch()}
        />
        {query.data && (
          <>
            <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
              {query.data.data.cards.map((c, i) => {
                const Icon = icons[i % icons.length];
                return (
                  <Link
                    key={c.kind}
                    className='rounded-xl border bg-card p-5 transition-colors hover:bg-muted/50'
                    to={paths[c.kind]}
                  >
                    <div className='flex justify-between text-sm text-muted-foreground'>
                      <span>{t(`ops.kinds.${c.kind}`)}</span>
                      <Icon className='size-5' />
                    </div>
                    <p className='mt-5 text-3xl font-semibold tabular-nums'>
                      {c.count}
                    </p>
                    <p className='mt-2 text-sm text-muted-foreground'>
                      {money(c.amount, i18n.language)}
                    </p>
                  </Link>
                );
              })}
            </div>
            <div className='grid gap-6 xl:grid-cols-2'>
              <section className='rounded-xl border p-6'>
                <h2 className='text-lg font-semibold'>{t('ops.priority')}</h2>
                <div className='mt-4 divide-y'>
                  {query.data.data.tasks.map((d) => (
                    <Link
                      className='flex items-center justify-between gap-4 py-4'
                      key={d.id}
                      to={`records/tasks/${d.id}`}
                    >
                      <span className='truncate'>{d.name}</span>
                      <ArrowUpRight className='size-4 shrink-0' />
                    </Link>
                  ))}
                  {!query.data.data.tasks.length && (
                    <p className='py-8 text-sm text-muted-foreground'>
                      {t('ops.noTasks')}
                    </p>
                  )}
                </div>
              </section>
              <section className='rounded-xl border p-6'>
                <h2 className='text-lg font-semibold'>{t('ops.stockWatch')}</h2>
                <div className='mt-4 space-y-5'>
                  {query.data.data.stock.map((m) => (
                    <div key={m.name}>
                      <div className='flex justify-between gap-4 text-sm'>
                        <span>{m.name}</span>
                        <span className='tabular-nums'>
                          {m.stock} / {m.threshold}
                        </span>
                      </div>
                      <div className='mt-2 h-2 overflow-hidden rounded bg-muted'>
                        <div
                          className='h-full bg-primary'
                          style={{
                            width: `${Math.min(100, (m.stock / Math.max(1, m.threshold)) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
            <section className='rounded-xl border p-6'>
              <div className='flex justify-between'>
                <h2 className='text-lg font-semibold'>
                  {t('ops.recentOrders')}
                </h2>
                <Link className='text-sm text-primary' to={paths.orders}>
                  {t('ops.viewAll')}
                </Link>
              </div>
              <div className='mt-3 divide-y'>
                {query.data.data.recent.map((d) => (
                  <Link
                    className='flex flex-wrap items-center justify-between gap-3 py-4'
                    key={d.id}
                    to={`records/orders/${d.id}`}
                  >
                    <span>
                      {d.name}
                      <span className='ml-3 text-xs text-muted-foreground'>
                        {d.number}
                      </span>
                    </span>
                    <Status value={d.status} />
                  </Link>
                ))}
              </div>
            </section>
          </>
        )}
      </PageContainer>
      <Outlet />
    </>
  );
}
