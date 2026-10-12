import AwardSettingsCard from './award-settings.js';
import { useState } from 'react';
import WorkflowSettings from './workflow-settings.js';
import { useApiClient, useToaster } from '@nocobase/app-client';
import { useQueryClient } from '@tanstack/react-query';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import { useCopy, useData, useCapabilities, failure } from './common.js';
import { State } from './states.js';

export default function Settings() {
  const { t } = useCopy(),
    query = useData<{
      data: {
        id: string;
        version: number;
        payload: Record<string, string | number>;
      }[];
    }>('settings'),
    caps = useCapabilities();
  return (
    <PageContainer>
      <PageHeader
        title={t('ops.settings')}
        description={t('ops.settingsDescription')}
      />
      <State
        loading={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
      {query.data &&
        ['organization', 'automation'].map((section) => {
          const row = query.data.data.find((r) => r.id === section);
          return (
            <SettingsSection
              key={`${section}-${row?.version}`}
              section={section}
              row={row}
              disabled={!caps.data?.data.admin}
            />
          );
        })}
      <AwardSettingsCard />
      <WorkflowSettings />
    </PageContainer>
  );
}
function SettingsSection({
  section,
  row,
  disabled,
}: {
  section: string;
  row?: { version: number; payload: Record<string, string | number> };
  disabled: boolean;
}) {
  const { t } = useCopy(),
    api = useApiClient(),
    cache = useQueryClient(),
    toast = useToaster();
  const fields: Record<string, [string, string | number][]> = {
    organization: [
      ['name', ''],
      ['terms', 30],
    ],
    finance: [['tolerance', 0]],
    automation: [
      ['timezone', 'Asia/Shanghai'],
      ['start', '00:00'],
      ['end', '23:59'],
    ],
  };
  const [value, setValue] = useState(
      row?.payload ?? Object.fromEntries(fields[section]),
    ),
    [pending, setPending] = useState(false),
    [error, setError] = useState('');
  async function save() {
    setPending(true);
    setError('');
    try {
      await api.request({
        path: `operations/settings/${section}`,
        method: 'PATCH',
        json: { version: row?.version ?? 0, payload: value },
      });
      await cache.invalidateQueries({ queryKey: ['operations', 'settings'] });
      toast.show({ type: 'success', title: t('ops.saved') });
    } catch (e) {
      setError(failure(e));
    } finally {
      setPending(false);
    }
  }
  return (
    <section className='space-y-5 rounded-xl border p-6'>
      <h2 className='text-lg font-semibold'>{t(`ops.sections.${section}`)}</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset disabled={disabled || pending} className='space-y-5'>
          <div className='grid gap-4 md:grid-cols-3'>
            {fields[section].map(([key, initial]) => (
              <div className='space-y-2' key={key}>
                <Label>{t(`ops.fields.${key}`)}</Label>
                <Input
                  aria-label={t(`ops.fields.${key}`)}
                  type={typeof initial === 'number' ? 'number' : 'text'}
                  value={value[key] ?? initial}
                  onChange={(e) =>
                    setValue({
                      ...value,
                      [key]:
                        typeof initial === 'number'
                          ? Number(e.target.value)
                          : e.target.value,
                    })
                  }
                />
              </div>
            ))}
          </div>
          {error && (
            <p role='alert' className='text-destructive'>
              {t(`ops.errors.${error}`, { defaultValue: t('ops.error') })}
            </p>
          )}
          <div className='flex justify-end'>
            <Button variant='outline' type='submit'>
              {t(pending ? 'ops.saving' : 'ops.save')}
            </Button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
