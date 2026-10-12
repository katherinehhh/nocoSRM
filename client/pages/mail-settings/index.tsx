import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Skeleton } from '#components/ui/skeleton';
import { useTranslation } from '@nocobase/i18n/client';
import {
  useApiClient,
  useToaster,
  useNavigationGuard,
} from '@nocobase/app-client';
import {
  useCan,
  useAuthorizationRevision,
} from '@nocobase/app-plugin-authorization/client';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '#components/ui/card';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import { Checkbox } from '#components/ui/checkbox';
import { Spinner } from '#components/ui/spinner';
import { Alert, AlertDescription } from '#components/ui/alert';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '#components/ui/alert-dialog';
import { useDirtyClose } from '#hooks/use-dirty-close';
import { State, Refresh } from '../showcase/states.js';
import { coreError } from '../srm-core/common.js';
import {
  ProviderFields,
  type ProviderView,
  type ProviderSettingsView,
} from '../../../shared/mail-settings.js';
type Endpoint = { host: string; port: string; secure: boolean };
type Editor = Omit<ProviderView, 'imap' | 'smtp'> & {
  secret: string;
  imap: Endpoint;
  smtp: Endpoint;
};
type Draft = { value: Editor; version: string; requestKey: string };
const editor = (p: ProviderView): Editor => ({
  ...p,
  secret: '',
  imap: { ...p.imap, port: String(p.imap.port) },
  smtp: { ...p.smtp, port: String(p.smtp.port) },
});
const fields = (p: Editor) =>
  p.type === 'imap-smtp'
    ? {
        type: p.type,
        imap: { ...p.imap, port: Number(p.imap.port) },
        smtp: { ...p.smtp, port: Number(p.smtp.port) },
      }
    : {
        type: p.type,
        clientId: p.clientId,
        ...(p.secret.trim() ? { clientSecret: p.secret } : {}),
        ...(p.type === 'microsoft'
          ? { tenant: p.tenant.trim() || 'common' }
          : {}),
      };
