import { EllipsisIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '#components/ui/dropdown-menu';
import { useState } from 'react';
import { Link, Outlet, useLocation, useSearchParams } from 'react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { DataTable } from '#components/data-table';
import { Input } from '#components/ui/input';
import { FinanceAppLink } from '#components/finance-app-link';
import { Button } from '#components/ui/button';
import { NativeSelect, NativeSelectOption } from '#components/ui/native-select';
import { State, Status, Refresh } from './states.js';
import { money } from '../operations/common.js';
import { deliveryStates, type Delivery } from '../../../shared/showcase.js';
import { useCopy, useShowcase, type Overview, type Ledger } from './common.js';
export default function ShowcaseList() {
  const location = useLocation(),
    ledger = location.pathname.includes('business-ledger'),
    { t, i18n } = useCopy(),
    [params, setParams] = useSearchParams(),
    [search, setSearch] = useState(params.get('q') ?? '');
  const page = Number(params.get('page') ?? 1),
    status = params.get('status') ?? '',
    sort = params.get('sort') ?? 'updatedAt',
    direction = params.get('direction') ?? 'desc';
  const query = useShowcase<{
    data: (Delivery | Ledger)[];
    meta: { total: number; capped: boolean };
  }>(ledger ? 'businessLedger' : 'deliveryPlans', {
    q: params.get('q') ?? '',
    status,
    supplier: params.get('supplier') ?? '',
    page,
    sort,
    direction,
  });
  const overview = useShowcase<{ data: Overview }>('overview');
  function change(values: Record<string, string>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(values))
      if (v) next.set(k, v);
      else next.delete(k);
    setParams(next, { replace: true });
  }
  const columns: ColumnDef<Delivery | Ledger>[] = [
    {
      accessorKey: 'number',
      header: t('ops.fields.number'),
      enableSorting: false,
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
      enableSorting: false,
      cell: ({ row }) => (
        <div className='max-w-64 truncate' title={row.original.name}>
          {row.original.name}
        </div>
      ),
    },
    {
      accessorKey: 'supplierName',
      header: t('ops.fields.supplierId'),
      enableSorting: false,
      cell: ({ getValue }) => (
        <span
          className='block max-w-48 truncate'
          title={String(getValue<string>() ?? '')}
        >
          {String(getValue<string>() ?? '—')}
        </span>
      ),
    },
    ...((ledger
      ? [
          {
            accessorKey: 'externalReference',
            header: t('showcase.externalReference'),
            enableSorting: false,
            cell: ({ getValue }) => String(getValue<string>() ?? '—'),
          },
        ]
      : [
          {
            accessorKey: 'region',
            header: t('showcase.fields.region'),
            enableSorting: false,
          },
          {
            accessorKey: 'allocation',
            header: t('showcase.fields.allocation'),
            cell: ({ getValue }) => (
              <span className='block text-right tabular-nums'>
                {Number(getValue()).toLocaleString(i18n.language)}
              </span>
            ),
          },
          {
            accessorKey: 'boxes',
            header: t('showcase.fields.boxes'),
            cell: ({ getValue }) => (
              <span className='block text-right tabular-nums'>
                {Number(getValue()).toLocaleString(i18n.language)}
              </span>
            ),
          },
          {
            accessorKey: 'businessDate',
            header: t('ops.fields.businessDate'),
            cell: ({ getValue }) =>
              new Date(`${String(getValue())}T12:00:00`).toLocaleDateString(
                i18n.language,
              ),
          },
        ]) as ColumnDef<Delivery | Ledger>[]),
    {
      accessorKey: ledger ? 'disposition' : 'status',
      header: t('ops.fields.status'),
      enableSorting: false,
      cell: ({ getValue }) => <Status value={String(getValue())} />,
    },
    {
      accessorKey: ledger ? 'localAmount' : 'amount',
      header: t('showcase.localAmount'),
      cell: ({ getValue }) => (
        <span className='block text-right tabular-nums'>
          {money(Number(getValue()), i18n.language)}
        </span>
      ),
    },
    ...(ledger
      ? ([
          ...['localQuantity', 'externalQuantity', 'quantityDifference'].map(
            (key) => ({
              accessorKey: key,
              header: t(`srm.${key}`),
              cell: ({ getValue }: { getValue: () => unknown }) => (
                <span className='block text-right tabular-nums'>
                  {getValue() === null
                    ? '—'
                    : Number(getValue()).toLocaleString(i18n.language)}
                </span>
              ),
            }),
          ),
          {
            accessorKey: 'externalAmount',
            header: t('showcase.externalAmount'),
            cell: ({ getValue }) =>
              getValue() === null
                ? '—'
                : money(Number(getValue()), i18n.language),
          },
          {
            accessorKey: 'difference',
            header: t('showcase.difference'),
            cell: ({ getValue }) =>
              getValue() === null
                ? '—'
                : money(Number(getValue()), i18n.language),
          },
        ] as ColumnDef<Delivery | Ledger>[])
      : []),
    {
      accessorKey: 'updatedAt',
      header: t('showcase.updatedAt'),
      cell: ({ getValue }) =>
        new Date(String(getValue())).toLocaleString(i18n.language),
    },
    {
      id: 'actions',
      header: t('showcase.actions'),
      enableSorting: false,
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant='ghost'
                size='icon'
                aria-label={t('showcase.actions')}
              />
            }
          >
            <EllipsisIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            <DropdownMenuItem
              render={
                <Link
                  to={{ pathname: row.original.id, search: location.search }}
                />
              }
            >
              {t('showcase.open')}
            </DropdownMenuItem>
            {!ledger &&
              row.original.status === 'draft' &&
              overview.data?.data.actions.includes('edit') && (
                <DropdownMenuItem
                  render={
                    <Link
                      to={{
                        pathname: `${row.original.id}/edit`,
                        search: location.search,
                      }}
                    />
                  }
                >
                  {t('ops.edit')}
                </DropdownMenuItem>
              )}
            {ledger && overview.data?.data.actions.includes('resolve') && (
              <DropdownMenuItem
                render={
                  <Link
                    to={{
                      pathname: `${row.original.id}/resolve`,
                      search: location.search,
                    }}
                  />
                }
              >
                {t('showcase.resolve')}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];
  return (
    <>
      <PageContainer>
        <PageHeader
          title={t(ledger ? 'showcase.ledger' : 'showcase.deliveryPlans')}
          description={t(
            ledger
              ? 'showcase.ledgerDescription'
              : 'showcase.deliveryDescription',
          )}
          actions={
            <>
              {!ledger &&
                !query.isPending &&
                !query.error &&
                !!query.data?.data.length &&
                overview.data?.data.actions.includes('create') && (
                  <Button
                    nativeButton={false}
                    render={
                      <Link to={{ pathname: 'new', search: location.search }} />
                    }
                  >
                    {t('ops.create')}
                  </Button>
                )}
              {ledger && <FinanceAppLink />}
              <Refresh
                pending={query.isFetching || overview.isFetching}
                onClick={() => {
                  void query.refetch();
                  void overview.refetch();
                }}
              />
            </>
          }
        />
        {ledger && (
          <p className='text-sm text-muted-foreground'>
            {t('showcase.financeBoundary')}
          </p>
        )}
        <form
          className='flex flex-wrap gap-3'
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
            placeholder={t('showcase.listSearch')}
          />
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
            {(ledger
              ? ['matched', 'disputed', 'needsReview', 'resolved']
              : deliveryStates
            ).map((value) => (
              <NativeSelectOption key={value} value={value}>
                {t(`ops.status.${value}`, {
                  defaultValue: t(`showcase.states.${value}`),
                })}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Input
            aria-label={t('showcase.supplierFilter')}
            placeholder={t('showcase.supplierFilter')}
            value={params.get('supplier') ?? ''}
            onChange={(e) => change({ supplier: e.target.value, page: '1' })}
          />
          {(search || status || params.get('supplier')) && (
            <Button
              variant='ghost'
              onClick={() => {
                setSearch('');
                change({ q: '', status: '', supplier: '', page: '1' });
              }}
            >
              {t('ops.clear')}
            </Button>
          )}
        </form>
        <State
          loading={query.isPending}
          error={query.error}
          retry={() => void query.refetch()}
          empty={query.data?.data.length === 0}
          emptyAction={
            !ledger && overview.data?.data.actions.includes('create') ? (
              <Button
                nativeButton={false}
                render={
                  <Link to={{ pathname: 'new', search: location.search }} />
                }
              >
                {t('ops.create')}
              </Button>
            ) : undefined
          }
          clear={
            search || status || params.get('supplier')
              ? () => {
                  setSearch('');
                  change({ q: '', status: '', supplier: '', page: '1' });
                }
              : undefined
          }
          emptyLabel={
            search || status || params.get('supplier')
              ? t('showcase.noResults')
              : undefined
          }
        />
        {query.data?.meta.capped && (
          <p role='status'>{t('showcase.cap', { count: 1000 })}</p>
        )}
        {!!query.data?.data.length && (
          <>
            <DataTable
              columns={columns}
              data={query.data.data}
              sorting={[{ id: sort, desc: direction === 'desc' }]}
              onSort={(s) =>
                change({
                  sort: s[0]?.id ?? 'updatedAt',
                  direction: s[0]?.desc ? 'desc' : 'asc',
                  page: '1',
                })
              }
            />
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <span>{t('ops.total', { count: query.data.meta.total })}</span>
              <div className='flex gap-3'>
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
                  disabled={page * 20 >= query.data.meta.total}
                  onClick={() => change({ page: String(page + 1) })}
                >
                  {t('ops.next')}
                </Button>
              </div>
            </div>
          </>
        )}
      </PageContainer>
      <Outlet />
    </>
  );
}
