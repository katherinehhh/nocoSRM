import { useSrmQueryScope } from '#hooks/use-srm-query-scope';
import { Checkbox } from '#components/ui/checkbox';
import { useMemo, useState } from 'react';
import { Link, Outlet, useParams, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiClient, useToaster } from '@nocobase/app-client';
import {
  UsersClient,
  type ManagedUser,
  type UsersOptions,
  type UserRoleValue,
  type UserRoleScopeOption,
} from '@nocobase/app-plugin-users/client/user-client';
import {
  useCan,
  useAuthorizationClient,
} from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
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
import { failure } from '../operations/common.js';
function useUsersClient() {
  const api = useApiClient();
  return useMemo(() => new UsersClient(api), [api]);
}
function useUserPermission(action: string, id = '*') {
  return useCan({ resource: { type: 'user', id }, action }).can;
}
function useUser(id?: string) {
  const api = useApiClient();
  return useQuery({
    queryKey: ['srm-user', id, ...useSrmQueryScope()],
    queryFn: () =>
      api.request<{ data: ManagedUser }>({ path: `srm/users/${id}` }),
    enabled: !!id,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
function roleValues(value?: UserRoleValue): readonly string[] {
  return typeof value === 'string' ? [value] : (value ?? []);
}
function roleLabel(
  o: { label: string; labelI18nKey?: string; labelI18nNs?: string },
  t: ReturnType<typeof useTranslation>['t'],
) {
  return o.labelI18nKey
    ? t(o.labelI18nKey, { ns: o.labelI18nNs, defaultValue: o.label })
    : o.label;
}
export default function UsersPage() {
  const { t } = useTranslation(),
    client = useUsersClient(),
    [params, setParams] = useSearchParams(),
    [search, setSearch] = useState(params.get('q') ?? ''),
    page = Number(params.get('page') ?? 1),
    create = useUserPermission('create'),
    assign = useUserPermission('assign-role');
  const options = useQuery({
      queryKey: ['srm-users-options', ...useSrmQueryScope()],
      queryFn: () => client.options(),
      retry: false,
      refetchOnWindowFocus: false,
    }),
    list = useQuery({
      queryKey: ['srm-users', params.toString(), ...useSrmQueryScope()],
      queryFn: () =>
        client.list({
          q: params.get('q') ?? '',
          page,
          pageSize: 20,
          status: (params.get('status') || undefined) as
            'enabled' | 'disabled' | undefined,
          roleScope: params.get('roleScope') || undefined,
          role: params.get('role') || undefined,
        }),
      retry: false,
      refetchOnWindowFocus: false,
    });
  const committedQuery = params.get('q') ?? '';
  const [previousQuery, setPreviousQuery] = useState(committedQuery);
  if (previousQuery !== committedQuery) {
    setPreviousQuery(committedQuery);
    setSearch(committedQuery);
  }
  const change = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };
  const columns: ColumnDef<ManagedUser>[] = [
    { accessorKey: 'name', header: t('srm.name'), enableSorting: false },
    { accessorKey: 'email', header: t('srm.email'), enableSorting: false },
    {
      id: 'roles',
      header: t('srm.roles'),
      enableSorting: false,
      cell: ({ row }) =>
        Object.entries(row.original.roleScopes)
          .flatMap(([key, val]) =>
            roleValues(val).map((v) => {
              const o = options.data?.roleScopes
                .find((s) => s.key === key)
                ?.options.find((o) => o.value === v);
              return o ? roleLabel(o, t) : v;
            }),
          )
          .join('、') || '—',
    },
    {
      id: 'status',
      header: t('srm.status'),
      enableSorting: false,
      cell: ({ row }) => (
        <Badge variant='secondary'>
          {t(row.original.disabledAt ? 'srm.disabled' : 'srm.enabled')}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: t('showcase.actions'),
      enableSorting: false,
      cell: ({ row }) => (
        <UserActions record={row.original} options={options.data} />
      ),
    },
  ];
  const newLink =
    create && assign ? (
      <Button
        nativeButton={false}
        render={<Link to={{ pathname: 'new', search: `?${params}` }} />}
      >
        {t('srm.newUser')}
      </Button>
    ) : undefined;
  return (
    <>
      <PageContainer>
        <PageHeader
          title={t('srm.users')}
          description={t('srm.usersDescription')}
          actions={
            <>
              {!!list.data?.items.length && newLink}
              <Refresh
                pending={list.isFetching || options.isFetching}
                onClick={() => {
                  void list.refetch();
                  void options.refetch();
                }}
              />
            </>
          }
        />
        <form
          className='flex flex-wrap gap-3'
          onSubmit={(e) => {
            e.preventDefault();
            change('q', search);
          }}
        >
          <Input
            className='min-w-52 flex-1'
            placeholder={t('srm.userSearch')}
            aria-label={t('srm.userSearch')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button variant='outline' type='submit'>
            {t('ops.searchButton')}
          </Button>
          <NativeSelect
            aria-label={t('srm.status')}
            value={params.get('status') ?? ''}
            onChange={(e) => change('status', e.target.value)}
          >
            <NativeSelectOption value=''>
              {t('ops.allStatus')}
            </NativeSelectOption>
            <NativeSelectOption value='enabled'>
              {t('srm.enabled')}
            </NativeSelectOption>
            <NativeSelectOption value='disabled'>
              {t('srm.disabled')}
            </NativeSelectOption>
          </NativeSelect>
          <NativeSelect
            aria-label={t('srm.roleScope')}
            value={params.get('roleScope') ?? ''}
            onChange={(e) => {
              const next = new URLSearchParams(params);
              next.set('roleScope', e.target.value);
              next.delete('role');
              next.delete('page');
              setParams(next, { replace: true });
            }}
          >
            <NativeSelectOption value=''>
              {t('srm.roleScope')}
            </NativeSelectOption>
            {options.data?.roleScopes.map((s) => (
              <NativeSelectOption key={s.key} value={s.key}>
                {roleLabel(s, t)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {params.get('roleScope') && (
            <NativeSelect
              aria-label={t('srm.roles')}
              value={params.get('role') ?? ''}
              onChange={(e) => change('role', e.target.value)}
            >
              <NativeSelectOption value=''>{t('srm.roles')}</NativeSelectOption>
              {options.data?.roleScopes
                .find((s) => s.key === params.get('roleScope'))
                ?.options.map((o) => (
                  <NativeSelectOption key={o.value} value={o.value}>
                    {roleLabel(o, t)}
                  </NativeSelectOption>
                ))}
            </NativeSelect>
          )}
          {params.toString() && (
            <Button
              type='button'
              variant='ghost'
              onClick={() => {
                setSearch('');
                setParams({});
              }}
            >
              {t('srm.clear')}
            </Button>
          )}
        </form>
        <State
          loading={list.isPending || options.isPending}
          error={list.error || options.error}
          retry={() => {
            void list.refetch();
            void options.refetch();
          }}
          empty={list.data?.items.length === 0}
          emptyLabel={
            params.get('q') || params.get('status') || params.get('role')
              ? t('srm.noResults')
              : undefined
          }
          emptyDescription={
            params.get('q') || params.get('status') || params.get('role')
              ? undefined
              : t('srm.noUsersDescription')
          }
          emptyAction={newLink}
        />
        {!!list.data?.items.length && !list.error && !options.error && (
          <>
            <DataTable
              data={[...list.data.items]}
              columns={columns}
              sorting={[]}
              onSort={() => {}}
            />
            <div className='flex items-center justify-between gap-3'>
              <span>{t('srm.total', { count: list.data.total })}</span>
              <div className='flex gap-3'>
                <Button
                  variant='outline'
                  disabled={page === 1}
                  onClick={() => change('page', String(page - 1))}
                >
                  {t('srm.previous')}
                </Button>
                <Button
                  variant='outline'
                  disabled={page * 20 >= list.data.total}
                  onClick={() => change('page', String(page + 1))}
                >
                  {t('srm.next')}
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
function UserActions({
  record,
  options,
}: {
  record: ManagedUser;
  options?: UsersOptions;
}) {
  const { t } = useTranslation(),
    client = useUsersClient(),
    cache = useQueryClient(),
    authz = useAuthorizationClient(),
    toast = useToaster(),
    edit = useUserPermission('update', record.id),
    assign = useUserPermission('assign-role', record.id),
    enable = useUserPermission(
      record.disabledAt ? 'enable' : 'disable',
      record.id,
    ),
    profile = useCan({
      resource: { type: 'settings', id: 'operations.admin' },
      action: 'read',
    }).can;
  const [confirm, setConfirm] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState(''),
    [params] = useSearchParams();
  async function apply() {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      await (record.disabledAt
        ? client.enable(record.id)
        : client.disable(record.id));
      authz.invalidate();
      await cache.invalidateQueries({ queryKey: ['srm-users'] });
      toast.show({
        type: 'success',
        title: t('srm.userSaved', { name: record.name }),
      });
      setConfirm(false);
    } catch (e) {
      setError(
        t(`showcase.errors.${failure(e)}`, { defaultValue: t('srm.error') }),
      );
    } finally {
      setPending(false);
    }
  }
  if (!edit && !assign && !enable && !profile) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              size='icon-sm'
              variant='ghost'
              aria-label={t('srm.actions', { name: record.name })}
            />
          }
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent className='w-auto min-w-40' align='end'>
          {edit && (
            <DropdownMenuItem
              render={
                <Link
                  to={{ pathname: `edit/${record.id}`, search: `?${params}` }}
                />
              }
            >
              {t('srm.edit')}
            </DropdownMenuItem>
          )}
          {assign &&
            options?.roleScopes.map((s) => (
              <DropdownMenuItem
                key={s.key}
                render={
                  <Link
                    to={{
                      pathname: `roles/${record.id}/${encodeURIComponent(s.key)}`,
                      search: `?${params}`,
                    }}
                  />
                }
              >
                {t('srm.roles')} · {roleLabel(s, t)}
              </DropdownMenuItem>
            ))}
          {profile && (
            <DropdownMenuItem
              render={
                <Link
                  to={{
                    pathname: `business/${record.id}`,
                    search: `?${params}`,
                  }}
                />
              }
            >
              {t('srm.membership')}
            </DropdownMenuItem>
          )}
          {enable && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant={record.disabledAt ? 'default' : 'destructive'}
                onClick={() => {
                  setError('');
                  setConfirm(true);
                }}
              >
                {t(record.disabledAt ? 'srm.enable' : 'srm.disable')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog
        open={confirm}
        onOpenChange={(v) => {
          if (!pending) setConfirm(v);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t(
                record.disabledAt
                  ? 'srm.enableUserTitle'
                  : 'srm.disableUserTitle',
                { name: record.name },
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                record.disabledAt
                  ? 'srm.enableUserNotice'
                  : 'srm.disableUserNotice',
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
              variant={record.disabledAt ? 'default' : 'destructive'}
              disabled={pending}
              onClick={() => void apply()}
            >
              {pending && <Spinner />}
              {t(record.disabledAt ? 'srm.enable' : 'srm.disable')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
export function UserForm() {
  const { id, scope } = useParams(),
    { t } = useTranslation(),
    client = useUsersClient(),
    user = useUser(id),
    options = useQuery({
      queryKey: ['srm-users-options', ...useSrmQueryScope()],
      queryFn: () => client.options(),
      retry: false,
      refetchOnWindowFocus: false,
    }),
    [pending, setPending] = useState(false),
    [dirty, setDirty] = useState(false),
    guard = useDirtyClose(dirty, pending),
    allowed = useUserPermission(
      scope ? 'assign-role' : id ? 'update' : 'create',
      id ?? '*',
    ),
    assign = useUserPermission('assign-role');
  return (
    <>
      <RouteDialog
        className='sm:max-w-2xl'
        title={t(
          scope ? 'srm.rolesTitle' : id ? 'srm.editUser' : 'srm.newUser',
          { name: user.data?.data.name ?? '' },
        )}
        beforeClose={guard.beforeClose}
        footer={
          <FormActions
            formId='srm-user-form'
            pending={pending}
            label={t(id ? 'srm.save' : 'srm.create')}
          />
        }
      >
        <State
          loading={
            options.isPending ||
            options.isFetching ||
            (!!id && (user.isPending || user.isFetching))
          }
          error={options.error || user.error}
          retry={() => {
            void options.refetch();
            void user.refetch();
          }}
        />
        {!allowed || (!id && !assign) ? (
          <p>{t('srm.forbidden')}</p>
        ) : (
          options.data &&
          !options.error &&
          !options.isFetching &&
          (!id || (user.data && !user.error && !user.isFetching)) && (
            <UserBody
              key={`${id ?? 'new'}:${scope ?? 'identity'}`}
              record={user.data?.data}
              options={options.data}
              scope={scope}
              pending={pending}
              setPending={setPending}
              setDirty={setDirty}
              onSaved={guard.allowClose}
            />
          )
        )}
      </RouteDialog>
      {guard.confirmation}
    </>
  );
}
function UserBody({
  record,
  options,
  scope,
  pending,
  setPending,
  setDirty,
  onSaved,
}: {
  record?: ManagedUser;
  options: UsersOptions;
  scope?: string;
  pending: boolean;
  setPending: (v: boolean) => void;
  setDirty: (v: boolean) => void;
  onSaved: () => void;
}) {
  const scopeKey = useSrmQueryScope();
  const { t, i18n } = useTranslation(),
    client = useUsersClient(),
    api = useApiClient(),
    cache = useQueryClient(),
    overlay = useRouteOverlay(),
    authz = useAuthorizationClient(),
    toast = useToaster();
  const [name, setName] = useState(record?.name ?? ''),
    [email, setEmail] = useState(record?.email ?? ''),
    [username, setUsername] = useState(record?.username ?? ''),
    [password, setPassword] = useState(''),
    [roles, setRoles] = useState<Record<string, UserRoleValue>>({
      ...record?.roleScopes,
    }),
    [baseline, setBaseline] = useState(record?.roleScopes),
    [error, setError] = useState(''),
    [invalid, setInvalid] = useState(''),
    [conflict, setConflict] = useState(false),
    [confirm, setConfirm] = useState(false);
  const scopes = scope
    ? options.roleScopes.filter((s) => s.key === scope)
    : !record
      ? options.roleScopes
      : [];
  async function reload() {
    if (!record) return;
    try {
      const [r, freshOptions] = await Promise.all([
        api.request<{ data: ManagedUser }>({ path: `srm/users/${record.id}` }),
        client.options(),
      ]);
      cache.setQueryData(['srm-users-options', ...scopeKey], freshOptions);
      setRoles({ ...r.data.roleScopes });
      setBaseline(r.data.roleScopes);
      setConflict(false);
      setError('');
      setDirty(false);
      setConfirm(false);
    } catch {
      setError(t('srm.error'));
    }
  }
  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (pending) return;
    let field = '';
    if (!scope) {
      field = !name.trim()
        ? 'name'
        : !/^\S+@\S+\.\S+$/.test(email)
          ? 'email'
          : !record && !password
            ? 'password'
            : '';
    }
    if (
      !record &&
      scopes.some((s) => s.requiredOnCreate && !roleValues(roles[s.key]).length)
    )
      field = 'roles';
    if (field) {
      setInvalid(field);
      document.getElementById(`user-${field}`)?.focus();
      return;
    }
    if (scope && record && !confirm) {
      const before = roleValues(baseline?.[scope]),
        after = roleValues(roles[scope]);
      if (before.some((v) => v && !after.includes(v))) {
        setConfirm(true);
        return;
      }
    }
    setPending(true);
    setError('');
    try {
      let saved: ManagedUser;
      if (scope && record) {
        const [latest, freshOptions] = await Promise.all([
          api.request<{ data: ManagedUser }>({
            path: `srm/users/${record.id}`,
          }),
          client.options(),
        ]);
        if (
          JSON.stringify(latest.data.roleScopes[scope]) !==
            JSON.stringify(baseline?.[scope]) ||
          JSON.stringify(
            freshOptions.roleScopes.find((s) => s.key === scope),
          ) !== JSON.stringify(options.roleScopes.find((s) => s.key === scope))
        ) {
          setConflict(true);
          throw new Error('CONFLICT');
        }
        saved = await client.replaceRoleScope(
          record.id,
          scope,
          roles[scope] ?? (scopes[0]?.selection === 'single' ? '' : []),
        );
      } else if (record) {
        saved = await client.update(record.id, {
          ...(name !== record.name ? { name: name.trim() } : {}),
          ...(email !== record.email ? { email: email.trim() } : {}),
          ...(username !== (record.username ?? '')
            ? { username: username.trim() || null }
            : {}),
        });
      } else {
        saved = await client.create({
          name: name.trim(),
          email: email.trim(),
          username: username.trim() || undefined,
          password,
          roleScopes: roles,
        });
        setPassword('');
      }
      onSaved();
      authz.invalidate();
      cache.setQueryData(['srm-user', saved.id], { data: saved });
      await cache.invalidateQueries({ queryKey: ['srm-users'] });
      toast.show({
        type: 'success',
        title: t('srm.userSaved', { name: saved.name }),
      });
      await overlay.close();
    } catch (e) {
      const reason = failure(e);
      setError(
        t(`showcase.errors.${reason}`, {
          defaultValue: t(
            e instanceof Error && e.message === 'CONFLICT'
              ? 'srm.conflict'
              : 'srm.error',
          ),
        }),
      );
      if (reason === 'USER_EMAIL_CONFLICT') {
        setInvalid('email');
        document.getElementById('user-email')?.focus();
      }
      if (reason === 'USER_USERNAME_CONFLICT') {
        setInvalid('username');
        document.getElementById('user-username')?.focus();
      }
    } finally {
      setPending(false);
    }
  }
  function update(set: (v: string) => void, v: string, key: string) {
    set(v);
    setDirty(true);
    if (invalid === key) setInvalid('');
  }
  const identityFields: [string, string, (value: string) => void][] = [
    ['name', name, setName],
    ['email', email, setEmail],
    ['username', username, setUsername],
  ];
  if (!record) identityFields.push(['password', password, setPassword]);
  return (
    <>
      <form
        id='srm-user-form'
        className='flex flex-col gap-4'
        onSubmit={(e) => void submit(e)}
      >
        <fieldset disabled={pending} className='flex flex-col gap-4'>
          {!scope && (
            <>
              {identityFields.map(([key, value, set]) => (
                <Field key={String(key)}>
                  <FieldLabel htmlFor={`user-${key}`}>
                    {t(`srm.${key}`)}
                    {key === 'username' ? '' : ' *'}
                  </FieldLabel>
                  <Input
                    id={`user-${key}`}
                    type={
                      key === 'password'
                        ? 'password'
                        : key === 'email'
                          ? 'email'
                          : 'text'
                    }
                    autoComplete={key === 'password' ? 'new-password' : 'off'}
                    value={String(value)}
                    aria-invalid={invalid === key}
                    onChange={(e) => update(set, e.target.value, String(key))}
                  />
                  <FieldError
                    errors={
                      invalid === key
                        ? [
                            {
                              message: t(
                                key === 'email'
                                  ? 'srm.invalidEmail'
                                  : 'srm.required',
                              ),
                            },
                          ]
                        : []
                    }
                  />
                </Field>
              ))}
              {record && (
                <p className='text-sm text-muted-foreground'>
                  {t('srm.createdAt')}:{' '}
                  {new Date(record.createdAt).toLocaleString(i18n.language)} ·{' '}
                  {t('srm.updatedAt')}:{' '}
                  {new Date(record.updatedAt).toLocaleString(i18n.language)}
                </p>
              )}
              {!record && (
                <p className='text-sm text-muted-foreground'>
                  {t('srm.passwordHint')} · {t('srm.notBound')}
                </p>
              )}
            </>
          )}
          {scope && (
            <div className='flex flex-col gap-2 text-sm'>
              <p>
                {t('srm.rolesCurrent')}:{' '}
                {roleValues(baseline?.[scope])
                  .map((v) => {
                    const o = scopes[0]?.options.find((o) => o.value === v);
                    return o ? roleLabel(o, t) : v;
                  })
                  .join('、') || '—'}
              </p>
              <p>
                {t('srm.rolesProposed')}:{' '}
                {roleValues(roles[scope])
                  .map((v) => {
                    const o = scopes[0]?.options.find((o) => o.value === v);
                    return o ? roleLabel(o, t) : v;
                  })
                  .join('、') || '—'}
              </p>
            </div>
          )}
          {scopes.map((s) => (
            <RolePicker
              key={s.key}
              option={s}
              value={roles[s.key]}
              setValue={(v) => {
                setRoles({ ...roles, [s.key]: v });
                setDirty(true);
              }}
            />
          ))}
          {invalid === 'roles' && <p role='alert'>{t('srm.required')}</p>}
          {error && (
            <Alert variant='destructive'>
              <AlertDescription>
                {conflict ? t('srm.conflict') : error}
                {conflict && (
                  <Button
                    variant='outline'
                    type='button'
                    onClick={() => void reload()}
                  >
                    {t('srm.loadLatest')}
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}
        </fieldset>
      </form>
      <AlertDialog
        open={confirm}
        onOpenChange={(v) => {
          if (!pending) setConfirm(v);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('srm.roleRemovalTitle', { name: record?.name })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('srm.roleRemovalNotice')}
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
            <Button disabled={pending} onClick={() => void submit()}>
              {pending && <Spinner />}
              {t('srm.save')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
function RolePicker({
  option,
  value,
  setValue,
}: {
  option: UserRoleScopeOption;
  value?: UserRoleValue;
  setValue: (v: UserRoleValue) => void;
}) {
  const { t } = useTranslation(),
    selected = roleValues(value);
  return (
    <Field>
      <FieldLabel>
        {roleLabel(option, t)}
        {option.requiredOnCreate ? ' *' : ''}
      </FieldLabel>
      {option.selection === 'single' ? (
        <NativeSelect
          value={typeof value === 'string' ? value : (selected[0] ?? '')}
          aria-label={roleLabel(option, t)}
          disabled={option.options.some(
            (o) => selected.includes(o.value) && o.removable === false,
          )}
          onChange={(e) => setValue(e.target.value)}
        >
          <NativeSelectOption value=''>
            {t('srm.selectRole')}
          </NativeSelectOption>
          {option.options.map((o) => (
            <NativeSelectOption
              key={o.value}
              value={o.value}
              disabled={!selected.includes(o.value) && o.assignable === false}
            >
              {roleLabel(o, t)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      ) : (
        option.options.map((o) => {
          const checked = selected.includes(o.value),
            disabled = checked ? o.removable === false : o.assignable === false;
          return (
            <label key={o.value} className='flex items-start gap-2 text-sm'>
              <Checkbox
                checked={checked}
                disabled={disabled}
                onCheckedChange={(next) =>
                  setValue(
                    next
                      ? [...selected, o.value]
                      : selected.filter((v) => v !== o.value),
                  )
                }
              />
              <span>
                {roleLabel(o, t)}
                {disabled && (
                  <span className='block text-muted-foreground'>
                    {t('srm.protectedRole')}
                  </span>
                )}
              </span>
            </label>
          );
        })
      )}
      {option.hasAuthenticatedDefaultAccess && (
        <p className='text-sm text-muted-foreground'>
          {t('srm.inheritedAccess')}
        </p>
      )}
    </Field>
  );
}
