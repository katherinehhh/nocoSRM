import { useState, useEffect, useRef } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useApiClient, useToaster } from '@nocobase/app-client';
import { useDirtyClose } from '#hooks/use-dirty-close';
import { useCore, coreError } from '../srm-core/common.js';
import type { AwardSettings } from '../../../shared/srm-approval.js';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '#components/ui/card';
import { Button } from '#components/ui/button';
import { Spinner } from '#components/ui/spinner';
import { Label } from '#components/ui/label';
import { Checkbox } from '#components/ui/checkbox';
import { NativeSelect, NativeSelectOption } from '#components/ui/native-select';
import { Alert, AlertDescription } from '#components/ui/alert';
import { State, Refresh } from '../showcase/states.js';
export default function AwardSettingsCard() {
  const { t } = useTranslation(),
    api = useApiClient(),
    toast = useToaster(),
    { can } = useCan({
      resource: { type: 'settings', id: 'operations.admin' },
      action: 'update',
    });
  const q = useCore<{
    data: { settings: AwardSettings; people: { id: string; name: string }[] };
  }>('award/settings', {}, can);
  const [draft, setDraft] = useState<AwardSettings | null>(null),
    [baseline, setBaseline] = useState<AwardSettings | null>(null),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false),
    [key, setKey] = useState(() => crypto.randomUUID());
  const purchasingRef = useRef<HTMLSelectElement>(null),
    departmentRef = useRef<HTMLSelectElement>(null);
  const invalidPeople = (value: AwardSettings) =>
    value.enabled &&
    (!value.purchasing ||
      !value.department ||
      value.purchasing === value.department);
  const value = draft ?? q.data?.data.settings;
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(baseline),
    close = useDirtyClose(dirty, pending);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function edit(patch: Partial<AwardSettings>) {
    const current = draft ?? q.data?.data.settings;
    if (current) {
      if (!baseline) setBaseline(current);
      const next = { ...current, ...patch };
      setDraft(next);
      if (error !== 'APPROVAL_REVIEWERS_REQUIRED' || !invalidPeople(next))
        setError('');
      setKey(crypto.randomUUID());
    }
  }
  async function refresh() {
    if (await close.beforeClose()) {
      setDraft(null);
      setBaseline(null);
      await q.refetch();
    }
  }
  async function save() {
    if (!value || pending) return;
    if (invalidPeople(value)) {
      setError('APPROVAL_REVIEWERS_REQUIRED');
      (!value.purchasing ? purchasingRef : departmentRef).current?.focus();
      return;
    }
    setPending(true);
    setError('');
    try {
      const { id: _, ...values } = value;
      void _;
      const result = await api.request<{ data: AwardSettings }>({
        path: 'srmCore/award/settings',
        method: 'POST',
        json: { ...values, requestKey: key },
      });
      setDraft(result.data);
      setBaseline(result.data);
      await q.refetch();
      toast.show({ type: 'success', title: t('srmApproval.saved') });
    } catch (e) {
      setError(coreError(e));
    } finally {
      setPending(false);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('srmApproval.settings')}</CardTitle>
        <CardDescription>{t('srmApproval.settingsHint')}</CardDescription>
        {can && (
          <Refresh
            pending={pending || q.isFetching}
            onClick={() => void refresh()}
          />
        )}
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {can ? (
          <>
            <State
              loading={q.isPending}
              error={q.error}
              retry={() => void q.refetch()}
            />
            {error && (
              <Alert variant='destructive'>
                <AlertDescription>
                  {t(`srmApproval.errors.${error}`, {
                    defaultValue: t('srmApproval.errors.FAILED'),
                  })}
                </AlertDescription>
              </Alert>
            )}
            {value && (
              <>
                <Label htmlFor='native-award-enabled'>
                  <Checkbox
                    id='native-award-enabled'
                    checked={value.enabled}
                    disabled={pending}
                    onCheckedChange={(value) =>
                      edit({ enabled: value === true })
                    }
                  />
                  {t('srmApproval.enabled')}
                </Label>
                {(['purchasing', 'department'] as const).map((field) => (
                  <div className='flex flex-col gap-2' key={field}>
                    <Label htmlFor={`award-${field}`}>
                      {t(`srmApproval.${field}`)}
                      {value.enabled ? ' *' : ''}
                    </Label>
                    <NativeSelect
                      id={`award-${field}`}
                      ref={
                        field === 'purchasing' ? purchasingRef : departmentRef
                      }
                      aria-describedby={
                        error === 'APPROVAL_REVIEWERS_REQUIRED'
                          ? `award-${field}-error`
                          : undefined
                      }
                      value={value[field]}
                      disabled={pending}
                      aria-invalid={error === 'APPROVAL_REVIEWERS_REQUIRED'}
                      onChange={(e) => edit({ [field]: e.target.value })}
                    >
                      <NativeSelectOption value=''>
                        {t('srmApproval.choose')}
                      </NativeSelectOption>
                      {q.data?.data.people.map((p) => (
                        <NativeSelectOption key={p.id} value={p.id}>
                          {p.name}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                    {error === 'APPROVAL_REVIEWERS_REQUIRED' && (
                      <p
                        id={`award-${field}-error`}
                        className='text-sm text-destructive'
                      >
                        {t('srmApproval.errors.APPROVAL_REVIEWERS_REQUIRED')}
                      </p>
                    )}
                  </div>
                ))}
                {q.data?.data.settings.version !== value.version && (
                  <p>{t('srmApproval.changed')}</p>
                )}
                <Button
                  className='self-end'
                  disabled={pending || !dirty}
                  onClick={() => void save()}
                >
                  {pending && <Spinner />}
                  {t('srmApproval.save')}
                </Button>
              </>
            )}
          </>
        ) : (
          <p>{t('srmApproval.errors.FORBIDDEN')}</p>
        )}
      </CardContent>
      {close.confirmation}
    </Card>
  );
}
