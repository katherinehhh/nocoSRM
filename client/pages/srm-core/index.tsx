import { CoreStatus, Truncated } from './presentation.js';
import { Link, Outlet, useLocation, useSearchParams } from 'react-router';
import { useState } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { DataTable } from '#components/data-table';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { NativeSelect, NativeSelectOption } from '#components/ui/native-select';
import { State, Refresh } from '../showcase/states.js';
import { useCore, useCoreKind } from './common.js';
import {
  coreStates,
  type CoreView,
  type CoreKind,
} from '../../../shared/srm-core.js';
export default function CoreList() {
  const kind = useCoreKind(),
    { t, i18n } = useTranslation(),
    location = useLocation(),
    [params, setParams] = useSearchParams(),
    [draft, setDraft] = useState(params.get('q') ?? '');
  const q = params.get('q') ?? '',
    status = params.get('status') ?? '',
    page = Number(params.get('page') ?? 1),
    sort = params.get('sort') ?? 'updatedAt',
    direction = params.get('direction') ?? 'desc';
  const result = useCore<{ data: CoreView[]; meta: { total: number } }>(kind, {
      q,
      status,
      page,
      sort,
      direction,
    }),
    caps = useCore<{ data: { permissions: Record<CoreKind, string[]> } }>(
      'capabilities',
    );
  const canCreate = caps.data?.data.permissions[kind].includes('create'),
    empty = !!result.data && !result.data.meta.total && !q && !status;
  const change = (values: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values))
      if (value) next.set(key, value);
      else next.delete(key);
    setParams(next, { replace: true });
  };
  const create = (
    <Button
      nativeButton={false}
      render={<Link to={{ pathname: 'new', search: location.search }} />}
    >
      {t('core.new', { kind: t(`core.kinds.${kind}`) })}
    </Button>
  );
  const columns: ColumnDef<CoreView>[] = [
    {
      accessorKey: 'number',
      header: t('core.fields.number'),
      cell: ({ row }) => (
        <Link
          className='text-primary hover:underline'
          to={{ pathname: row.original.id, search: location.search }}
        >
          {row.original.number}
        </Link>
      ),
    },
    {
      accessorKey: 'name',
      header: t('core.fields.name'),
      cell: ({ getValue }) => <Truncated text={String(getValue())} />,
    },
    {
      accessorKey: 'status',
      header: t('core.fields.status'),
      enableSorting: false,
      cell: ({ row }) => <CoreStatus status={row.original.status} />,
    },
    {
      accessorKey: 'deadline',
      header: t('core.fields.deadline'),
      cell: ({ getValue }) =>
        getValue()
          ? new Date(`${String(getValue())}T12:00:00`).toLocaleDateString(
              i18n.language,
            )
          : '—',
    },
    {
      accessorKey: 'updatedAt',
      header: t('core.fields.updatedAt'),
      cell: ({ getValue }) =>
        new Date(String(getValue())).toLocaleString(i18n.language),
    },
    {
      id: 'open',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <Button
          variant='ghost'
          nativeButton={false}
          render={
            <Link to={{ pathname: row.original.id, search: location.search }} />
          }
        >
          {t('core.open')}
        </Button>
      ),
    },
  ];
  return (
    <>
      <PageContainer>
        <PageHeader
          title={t(`core.kinds.${kind}`)}
          description={t(`core.descriptions.${kind}`)}
          actions={
            <>
              {result.data && !empty && canCreate && create}
              <Refresh
                pending={result.isFetching}
                onClick={() => void result.refetch()}
              />
            </>
          }
        />
        <div className='flex flex-wrap items-center gap-2'>
          <Input
            className='sm:max-w-xs'
            aria-label={t('core.search')}
            placeholder={t('core.search')}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing)
                change({ q: draft, page: '1' });
            }}
          />
          <Button
            variant='outline'
            onClick={() => change({ q: draft, page: '1' })}
          >
            {t('core.searchAction')}
          </Button>
          <NativeSelect
            aria-label={t('core.fields.status')}
            value={status}
            onChange={(e) => change({ status: e.target.value, page: '1' })}
          >
            <NativeSelectOption value=''>
              {t('core.allStates')}
            </NativeSelectOption>
            {coreStates.map((s) => (
              <NativeSelectOption key={s} value={s}>
                {t(`core.status.${s}`)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {(q || status) && (
            <Button
              variant='ghost'
              onClick={() => {
                setDraft('');
                change({ q: '', status: '', page: '1' });
              }}
            >
              {t('core.clear')}
            </Button>
          )}
        </div>
        <State
          loading={result.isPending}
          error={result.error}
          retry={() => void result.refetch()}
          empty={!!result.data && !result.data.data.length}
          emptyLabel={t(q || status ? 'core.noResults' : 'core.empty')}
          emptyDescription={t(
            q || status ? 'core.noResultsHint' : 'core.emptyHint',
          )}
          emptyAction={empty && canCreate ? create : undefined}
        />
        {!!result.data?.data.length && (
          <DataTable
            data={result.data.data}
            columns={columns}
            sorting={[{ id: sort, desc: direction === 'desc' }]}
            onSort={(sorting) =>
              change({
                sort: sorting[0]?.id ?? 'updatedAt',
                direction: sorting[0]?.desc ? 'desc' : 'asc',
                page: '1',
              })
            }
          />
        )}
        {result.data && (
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <span className='text-sm text-muted-foreground'>
              {t('core.total', { count: result.data.meta.total })}
            </span>
            <div className='flex gap-2'>
              <Button
                variant='outline'
                disabled={page <= 1 || result.isFetching}
                onClick={() => change({ page: String(page - 1) })}
              >
                {t('core.previous')}
              </Button>
              <Button
                variant='outline'
                disabled={
                  page * 20 >= result.data.meta.total || result.isFetching
                }
                onClick={() => change({ page: String(page + 1) })}
              >
                {t('core.next')}
              </Button>
            </div>
          </div>
        )}
      </PageContainer>
      <Outlet />
    </>
  );
}
