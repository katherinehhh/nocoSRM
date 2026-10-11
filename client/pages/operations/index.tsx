import { DatePicker } from '#components/date-picker';
import { BackButton } from '#components/back-button';
import { RefreshCw } from 'lucide-react';
import { Link, Outlet, useLocation, useSearchParams } from 'react-router';
import { Plus, Search } from 'lucide-react';
import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { DataTable } from '#components/data-table';
import { Input } from '#components/ui/input';
import { Button } from '#components/ui/button';
import { NativeSelect, NativeSelectOption } from '#components/ui/native-select';
import { type Doc, transitions } from '../../../shared/operations.js';
import { useKind, useCopy, useData, useCapabilities, money } from './common.js';
import { State, Status } from './states.js';

export default function OperationsList() {
  const kind = useKind(),
    { t, i18n } = useCopy(),
    location = useLocation();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const page = Number(params.get('page') ?? 1),
    status = params.get('status') ?? '',
    q = params.get('q') ?? '',
    sort = params.get('sort') ?? 'updatedAt',
    direction = params.get('direction') ?? 'desc';
  const result = useData<{ data: Doc[]; meta: { total: number } }>(kind, {
    page,
    pageSize: 20,
    q,
    status,
    sort,
    direction,
    supplierId: params.get('supplierId') ?? '',
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
  });
  const caps = useCapabilities();
  const suppliers = useData<{ data: Doc[] }>(
    'suppliers',
    {},
    !!caps.data && !caps.data.data.supplierId,
  );
  const stock = useData<{ data: (Doc & { stock: number })[] }>(
    'stock',
    {},
    kind === 'materials' || kind === 'receipts',
  );
  function change(values: Record<string, string>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(values)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  }
  const columns: ColumnDef<Doc>[] = [
    {
      accessorKey: 'number',
      header: t('ops.fields.number'),
      cell: ({ row }) => (
        <Link
          className='font-medium text-primary hover:underline'
          to={{ pathname: row.original.id, search: location.search }}
        >
          {row.original.number}
        </Link>
      ),
    },
    {
      accessorKey: 'name',
      header: t('ops.fields.name'),
      cell: ({ row }) => (
        <div className='max-w-72 truncate' title={row.original.name}>
          {row.original.name}
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: t('ops.fields.status'),
      enableSorting: false,
      cell: ({ row }) => <Status value={row.original.status} />,
    },
    { accessorKey: 'businessDate', header: t('ops.fields.businessDate') },
    {
      accessorKey: 'amount',
      header: t('ops.fields.amount'),
      cell: ({ row }) => (
        <span className='tabular-nums'>
          {money(row.original.amount, i18n.language)}
        </span>
      ),
    },
  ];
  if (kind === 'materials')
    columns.splice(2, 0, {
      id: 'stock',
      header: t('ops.stock'),
      enableSorting: false,
      cell: ({ row }) =>
        stock.data?.data.find((m) => m.id === row.original.id)?.stock ?? '—',
    });
  if (
    ![
      'suppliers',
      'materials',
      'warehouses',
      'taxScenarios',
      'policies',
      'runs',
    ].includes(kind)
  )
    columns.splice(2, 0, {
      id: 'supplier',
      header: t('ops.fields.supplierId'),
      enableSorting: false,
      cell: ({ row }) =>
        suppliers.data?.data.find((s) => s.id === row.original.supplierId)
          ?.name ?? '—',
    });
  const statuses = [
    ...new Set(
      Object.values(transitions[kind] ?? {}).flatMap((r) => [...r.from, r.to]),
    ),
  ];
  return (
    <>
      <PageContainer>
        {location.pathname.includes('/portal/') && <BackButton />}
        <PageHeader
          title={t(`ops.kinds.${kind}`)}
          description={t(`ops.descriptions.${kind}`)}
          actions={
            <>
              <Button
                variant='outline'
                aria-label={t('ops.refresh')}
                onClick={() => void result.refetch()}
              >
                <RefreshCw />
                {t('ops.refresh')}
              </Button>
              {caps.data?.data.permissions[kind].includes('create') && (
                <Button
                  nativeButton={false}
                  render={
                    <Link to={{ pathname: 'new', search: location.search }} />
                  }
                >
                  <Plus />
                  {t('ops.create')}
                </Button>
              )}
            </>
          }
        />
        <form
          className='flex flex-wrap items-center gap-3'
          onSubmit={(e) => {
            e.preventDefault();
            change({ q: search, page: '1' });
          }}
        >
          <div className='relative min-w-52 flex-1'>
            <Search className='absolute left-3 top-2.5 size-4 text-muted-foreground' />
            <Input
              className='pl-9'
              aria-label={t('ops.search')}
              placeholder={t('ops.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button variant='outline' type='submit'>
            {t('ops.searchButton')}
          </Button>
          <NativeSelect
            aria-label={t('ops.fields.status')}
            value={status}
            onChange={(e) => change({ status: e.target.value, page: '1' })}
          >
            <NativeSelectOption value=''>
              {t('ops.allStatus')}
            </NativeSelectOption>
            {statuses.map((s) => (
              <NativeSelectOption key={s} value={s}>
                {t(`ops.status.${s}`)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {!caps.data?.data.supplierId && suppliers.data && (
            <NativeSelect
              aria-label={t('ops.fields.supplierId')}
              value={params.get('supplierId') ?? ''}
              onChange={(e) =>
                change({ supplierId: e.target.value, page: '1' })
              }
            >
              <NativeSelectOption value=''>
                {t('ops.allSuppliers')}
              </NativeSelectOption>
              {suppliers.data.data.map((s) => (
                <NativeSelectOption value={s.id} key={s.id}>
                  {s.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
          <div className='flex flex-wrap gap-2'>
            <DatePicker
              label={t('ops.fields.from')}
              value={params.get('from') ?? ''}
              onChange={(from) => change({ from, page: '1' })}
            />
            <DatePicker
              label={t('ops.fields.to')}
              value={params.get('to') ?? ''}
              onChange={(to) => change({ to, page: '1' })}
            />
            {(q ||
              status ||
              params.get('from') ||
              params.get('to') ||
              params.get('supplierId')) && (
              <Button
                type='button'
                variant='ghost'
                onClick={() => {
                  setSearch('');
                  change({
                    q: '',
                    status: '',
                    supplierId: '',
                    from: '',
                    to: '',
                    page: '1',
                  });
                }}
              >
                {t('ops.clear')}
              </Button>
            )}
          </div>
        </form>
        <State
          loading={result.isPending}
          error={result.error}
          retry={() => void result.refetch()}
          empty={result.data?.data.length === 0}
        />
        {!!result.data?.data.length && (
          <>
            <DataTable
              data={result.data.data}
              columns={columns}
              sorting={[{ id: sort, desc: direction === 'desc' }]}
              onSort={(s) =>
                change({
                  sort: s[0]?.id ?? 'updatedAt',
                  direction: s[0]?.desc ? 'desc' : 'asc',
                  page: '1',
                })
              }
            />
            <div className='flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground'>
              <span>{t('ops.total', { count: result.data.meta.total })}</span>
              <div className='flex items-center gap-3'>
                <Button
                  variant='outline'
                  disabled={page <= 1}
                  onClick={() => change({ page: String(page - 1) })}
                >
                  {t('ops.previous')}
                </Button>
                <span>{page}</span>
                <Button
                  variant='outline'
                  disabled={page * 20 >= result.data.meta.total}
                  onClick={() => change({ page: String(page + 1) })}
                >
                  {t('ops.next')}
                </Button>
              </div>
            </div>
          </>
        )}
      </PageContainer>
      <Outlet context={{ reload: () => result.refetch() }} />
    </>
  );
}
