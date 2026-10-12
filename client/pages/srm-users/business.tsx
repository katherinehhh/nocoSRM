import { useSrmQueryScope } from '#hooks/use-srm-query-scope';
import { useState, useRef } from 'react';
import { useParams } from 'react-router';
import { useApiClient, useToaster } from '@nocobase/app-client';
import {
  useCan,
  useAuthorizationClient,
} from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ManagedUser } from '@nocobase/app-plugin-users/client/user-client';
import { RouteDialog } from '#components/route-dialog';
import { useRouteOverlay } from '#components/use-route-overlay';
import { useDirtyClose } from '#hooks/use-dirty-close';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { NativeSelect, NativeSelectOption } from '#components/ui/native-select';
import { Field, FieldLabel, FieldError } from '#components/ui/field';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Spinner } from '#components/ui/spinner';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '#components/ui/alert-dialog';
import { State, FormActions } from '../showcase/states.js';
interface Profile {
  supplierId: string | null;
  supplierName?: string | null;
  organizationId: string;
  version: number;
  enabled: boolean;
}
export default function BusinessProfile() {
  const { id } = useParams(),
    { t } = useTranslation(),
    api = useApiClient(),
    user = useQuery({
      queryKey: ['srm-user', id, ...useSrmQueryScope()],
      queryFn: () =>
        api.request<{ data: ManagedUser }>({ path: `srm/users/${id}` }),
      retry: false,
      refetchOnWindowFocus: false,
    }),
    profile = useQuery({
      queryKey: ['srm-profile', id, ...useSrmQueryScope()],
      queryFn: () =>
        api.request<{ data: Profile | null }>({
          path: `srm/users/${id}/business-profile`,
        }),
      retry: false,
      refetchOnWindowFocus: false,
    }),
    [pending, setPending] = useState(false),
    [dirty, setDirty] = useState(false),
    guard = useDirtyClose(dirty, pending),
    canEdit = useCan({
      resource: { type: 'settings', id: 'operations.admin' },
      action: 'update',
    }).can;
  return (
    <>
      <RouteDialog
        className='sm:max-w-2xl'
        title={t('srm.membershipTitle', { name: user.data?.data.name ?? '' })}
        beforeClose={guard.beforeClose}
        footer={
          canEdit && (
            <FormActions
              formId='business-profile'
              pending={pending}
              label={t('srm.save')}
            />
          )
        }
      >
        <State
          loading={
            user.isPending ||
            user.isFetching ||
            profile.isPending ||
            profile.isFetching
          }
          error={user.error || profile.error}
          retry={() => {
            void user.refetch();
            void profile.refetch();
          }}
        />
        {user.data &&
          profile.data &&
          !profile.error &&
          !user.error &&
          !user.isFetching &&
          !profile.isFetching && (
            <BusinessBody
              key={String(profile.data.data?.version ?? 0)}
              id={id!}
              name={user.data.data.name}
              profile={profile.data.data}
              pending={pending}
              canEdit={canEdit}
              setPending={setPending}
              setDirty={setDirty}
              onSaved={guard.allowClose}
            />
          )}
      </RouteDialog>
      {guard.confirmation}
    </>
  );
}
function BusinessBody({
  id,
  name,
  profile,
  pending,
  canEdit,
  setPending,
  setDirty,
  onSaved,
}: {
  id: string;
  name: string;
  profile: Profile | null;
  pending: boolean;
  canEdit: boolean;
  setPending: (v: boolean) => void;
  setDirty: (v: boolean) => void;
  onSaved: () => void;
}) {
  const scopeKey = useSrmQueryScope();
  const requestRef = useRef<{ digest: string; id: string } | null>(null);
  const { t } = useTranslation(),
    api = useApiClient(),
    cache = useQueryClient(),
    authz = useAuthorizationClient(),
    overlay = useRouteOverlay(),
    toast = useToaster(),
    [type, setType] = useState(profile?.supplierId ? 'supplier' : 'internal'),
    [supplier, setSupplier] = useState(profile?.supplierId ?? ''),
    [label, setLabel] = useState(
      () => profile?.supplierName ?? t('srm.unavailableSupplier'),
    ),
    [enabled, setEnabled] = useState(profile?.enabled ?? false),
    [search, setSearch] = useState(''),
    [q, setQ] = useState(''),
    [page, setPage] = useState(1),
    [error, setError] = useState(''),
    [invalid, setInvalid] = useState(false),
    [confirm, setConfirm] = useState(false),
    [conflict, setConflict] = useState(false);
  const options = useQuery({
    queryKey: ['srm-business-suppliers', q, page, ...useSrmQueryScope()],
    queryFn: () =>
      api.request<{
        data: { id: string; name: string }[];
        meta: { total: number };
      }>({ path: 'srm/suppliers', query: { q, page } }),
    enabled: type === 'supplier',
    retry: false,
    refetchOnWindowFocus: false,
  });
  async function save() {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      const body = {
        organizationId: 'main',
        supplierId: type === 'supplier' ? supplier : null,
        enabled,
        expectedVersion: profile?.version ?? 0,
      };
      const digest = JSON.stringify(body);
      if (requestRef.current?.digest !== digest)
        requestRef.current = { digest, id: crypto.randomUUID() };
      const r = await api.request<{ data: Profile }>({
        path: `srm/users/${id}/business-profile`,
        method: 'PUT',
        json: { ...body, requestId: requestRef.current.id },
      });
      onSaved();
      cache.setQueryData(['srm-profile', id, ...scopeKey], r);
      authz.invalidate();
      await cache.invalidateQueries({ queryKey: ['srm-users'] });
      toast.show({
        type: 'success',
        title: t('srm.membershipSaved', { name }),
      });
      await overlay.close();
    } catch (e) {
      const reason =
        e instanceof Error && 'reason' in e ? String(e.reason) : '';
      setConflict(reason === 'CONFLICT');
      setError(
        t(
          reason === 'CONFLICT'
            ? 'srm.conflict'
            : reason === 'SUPPLIER_REQUIRED'
              ? 'srm.supplierRequired'
              : 'srm.error',
        ),
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <form
        id='business-profile'
        className='flex flex-col gap-4'
        onSubmit={(e) => {
          e.preventDefault();
          if (type === 'supplier' && !supplier) {
            setInvalid(true);
            document.getElementById('business-supplier')?.focus();
            return;
          }
          setConfirm(true);
        }}
      >
        <p className='text-sm text-muted-foreground'>
          {t('srm.membershipHint')}
        </p>
        <p>
          {t(
            !profile
              ? 'srm.notBound'
              : profile.enabled
                ? 'srm.membershipEnabled'
                : 'srm.membershipDisabled',
          )}
        </p>
        <fieldset
          disabled={!canEdit || pending}
          className='flex flex-col gap-4'
        >
          <Field>
            <FieldLabel htmlFor='business-type'>
              {t('srm.membership')} *
            </FieldLabel>
            <NativeSelect
              id='business-type'
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setDirty(true);
              }}
            >
              <NativeSelectOption value='internal'>
                {t('srm.internal')}
              </NativeSelectOption>
              <NativeSelectOption value='supplier'>
                {t('srm.supplierMember')}
              </NativeSelectOption>
            </NativeSelect>
          </Field>
          {type === 'supplier' && (
            <Field>
              <FieldLabel htmlFor='business-supplier'>
                {t('srm.supplier')} *
              </FieldLabel>
              <div className='flex flex-wrap gap-2'>
                <Input
                  value={search}
                  aria-label={t('srm.supplierSearch')}
                  placeholder={t('srm.supplierSearch')}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => {
                    setQ(search);
                    setPage(1);
                  }}
                >
                  {t('ops.searchButton')}
                </Button>
              </div>
              <State
                loading={options.isPending}
                error={options.error}
                retry={() => void options.refetch()}
              />
              <NativeSelect
                id='business-supplier'
                value={supplier}
                aria-invalid={invalid}
                onChange={(e) => {
                  setSupplier(e.target.value);
                  setLabel(e.target.selectedOptions[0]?.text ?? e.target.value);
                  setDirty(true);
                  setInvalid(false);
                }}
              >
                <NativeSelectOption value=''>
                  {t('srm.supplierRequired')}
                </NativeSelectOption>
                {supplier &&
                  !options.data?.data.some((o) => o.id === supplier) && (
                    <NativeSelectOption value={supplier}>
                      {label}
                    </NativeSelectOption>
                  )}
                {options.data?.data.map((o) => (
                  <NativeSelectOption key={o.id} value={o.id}>
                    {o.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <div className='flex gap-2'>
                <Button
                  type='button'
                  variant='outline'
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  {t('srm.previous')}
                </Button>
                <Button
                  type='button'
                  variant='outline'
                  disabled={page * 20 >= (options.data?.meta.total ?? 0)}
                  onClick={() => setPage(page + 1)}
                >
                  {t('srm.next')}
                </Button>
              </div>
              <FieldError
                errors={invalid ? [{ message: t('srm.supplierRequired') }] : []}
              />
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor='business-enabled'>
              {t('srm.businessAccess')}
            </FieldLabel>
            <NativeSelect
              id='business-enabled'
              value={enabled ? 'enabled' : 'disabled'}
              onChange={(e) => {
                setEnabled(e.target.value === 'enabled');
                setDirty(true);
              }}
            >
              <NativeSelectOption value='disabled'>
                {t('srm.membershipDisabled')}
              </NativeSelectOption>
              <NativeSelectOption value='enabled'>
                {t('srm.membershipEnabled')}
              </NativeSelectOption>
            </NativeSelect>
          </Field>
        </fieldset>
        {error && (
          <Alert variant='destructive'>
            <AlertDescription>
              {error}
              {conflict && (
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => {
                    setConfirm(false);
                    void cache.invalidateQueries({
                      queryKey: ['srm-profile', id, ...scopeKey],
                    });
                  }}
                >
                  {t('srm.loadLatest')}
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}
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
              {t('srm.membershipConfirm', { name })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('srm.membershipConsequence')}{' '}
              {profile?.supplierId
                ? (profile.supplierName ?? t('srm.unavailableSupplier'))
                : t('srm.internal')}{' '}
              → {type === 'supplier' ? label : t('srm.internal')} ·{' '}
              {t(enabled ? 'srm.membershipEnabled' : 'srm.membershipDisabled')}
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
            <Button disabled={pending} onClick={() => void save()}>
              {pending && <Spinner />}
              {t('srm.save')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
