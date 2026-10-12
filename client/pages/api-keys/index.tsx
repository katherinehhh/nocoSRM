import { useSrmQueryScope } from '#hooks/use-srm-query-scope';
import { useState } from 'react';
import { Link, Outlet, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useAuthentication,
  useAuthenticationClient,
} from '@nocobase/app-plugin-authentication/client';
import {
  formatKeyHint,
  isExpired,
  expiryChoiceToSeconds,
  API_KEY_EXPIRY_CHOICES,
  type ApiKeySummary,
  type ApiKeyExpiryChoice,
} from '@nocobase/app-plugin-api-keys/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useToaster } from '@nocobase/app-client';
import type { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal } from 'lucide-react';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { DataTable } from '#components/data-table';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Badge } from '#components/ui/badge';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Field, FieldLabel, FieldError } from '#components/ui/field';
import { NativeSelect, NativeSelectOption } from '#components/ui/native-select';
import { RouteDialog } from '#components/route-dialog';
import { useRouteOverlay } from '#components/use-route-overlay';
import { useDirtyClose } from '#hooks/use-dirty-close';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '#components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '#components/ui/alert-dialog';
import { State, Refresh, FormActions } from '../showcase/states.js';
import { Spinner } from '#components/ui/spinner';
function useKeys() {
  const api = useAuthenticationClient().apiKey,
    { session } = useAuthentication();
  return useQuery({
    queryKey: ['srm-api-keys', session?.user.id, ...useSrmQueryScope()],
    queryFn: async () => {
      const result: ApiKeySummary[] = [];
      for (let offset = 0; ; offset += 100) {
        const r = await api.list({
          query: { limit: 100, offset, sortBy: 'id', sortDirection: 'asc' },
        });
        if (r.error)
          throw Object.assign(new Error(r.error.code), {
            status: r.error.status,
            reason: r.error.code,
          });
        result.push(...r.data.apiKeys);
        if (r.data.apiKeys.length < 100) break;
      }
      return result;
    },
    enabled: !!session,
    retry: false,
  });
}
export default function ApiKeys() {
  const { t, i18n } = useTranslation(),
    q = useKeys(),
    api = useAuthenticationClient().apiKey,
    cache = useQueryClient(),
    toast = useToaster();
  const [search, setSearch] = useState(''),
    [page, setPage] = useState(1),
    [sort, setSort] = useState('createdAt'),
    [desc, setDesc] = useState(true),
    [action, setAction] = useState<{
      row: ApiKeySummary;
      type: 'delete' | 'enable' | 'disable';
    } | null>(null),
    [pending, setPending] = useState(false),
    [error, setError] = useState('');
  const rows = (q.data ?? [])
    .filter((k) =>
      `${k.name} ${formatKeyHint(k)}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .sort((a, b) => {
      const value = (k: ApiKeySummary) =>
        sort === 'name'
          ? (k.name ?? '')
          : sort === 'expiresAt'
            ? k.expiresAt
              ? new Date(k.expiresAt).getTime()
              : Number.MAX_SAFE_INTEGER
            : new Date(k.createdAt).getTime();
      const aV = value(a),
        bV = value(b),
        v =
          typeof aV === 'number' && typeof bV === 'number'
            ? aV - bV
            : String(aV).localeCompare(String(bV));
      return (desc ? -v : v) || a.id.localeCompare(b.id);
    });
  const columns: ColumnDef<ApiKeySummary>[] = [
    { accessorKey: 'name', header: t('srm.apiKeysName') },
    {
      id: 'hint',
      header: t('srm.keyHint'),
      enableSorting: false,
      cell: ({ row }) => formatKeyHint(row.original),
    },
    {
      id: 'status',
      header: t('srm.status'),
      enableSorting: false,
      cell: ({ row }) => (
        <Badge variant='secondary'>
          {t(
            isExpired(row.original.expiresAt)
              ? 'srm.apiKeysExpired'
              : row.original.enabled
                ? 'srm.enabled'
                : 'srm.disabled',
          )}
        </Badge>
      ),
    },
    {
      accessorKey: 'expiresAt',
      header: t('srm.apiKeysExpiry'),
      cell: ({ row }) =>
        row.original.expiresAt
          ? new Date(row.original.expiresAt).toLocaleDateString(i18n.language)
          : t('srm.apiKeysNever'),
    },
    {
      accessorKey: 'createdAt',
      header: t('srm.createdAt'),
      cell: ({ row }) =>
        new Date(row.original.createdAt).toLocaleString(i18n.language),
    },
    {
      id: 'actions',
      enableSorting: false,
      header: t('showcase.actions'),
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                size='icon-sm'
                variant='ghost'
                aria-label={t('srm.actions', { name: row.original.name })}
              />
            }
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent className='w-auto min-w-40' align='end'>
            <DropdownMenuItem render={<Link to={`${row.original.id}/edit`} />}>
              {t('srm.apiKeysRename')}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant={row.original.enabled ? 'destructive' : 'default'}
              disabled={isExpired(row.original.expiresAt)}
              onClick={() => {
                setError('');
                setAction({
                  row: row.original,
                  type: row.original.enabled ? 'disable' : 'enable',
                });
              }}
            >
              {t(row.original.enabled ? 'srm.disable' : 'srm.enable')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant='destructive'
              onClick={() => {
                setError('');
                setAction({ row: row.original, type: 'delete' });
              }}
            >
              {t('srm.apiKeysRevoke')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];
  async function apply() {
    if (!action || pending) return;
    setPending(true);
    setError('');
    try {
      const r =
        action.type === 'delete'
          ? await api.delete({ keyId: action.row.id })
          : await api.update({
              keyId: action.row.id,
              enabled: action.type === 'enable',
            });
      if (r.error)
        throw Object.assign(new Error(r.error.code), {
          status: r.error.status,
          reason: r.error.code,
        });
      await cache.invalidateQueries({ queryKey: ['srm-api-keys'] });
      toast.show({
        type: 'success',
        title: t(
          action.type === 'delete'
            ? 'srm.apiKeysRevoked'
            : 'srm.apiKeysChanged',
          { name: action.row.name },
        ),
      });
      setAction(null);
    } catch {
      setError(t('srm.error'));
    } finally {
      setPending(false);
    }
  }
  const newLink = (
    <Button nativeButton={false} render={<Link to='new' />}>
      {t('srm.apiKeysCreate')}
    </Button>
  );
  return (
    <>
      <PageContainer>
        <PageHeader
          title={t('srm.apiKeysTitle')}
          description={t('srm.apiKeysDescription')}
          actions={
            <>
              {!!q.data?.length && newLink}
              <Refresh
                pending={q.isFetching}
                onClick={() => void q.refetch()}
              />
            </>
          }
        />
        <p className='text-sm text-muted-foreground'>{t('srm.apiKeysHint')}</p>
        <Input
          value={search}
          placeholder={t('srm.apiKeysSearch')}
          aria-label={t('srm.apiKeysSearch')}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <State
          loading={q.isPending}
          error={q.error}
          retry={() => void q.refetch()}
          empty={q.data?.length === 0}
          emptyLabel={t('srm.apiKeysEmpty')}
          emptyDescription={t('srm.apiKeysEmptyDescription')}
          emptyAction={newLink}
        />
        {q.data?.length ? (
          rows.length ? (
            <>
              <DataTable
                data={rows.slice((page - 1) * 20, page * 20)}
                columns={columns}
                sorting={[{ id: sort, desc }]}
                onSort={(v) => {
                  setSort(v[0]?.id ?? 'createdAt');
                  setDesc(v[0]?.desc ?? true);
                  setPage(1);
                }}
              />
              <div className='flex flex-wrap items-center justify-between gap-3'>
                <span>{t('srm.total', { count: rows.length })}</span>
                <div className='flex gap-3'>
                  <Button
                    variant='outline'
                    disabled={page === 1}
                    onClick={() => setPage(page - 1)}
                  >
                    {t('srm.previous')}
                  </Button>
                  <Button
                    variant='outline'
                    disabled={page * 20 >= rows.length}
                    onClick={() => setPage(page + 1)}
                  >
                    {t('srm.next')}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <State
              loading={false}
              empty
              emptyLabel={t('srm.noResults')}
              clear={() => setSearch('')}
            />
          )
        ) : null}
      </PageContainer>
      <Outlet />
      <AlertDialog
        open={!!action}
        onOpenChange={(v) => {
          if (!v && !pending) setAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t(
                action?.type === 'delete'
                  ? 'srm.apiKeysRevokeTitle'
                  : action?.type === 'enable'
                    ? 'srm.apiKeysEnableTitle'
                    : 'srm.apiKeysDisableTitle',
                { name: action?.row.name },
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                action?.type === 'delete'
                  ? 'srm.apiKeysRevokeNotice'
                  : action?.type === 'enable'
                    ? 'srm.apiKeysEnableNotice'
                    : 'srm.apiKeysDisableNotice',
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <Alert variant='destructive'>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>
              {t('srm.cancel')}
            </AlertDialogCancel>
            <Button
              variant={action?.type === 'enable' ? 'default' : 'destructive'}
              disabled={pending}
              onClick={() => void apply()}
            >
              {pending && <Spinner />}
              {t(
                action?.type === 'delete'
                  ? 'srm.apiKeysRevoke'
                  : action?.type === 'enable'
                    ? 'srm.enable'
                    : 'srm.disable',
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
export function ApiKeyForm() {
  const { id } = useParams(),
    { t } = useTranslation(),
    [pending, setPending] = useState(false),
    [secret, setSecret] = useState(''),
    [dirty, setDirty] = useState(false),
    guard = useDirtyClose(
      dirty || !!secret,
      pending,
      secret
        ? {
            title: t('srm.secretClose'),
            description: t('srm.secretCloseNotice'),
          }
        : undefined,
    );
  return (
    <>
      <RouteDialog
        className='sm:max-w-md'
        title={t(id ? 'srm.apiKeysRename' : 'srm.apiKeysCreate')}
        beforeClose={guard.beforeClose}
        footer={
          secret ? (
            <Done />
          ) : (
            <FormActions
              formId='api-key-form'
              pending={pending}
              label={t(id ? 'srm.save' : 'srm.create')}
            />
          )
        }
      >
        <KeyBody
          id={id}
          pending={pending}
          setPending={setPending}
          secret={secret}
          setSecret={setSecret}
          setDirty={setDirty}
          onSaved={guard.allowClose}
        />
      </RouteDialog>
      {guard.confirmation}
    </>
  );
}
function Done() {
  const { t } = useTranslation(),
    overlay = useRouteOverlay();
  return <Button onClick={() => void overlay.close()}>{t('srm.done')}</Button>;
}
function KeyBody({
  id,
  pending,
  setPending,
  secret,
  setSecret,
  setDirty,
  onSaved,
}: {
  id?: string;
  pending: boolean;
  setPending: (v: boolean) => void;
  secret: string;
  setSecret: (v: string) => void;
  setDirty: (v: boolean) => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation(),
    api = useAuthenticationClient().apiKey,
    cache = useQueryClient(),
    overlay = useRouteOverlay(),
    toast = useToaster();
  const detail = useQuery({
    queryKey: ['srm-api-key-edit', id, ...useSrmQueryScope()],
    queryFn: async () => {
      const r = await api.get({ query: { id: id! } });
      if (r.error)
        throw Object.assign(new Error(r.error.code), {
          status: r.error.status,
          reason: r.error.code,
        });
      return r.data;
    },
    enabled: !!id,
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const [name, setName] = useState<string | null>(null),
    [expiry, setExpiry] = useState<ApiKeyExpiryChoice>('30'),
    [error, setError] = useState(''),
    [invalid, setInvalid] = useState(false),
    [copied, setCopied] = useState('');
  const value = name ?? detail.data?.name ?? '';
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending || secret) return;
    if (!value.trim()) {
      setInvalid(true);
      document.getElementById('key-name')?.focus();
      return;
    }
    setPending(true);
    setError('');
    try {
      if (id) {
        const r = await api.update({ keyId: id, name: value.trim() });
        if (r.error)
          throw Object.assign(new Error(r.error.code), {
            status: r.error.status,
            reason: r.error.code,
          });
        setDirty(false);
        await cache.invalidateQueries({ queryKey: ['srm-api-keys'] });
        onSaved();
        toast.show({
          type: 'success',
          title: t('srm.apiKeysSaved', { name: value }),
        });
        await overlay.close();
      } else {
        const r = await api.create({
          name: value.trim(),
          expiresIn: expiryChoiceToSeconds(expiry),
        });
        if (r.error)
          throw Object.assign(new Error(r.error.code), {
            status: r.error.status,
            reason: r.error.code,
          });
        setDirty(false);
        setSecret(r.data.key);
        await cache.invalidateQueries({ queryKey: ['srm-api-keys'] });
      }
    } catch {
      setError(t('srm.error'));
    } finally {
      setPending(false);
    }
  }
  if (id && (detail.isPending || detail.isFetching || detail.error))
    return (
      <State
        loading={detail.isPending || detail.isFetching}
        error={detail.error}
        retry={() => void detail.refetch()}
      />
    );
  if (secret)
    return (
      <div className='flex flex-col gap-4'>
        <p>{t('srm.apiKeysOnce')}</p>
        <Input
          readOnly
          value={secret}
          aria-label={t('srm.apiKeysTitle')}
          autoComplete='off'
        />
        <Button
          variant='outline'
          onClick={() => {
            void navigator.clipboard
              .writeText(secret)
              .then(() => setCopied(t('srm.apiKeysCopied')))
              .catch(() => setCopied(t('srm.apiKeysCopyFailed')));
          }}
        >
          {t('srm.apiKeysCopy')}
        </Button>
        <p role='status'>{copied}</p>
      </div>
    );
  return (
    <form
      id='api-key-form'
      className='flex flex-col gap-4'
      onSubmit={(e) => void submit(e)}
    >
      <Field>
        <FieldLabel htmlFor='key-name'>{t('srm.apiKeysName')} *</FieldLabel>
        <Input
          id='key-name'
          value={value}
          disabled={pending}
          autoComplete='off'
          onChange={(e) => {
            setName(e.target.value);
            setDirty(true);
            if (invalid && e.target.value.trim()) setInvalid(false);
          }}
          aria-invalid={invalid}
        />
        <FieldError errors={invalid ? [{ message: t('srm.required') }] : []} />
      </Field>
      {!id && (
        <Field>
          <FieldLabel htmlFor='key-expiry'>{t('srm.apiKeysExpiry')}</FieldLabel>
          <NativeSelect
            id='key-expiry'
            disabled={pending}
            value={expiry}
            onChange={(e) => {
              setExpiry(e.target.value as ApiKeyExpiryChoice);
              setDirty(true);
            }}
          >
            {API_KEY_EXPIRY_CHOICES.map((x) => (
              <NativeSelectOption key={x} value={x}>
                {t(x === 'never' ? 'srm.apiKeysNever' : 'srm.apiKeysDays', {
                  count: Number(x),
                })}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      )}
      <p className='text-sm text-muted-foreground'>{t('srm.apiKeysHint')}</p>
      {error && (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