const invalid = (p: Editor) => {
  const result = ProviderFields.safeParse(fields(p));
  const errors = result.success
    ? []
    : result.error.issues.map((i) => i.path.join('.'));
  if (p.type !== 'imap-smtp' && !p.hasSecret && !p.secret.trim())
    errors.push('clientSecret');
  return errors;
};
export default function MailSettings() {
  const { t } = useTranslation(),
    api = useApiClient(),
    toast = useToaster(),
    cache = useQueryClient(),
    navigate = useNavigate(),
    { session } = useAuthentication(),
    revision = useAuthorizationRevision(),
    { can } = useCan({
      resource: { type: 'settings', id: 'operations.admin' },
      action: 'update',
    });
  const queryKey = ['srmMailProviders', session?.user.id, revision];
  const q = useQuery({
    queryKey,
    enabled: can && !!session,
    queryFn: ({ signal }) =>
      api.request<{ data: ProviderSettingsView }>({
        path: 'srmMail/providers',
        signal,
      }),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [drafts, setDrafts] = useState<Record<string, Draft>>({}),
    [pending, setPending] = useState(false),
    [activeAction, setActiveAction] = useState<{
      name: string;
      kind: 'save' | 'toggle';
    } | null>(null),
    [errors, setErrors] = useState<
      Record<string, { code: string; fields: string[] }>
    >({}),
    [disable, setDisable] = useState<{ name: string; key: string } | null>(
      null,
    );
  const fieldsRef = useRef<Record<string, HTMLInputElement | null>>({});
  const toggleKeys = useRef<
    Record<string, { version: string; enabled: boolean; key: string }>
  >({});
  function toggleKey(p: ProviderView) {
    const old = toggleKeys.current[p.name];
    if (old?.version === data?.version && old.enabled === p.enabled)
      return old.key;
    const key = crypto.randomUUID();
    toggleKeys.current[p.name] = {
      version: data?.version ?? '',
      enabled: p.enabled,
      key,
    };
    return key;
  }
  const dirty = Object.keys(drafts).length > 0,
    close = useDirtyClose(dirty, pending, {
      title: t('srm.discard'),
      description: t('srmMail.discardNotice'),
    }),
    data = q.data?.data;
  const leaveApproved = useRef(false);
  // The native BrowserRouter accepts a synchronous navigation guard.
  useNavigationGuard(
    () =>
      leaveApproved.current ||
      (!pending && (!dirty || window.confirm(t('srmMail.discardNotice')))),
  );
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
  function edit(p: ProviderView, update: (v: Editor) => Editor) {
    if (!data) return;
    const old = drafts[p.name] ?? {
        value: editor(p),
        version: data.version,
        requestKey: crypto.randomUUID(),
      },
      value = update(old.value);
    setDrafts({
      ...drafts,
      [p.name]: { ...old, value, requestKey: crypto.randomUUID() },
    });
    if (errors[p.name])
      setErrors({
        ...errors,
        [p.name]: {
          code:
            invalid(value).length ||
            !['INVALID', 'SECRET_REQUIRED'].includes(errors[p.name].code)
              ? errors[p.name].code
              : '',
          fields: invalid(value),
        },
      });
  }
  async function refresh() {
    if (await close.beforeClose()) {
      setPending(true);
      try {
        const result = await q.refetch();
        if (!result.error) {
          setDrafts({});
          setErrors({});
        }
      } finally {
        setPending(false);
      }
    }
  }
  async function saved(result: { data: ProviderSettingsView }, name: string) {
    cache.setQueryData(queryKey, result);
    setDrafts((old) =>
      Object.fromEntries(
        Object.entries(old)
          .filter(([key]) => key !== name)
          .map(([key, d]) => [key, { ...d, version: result.data.version }]),
      ),
    );
    setErrors((old) => {
      const next = { ...old };
      delete next[name];
      return next;
    });
    toast.show({ type: 'success', title: t('srmMail.saved', { name }) });
  }
  async function save(p: ProviderView) {
    const draft = drafts[p.name];
    if (!draft || pending) return;
    const missing = invalid(draft.value);
    if (missing.length) {
      setErrors({ ...errors, [p.name]: { code: 'INVALID', fields: missing } });
      fieldsRef.current[p.name + '.' + missing[0]]?.focus();
      return;
    }
    setPending(true);
    setActiveAction({ name: p.name, kind: 'save' });
    try {
      const result = await api.request<{ data: ProviderSettingsView }>({
        path: 'srmMail/providers',
        method: 'POST',
        json: {
          name: p.name,
          version: draft.version,
          requestKey: draft.requestKey,
          fields: fields(draft.value),
        },
      });
      await saved(result, p.name);
    } catch (e) {
      const code = coreError(e);
      setErrors((old) => ({
        ...old,
        [p.name]: {
          code,
          fields:
            code === 'SECRET_REQUIRED'
              ? ['clientSecret']
              : code === 'INVALID'
                ? invalid(draft.value)
                : [],
        },
      }));
      if (code === 'SECRET_REQUIRED')
        fieldsRef.current[p.name + '.clientSecret']?.focus();
    } finally {
      setPending(false);
      setActiveAction(null);
    }
  }
  async function toggle(p: ProviderView, key: string) {
    if (!data || pending) return;
    setPending(true);
    setActiveAction({ name: p.name, kind: 'toggle' });
    try {
      const result = await api.request<{ data: ProviderSettingsView }>({
        path: 'srmMail/providers/enabled',
        method: 'POST',
        json: {
          name: p.name,
          enabled: !p.enabled,
          version: data.version,
          requestKey: key,
        },
      });
      await saved(result, p.name);
      setDisable(null);
    } catch (e) {
      toast.show({
        type: 'error',
        title: t('srmMail.toggleFailed', { name: p.name }),
        description: errorText(coreError(e)),
      });
      setErrors((old) => ({
        ...old,
        [p.name]: { code: coreError(e), fields: [] },
      }));
    } finally {
      setPending(false);
      setActiveAction(null);
    }
  }
  const errorText = (code: string) =>
    t(`srmMail.errors.${code}`, { defaultValue: t('srmMail.errors.FAILED') });
  return (
    <PageContainer>
      <PageHeader
        title={t('srmMail.title')}
        description={t('srmMail.description')}
        actions={
          <>
            <Button
              variant='outline'
              disabled={pending}
              onClick={() => {
                void Promise.resolve(close.beforeClose()).then((ok) => {
                  if (ok) {
                    leaveApproved.current = true;
                    void navigate('/mail-accounts');
                  }
                });
              }}
            >
              {t('srmMail.accounts')}
            </Button>
            {can && (
              <Refresh
                pending={pending || q.isFetching}
                onClick={() => void refresh()}
              />
            )}
          </>
        }
      />
      {!can ? (
        <p>{t('srmMail.forbidden')}</p>
      ) : (
        <>
          {q.isPending && (
            <div
              role='status'
              aria-label={t('ops.loading')}
              className='grid gap-6'
            >
              {[1, 2, 3].map((key) => (
                <Card key={key}>
                  <CardHeader>
                    <Skeleton className='h-6 w-40' />
                    <Skeleton className='h-4 w-60' />
                  </CardHeader>
                  <CardContent className='grid gap-4'>
                    <Skeleton className='h-9 w-full' />
                    <Skeleton className='h-9 w-full' />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          <State loading={false} error={q.error} retry={() => void refresh()} />
          {data && (
            <Card>
              <CardHeader>
                <CardTitle>{t('srmMail.callback')}</CardTitle>
                <CardDescription>{t('srmMail.callbackHint')}</CardDescription>
              </CardHeader>
              <CardContent className='flex flex-col gap-2 pt-6'>
                <Label htmlFor='mail-oauth-callback'>
                  {t('srmMail.callback')}
                </Label>
                <Input
                  id='mail-oauth-callback'
                  readOnly
                  value={data.callbackUrl}
                />
                <p className='text-sm text-muted-foreground'>
                  {t('srmMail.storageHint')}
                </p>
              </CardContent>
            </Card>
          )}
          {data?.providers.map((p) => {
            const value = drafts[p.name]?.value ?? editor(p),
              err = errors[p.name];
            const field = (
              path: string,
              label: string,
              text: string,
              change: (text: string) => void,
              required = true,
              password = false,
            ) => (
              <div className='flex flex-col gap-2'>
                <Label htmlFor={p.name + '-' + path}>
                  {label}
                  {required ? ' *' : ''}
                </Label>
                <Input
                  id={p.name + '-' + path}
                  ref={(element) => {
                    fieldsRef.current[p.name + '.' + path] = element;
                  }}
                  type={password ? 'password' : 'text'}
                  autoComplete={password ? 'new-password' : 'off'}
                  value={text}
                  disabled={pending}
                  aria-invalid={err?.fields.includes(path)}
                  aria-describedby={
                    err?.fields.includes(path)
                      ? p.name + '-' + path + '-error'
                      : undefined
                  }
                  onChange={(e) => change(e.target.value)}
                />
                {err?.fields.includes(path) && (
                  <p
                    id={p.name + '-' + path + '-error'}
                    className='text-sm text-destructive'
                  >
                    {t(
                      path.endsWith('.port')
                        ? 'srmMail.invalidPort'
                        : path.endsWith('.host')
                          ? 'srmMail.invalidHost'
                          : path === 'tenant'
                            ? 'srmMail.invalidTenant'
                            : 'srmMail.required',
                    )}
                  </p>
                )}
              </div>
            );
            return (
              <Card key={p.name}>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void save(p);
                  }}
                >
                  <CardHeader>
                    <CardTitle>
                      {p.type === 'gmail'
                        ? 'Gmail'
                        : p.type === 'microsoft'
                          ? 'Microsoft 365'
                          : 'IMAP / SMTP'}
                    </CardTitle>
                    <CardDescription>
                      {t('srmMail.instance')}: {p.name} ·{' '}
                      {t(
                        p.configured
                          ? p.enabled
                            ? 'srmMail.enabled'
                            : 'srmMail.disabled'
                          : 'srmMail.unconfigured',
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className='flex flex-col gap-4'>
                    {err?.code && (
                      <Alert variant='destructive'>
                        <AlertDescription>
                          {errorText(err.code)}
                        </AlertDescription>
                      </Alert>
                    )}
                    {p.type !== 'imap-smtp' && (
                      <p className='text-sm text-muted-foreground'>
                        {t('srmMail.oauthHint')}
                      </p>
                    )}
                    {p.type === 'imap-smtp' ? (
                      <>
                        <p className='text-sm text-muted-foreground'>
                          {t('srmMail.connectionHint')}
                        </p>
                        {(['imap', 'smtp'] as const).map((ep) => (
                          <fieldset key={ep} className='flex flex-col gap-4'>
                            <legend className='mb-4 font-medium'>
                              {t('srmMail.' + ep)}
                            </legend>
                            <div className='grid gap-4 sm:grid-cols-2'>
                              {field(
                                ep + '.host',
                                t('srmMail.host'),
                                value[ep].host,
                                (text) =>
                                  edit(p, (v) => ({
                                    ...v,
                                    [ep]: { ...v[ep], host: text },
                                  })),
                              )}
                              {field(
                                ep + '.port',
                                t('srmMail.port'),
                                value[ep].port,
                                (text) =>
                                  edit(p, (v) => ({
                                    ...v,
                                    [ep]: { ...v[ep], port: text },
                                  })),
                              )}
                            </div>
                            <Label>
                              <Checkbox
                                disabled={pending}
                                checked={value[ep].secure}
                                onCheckedChange={(on) =>
                                  edit(p, (v) => ({
                                    ...v,
                                    [ep]: { ...v[ep], secure: on === true },
                                  }))
                                }
                              />
                              {t('srmMail.secure')}
                            </Label>
                          </fieldset>
                        ))}
                      </>
                    ) : (
                      <>
                        {field(
                          'clientId',
                          t('srmMail.clientId'),
                          value.clientId,
                          (text) => edit(p, (v) => ({ ...v, clientId: text })),
                        )}
                        {field(
                          'clientSecret',
                          t('srmMail.clientSecret'),
                          value.secret,
                          (text) => edit(p, (v) => ({ ...v, secret: text })),
                          !p.hasSecret,
                          true,
                        )}
                        <p className='text-sm text-muted-foreground'>
                          {t(
                            p.hasSecret
                              ? 'srmMail.secretSaved'
                              : 'srmMail.secretMissing',
                          )}
                        </p>
                        {p.type === 'microsoft' &&
                          field(
                            'tenant',
                            t('srmMail.tenant'),
                            value.tenant,
                            (text) => edit(p, (v) => ({ ...v, tenant: text })),
                            false,
                          )}
                      </>
                    )}
                    {p.configured && drafts[p.name] && (
                      <p className='text-sm text-muted-foreground'>
                        {t('srmMail.draftHint')}
                      </p>
                    )}
                    <div className='flex flex-wrap justify-end gap-2'>
                      {p.configured && (
                        <Button
                          type='button'
                          variant='outline'
                          disabled={pending || !!drafts[p.name]}
                          title={
                            drafts[p.name] ? t('srmMail.draftHint') : undefined
                          }
                          onClick={() => {
                            if (p.enabled)
                              setDisable({
                                name: p.name,
                                key: toggleKey(p),
                              });
                            else void toggle(p, toggleKey(p));
                          }}
                        >
                          {activeAction?.name === p.name &&
                            activeAction.kind === 'toggle' && <Spinner />}
                          {t(p.enabled ? 'srmMail.disable' : 'srmMail.enable')}
                        </Button>
                      )}
                      <Button
                        type='submit'
                        disabled={pending || !drafts[p.name]}
                      >
                        {activeAction?.name === p.name &&
                          activeAction.kind === 'save' && <Spinner />}
                        {t(
                          p.configured ? 'srmMail.save' : 'srmMail.saveEnable',
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </form>
              </Card>
            );
          })}
        </>
      )}
      {!!data?.otherProviders?.length && (
        <Card>
          <CardHeader>
            <CardTitle>{t('srmMail.other')}</CardTitle>
            <CardDescription>{t('srmMail.otherHint')}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className='break-words'>{data.otherProviders.join(', ')}</p>
          </CardContent>
        </Card>
      )}
      {close.confirmation}
      <AlertDialog
        open={!!disable}
        onOpenChange={(open) => {
          if (!open && !pending) setDisable(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('srmMail.disableTitle', { name: disable?.name })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('srmMail.disableNotice')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {disable && errors[disable.name] && (
            <Alert variant='destructive'>
              <AlertDescription>
                {errorText(errors[disable.name].code)}
              </AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={pending}
              onClick={() => setDisable(null)}
            >
              {t('srmMail.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                const p = data?.providers.find((p) => p.name === disable?.name);
                if (p && disable) void toggle(p, disable.key);
              }}
            >
              {pending && <Spinner />}
              {t('srmMail.confirmDisable')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
