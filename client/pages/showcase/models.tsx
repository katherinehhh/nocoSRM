import { Spinner } from '#components/ui/spinner';
import { Input } from '#components/ui/input';
import { StatusBadge } from '#components/status-badge';
import { useState } from 'react';
import { NativeSelect, NativeSelectOption } from '#components/ui/native-select';
import { Card, CardHeader, CardTitle, CardContent } from '#components/ui/card';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '#components/ui/alert-dialog';
import { Link, Outlet } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiClient, useToaster } from '@nocobase/app-client';
import type { ModelServiceView } from '@nocobase/app-plugin-agents/shared/models';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { DataTable } from '#components/data-table';
import { Button } from '#components/ui/button';
import { State, Refresh } from './states.js';
import { useCopy, useWrite, useShowcase, type Overview } from './common.js';
export default function Models() {
  const { t } = useCopy(),
    api = useApiClient(),
    toast = useToaster(),
    caps = useShowcase<{ data: Overview }>('overview'),
    cache = useQueryClient(),
    write = useWrite(),
    [disable, setDisable] = useState<ModelServiceView | null>(null),
    [selected, setSelected] = useState(''),
    [search, setSearch] = useState(''),
    [provider, setProvider] = useState(''),
    [descending, setDescending] = useState(false),
    q = useQuery({
      queryKey: ['model-services'],
      queryFn: ({ signal }) =>
        api.request<{ data: ModelServiceView[] }>({
          path: 'agents/services',
          signal,
        }),
      retry: false,
    });
  const defaults = useQuery({
    queryKey: ['model-defaults'],
    queryFn: ({ signal }) =>
      api.request<{
        data: {
          chat: { modelService: string; model: string } | null;
          effectiveChat: { modelService: string; model: string } | null;
        };
      }>({ path: 'agents/defaultModels', signal }),
    retry: false,
  });
  const saveDefault = useMutation({
    mutationFn: () => {
      const value = JSON.parse(selected) as {
        modelService: string;
        model: string;
      };
      return api.request({
        path: 'agents/defaultModels/chat',
        method: 'PUT',
        json: value,
      });
    },
    onSuccess: () => {
      toast.show({
        type: 'success',
        title: t('showcase.operationComplete', {
          operation: t('showcase.defaultModel'),
          name: '',
        }),
      });
      void cache.invalidateQueries({ queryKey: ['model-defaults'] });
      void cache.invalidateQueries({ queryKey: ['showcase'] });
    },
  });
  const matching = (q.data?.data ?? [])
    .filter(
      (row) =>
        (!search || row.title.toLowerCase().includes(search.toLowerCase())) &&
        (!provider || row.provider === provider),
    )
    .sort((a, b) => (descending ? -1 : 1) * a.title.localeCompare(b.title));
  return (
    <>
      <PageContainer>
        <PageHeader
          title={t('showcase.models')}
          description={t('showcase.modelsDescription')}
          actions={
            <>
              {caps.data?.data.modelManage && !!q.data?.data.length && (
                <Button nativeButton={false} render={<Link to='new' />}>
                  {t('showcase.newModel')}
                </Button>
              )}
              <Refresh
                pending={q.isFetching || defaults.isFetching}
                onClick={() => {
                  void q.refetch();
                  void defaults.refetch();
                }}
              />
            </>
          }
        />
        <form
          className='flex flex-wrap gap-3'
          onSubmit={(e) => e.preventDefault()}
        >
          <Input
            className='min-w-44 flex-1'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={t('ops.search')}
            placeholder={t('ops.search')}
          />
          <NativeSelect
            aria-label={t('showcase.provider')}
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
          >
            <NativeSelectOption value=''>
              {t('showcase.allProviders')}
            </NativeSelectOption>
            {[...new Set(q.data?.data.map((row) => row.provider))].map(
              (value) => (
                <NativeSelectOption value={value} key={value}>
                  {value}
                </NativeSelectOption>
              ),
            )}
          </NativeSelect>
          {(search || provider) && (
            <Button
              variant='ghost'
              onClick={() => {
                setSearch('');
                setProvider('');
              }}
            >
              {t('ops.clear')}
            </Button>
          )}
        </form>
        <State
          loading={q.isPending}
          error={q.error}
          retry={() => void q.refetch()}
          empty={!q.isPending && matching.length === 0}
          emptyLabel={search || provider ? t('showcase.noResults') : undefined}
          clear={
            search || provider
              ? () => {
                  setSearch('');
                  setProvider('');
                }
              : undefined
          }
          emptyAction={
            caps.data?.data.modelManage ? (
              <Button nativeButton={false} render={<Link to='new' />}>
                {t('showcase.newModel')}
              </Button>
            ) : undefined
          }
        />
        {matching.length ? (
          <DataTable
            sorting={[{ id: 'title', desc: descending }]}
            onSort={(next) => setDescending(next[0]?.desc ?? false)}
            data={matching}
            columns={[
              {
                accessorKey: 'title',
                header: t('ops.fields.name'),
              },
              {
                accessorKey: 'provider',
                cell: ({ getValue }) => (
                  <StatusBadge tone='neutral'>{String(getValue())}</StatusBadge>
                ),
                header: t('showcase.provider'),
                enableSorting: false,
              },
              {
                accessorKey: 'apiKeySet',
                header: t('showcase.credentials'),
                enableSorting: false,
                cell: ({ getValue }) =>
                  t(
                    getValue()
                      ? 'showcase.configured'
                      : 'showcase.unconfigured',
                  ),
              },
              {
                accessorKey: 'enabled',
                header: t('ops.fields.status'),
                enableSorting: false,
                cell: ({ getValue }) => (
                  <StatusBadge tone={getValue() ? 'success' : 'neutral'}>
                    {t(getValue() ? 'showcase.enabled' : 'showcase.disabled')}
                  </StatusBadge>
                ),
              },
              {
                id: 'edit',
                header: t('showcase.actions'),
                cell: ({ row }) =>
                  caps.data?.data.modelManage ? (
                    <div className='flex gap-2'>
                      <Button
                        nativeButton={false}
                        variant='outline'
                        render={<Link to={`${row.original.name}/edit`} />}
                      >
                        {t('ops.edit')}
                      </Button>
                      <Button
                        variant='outline'
                        disabled={write.isPending}
                        onClick={() => {
                          if (row.original.enabled) setDisable(row.original);
                          else
                            write.mutate(
                              {
                                path: `agents/services/${row.original.name}`,
                                method: 'PATCH',
                                json: { enabled: true },
                              },
                              { onSuccess: () => void q.refetch() },
                            );
                        }}
                      >
                        {t(
                          row.original.enabled
                            ? 'showcase.disabled'
                            : 'showcase.enabled',
                        )}
                      </Button>
                    </div>
                  ) : null,
              },
            ]}
          />
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>{t('showcase.defaultModel')}</CardTitle>
          </CardHeader>
          <CardContent className='flex flex-col gap-3'>
            <State
              loading={defaults.isPending}
              error={defaults.error}
              retry={() => void defaults.refetch()}
            />
            <p className='text-sm text-muted-foreground'>
              {defaults.data?.data.effectiveChat?.model ??
                t('showcase.unconfigured')}
            </p>
            <NativeSelect
              aria-label={t('showcase.defaultModel')}
              disabled={!caps.data?.data.modelManage}
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <NativeSelectOption value=''>
                {t('showcase.defaultModel')}
              </NativeSelectOption>
              {q.data?.data
                .filter((s) => s.enabled)
                .flatMap((s) =>
                  s.models
                    .filter((m) => m.kind === 'chat')
                    .map((m) => (
                      <NativeSelectOption
                        key={`${s.name}:${m.value}`}
                        value={JSON.stringify({
                          modelService: s.name,
                          model: m.value,
                        })}
                      >
                        {s.title} · {m.label}
                      </NativeSelectOption>
                    )),
                )}
            </NativeSelect>
            <State
              error={saveDefault.error}
              retry={() => saveDefault.mutate()}
            />
            {caps.data?.data.modelManage && (
              <Button
                className='self-end'
                disabled={!selected || saveDefault.isPending}
                onClick={() => saveDefault.mutate()}
              >
                {saveDefault.isPending && <Spinner />}
                {t('ops.save')}
              </Button>
            )}
          </CardContent>
        </Card>
      </PageContainer>
      <AlertDialog
        open={!!disable}
        onOpenChange={(open) => {
          if (!open) setDisable(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('showcase.disableModel', { name: disable?.title })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('showcase.disableModelDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={write.isPending}>
              {t('ops.cancel')}
            </AlertDialogCancel>
            <Button
              variant='destructive'
              disabled={write.isPending}
              onClick={() => {
                if (disable)
                  write.mutate(
                    {
                      path: `agents/services/${disable.name}`,
                      method: 'PATCH',
                      json: { enabled: false },
                    },
                    {
                      onSuccess: () => {
                        setDisable(null);
                        void q.refetch();
                        void defaults.refetch();
                      },
                    },
                  );
              }}
            >
              {t('showcase.disabled')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Outlet />
    </>
  );
}
