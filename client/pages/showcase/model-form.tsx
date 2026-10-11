import { useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '@nocobase/app-client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  MODEL_PROVIDERS,
  MODEL_PROVIDER_NAMES,
  type ModelServiceView,
} from '@nocobase/app-plugin-agents/shared/models';
import { RouteDialog } from '#components/route-dialog';
import { useRouteOverlay } from '#components/use-route-overlay';
import { Field, FieldLabel, FieldError } from '#components/ui/field';
import { Input } from '#components/ui/input';
import { NativeSelect, NativeSelectOption } from '#components/ui/native-select';
import { State, FormActions } from './states.js';
import { useCopy, useWrite } from './common.js';
export default function ModelForm() {
  const { id } = useParams(),
    api = useApiClient(),
    { t } = useCopy(),
    write = useWrite(),
    q = useQuery({
      queryKey: ['model-services'],
      queryFn: ({ signal }) =>
        api.request<{ data: ModelServiceView[] }>({
          path: 'agents/services',
          signal,
        }),
      retry: false,
      enabled: !!id,
    });
  const record = q.data?.data.find((r) => r.name === id);
  return (
    <RouteDialog
      className='sm:max-w-2xl'
      title={t(id ? 'showcase.modelEditTitle' : 'showcase.modelNewTitle')}
      description={t('showcase.secretNotice')}
      footer={
        <FormActions
          formId='showcase-model'
          pending={write.isPending}
          label={t('ops.save')}
        />
      }
      beforeClose={() => !write.isPending}
    >
      {id ? (
        <>
          <State
            loading={q.isPending}
            error={q.error}
            empty={!!q.data && !record}
            retry={() => void q.refetch()}
          />
          {record && <Body record={record} write={write} />}
        </>
      ) : (
        <Body write={write} />
      )}
    </RouteDialog>
  );
}
function Body({
  record,
  write,
}: {
  record?: ModelServiceView;
  write: ReturnType<typeof useWrite>;
}) {
  const { t } = useCopy(),
    overlay = useRouteOverlay(),
    cache = useQueryClient(),
    schema = z.object({
      title: z.string().trim().min(1, t('showcase.required')).max(100),
      provider: z.enum(MODEL_PROVIDER_NAMES),
      baseUrl: z.string().trim(),
      apiKey: z.string(),
      model: z.string().trim().min(1, t('showcase.required')).max(200),
    }),
    form = useForm({
      resolver: zodResolver(schema),
      defaultValues: {
        title: record?.title ?? '',
        provider: record?.provider ?? 'openai-compatible',
        baseUrl: record?.baseUrl ?? '',
        apiKey: '',
        model: record?.models[0]?.value ?? '',
      },
    });
  const submit = form.handleSubmit(async (values) => {
    try {
      await write.mutateAsync({
        path: `agents/services${record ? `/${record.name}` : ''}`,
        method: record ? 'PATCH' : 'POST',
        json: {
          title: values.title,
          ...(!record ? { provider: values.provider } : {}),
          baseUrl: values.baseUrl || null,
          ...(values.apiKey ? { apiKey: values.apiKey } : {}),
          models: [{ value: values.model, kind: 'chat' }],
          ...(!record ? { enabled: true } : {}),
        },
      });
      form.reset({ ...values, apiKey: '' });
      await cache.invalidateQueries({ queryKey: ['model-services'] });
      await overlay.close();
    } catch {
      form.setError('root', { message: t('showcase.error') });
    }
  });
  return (
    <form
      id='showcase-model'
      className='flex flex-col gap-4'
      noValidate
      onSubmit={(e) => void submit(e)}
    >
      {form.formState.errors.root && (
        <p role='alert'>{form.formState.errors.root.message}</p>
      )}
      <div className='grid gap-4 sm:grid-cols-2'>
        {(['title', 'baseUrl', 'apiKey', 'model'] as const).map((key) => (
          <Field key={key}>
            <FieldLabel htmlFor={`model-${key}`}>
              {t(`showcase.modelFields.${key}`)}
              {['title', 'model'].includes(key) ? ' *' : ''}
            </FieldLabel>
            <Input
              id={`model-${key}`}
              type={key === 'apiKey' ? 'password' : 'text'}
              autoComplete={key === 'apiKey' ? 'off' : undefined}
              {...form.register(key)}
            />
            <FieldError
              errors={
                form.formState.errors[key] ? [form.formState.errors[key]] : []
              }
            />
          </Field>
        ))}
        <Field>
          <FieldLabel htmlFor='model-provider'>
            {t('showcase.provider')} *
          </FieldLabel>
          <NativeSelect
            id='model-provider'
            disabled={!!record}
            {...form.register('provider')}
          >
            {MODEL_PROVIDERS.map((p) => (
              <NativeSelectOption value={p.name} key={p.name}>
                {p.title}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      </div>
    </form>
  );
}
