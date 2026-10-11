import { useState } from 'react';
import { Input } from '#components/ui/input';
import { Link, Outlet, useLocation } from 'react-router';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Card, CardHeader, CardTitle, CardContent } from '#components/ui/card';
import { State, Status, Refresh } from './states.js';
import { money } from '../operations/common.js';
import { deliveryStates, type Delivery } from '../../../shared/showcase.js';
import { useCopy, useShowcase } from './common.js';
export default function Board() {
  const [search, setSearch] = useState('');
  const { t, i18n } = useCopy(),
    location = useLocation(),
    query = useShowcase<{ data: Delivery[]; meta: { cap: number } }>(
      'workBoard',
    );
  const rows =
    query.data?.data.filter((r) =>
      `${r.name} ${r.number} ${r.lines}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) ?? [];
  return (
    <>
      <PageContainer>
        <PageHeader
          title={t('showcase.board')}
          description={t('showcase.boardDescription')}
          actions={
            <Refresh
              pending={query.isFetching}
              onClick={() => {
                void query.refetch();
              }}
            />
          }
        />
        <Input
          aria-label={t('ops.search')}
          placeholder={t('ops.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <State
          loading={query.isPending}
          error={query.error}
          retry={() => void query.refetch()}
        />
        {query.data && (
          <>
            {query.data.data.length >= 200 && (
              <p>{t('showcase.cap', { count: 200 })}</p>
            )}
            <div className='overflow-x-auto'>
              <div className='grid min-w-416 grid-cols-6 items-start gap-4'>
                {deliveryStates.map((status) => (
                  <Card key={status}>
                    <CardHeader>
                      <CardTitle className='flex items-center justify-between gap-2'>
                        <Status value={status} />
                        <span className='text-sm tabular-nums'>
                          {rows.filter((r) => r.status === status).length}
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className='flex flex-col gap-3'>
                      {rows
                        .filter((r) => r.status === status)
                        .map((r) => (
                          <Link
                            key={r.id}
                            className='rounded-lg border p-4 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring'
                            to={{ pathname: r.id, search: location.search }}
                          >
                            <p className='font-medium'>{r.name}</p>
                            <p className='mt-1 text-sm text-muted-foreground'>
                              {r.number}
                            </p>
                            <p className='mt-2 text-sm tabular-nums'>
                              {money(r.amount, i18n.language)}
                            </p>
                          </Link>
                        ))}
                      {!rows.some((r) => r.status === status) && (
                        <p className='text-sm text-muted-foreground'>
                          {t('ops.empty')}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </>
        )}
      </PageContainer>
      <Outlet />
    </>
  );
}
