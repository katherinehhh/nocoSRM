import { useMemo } from 'react';
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
import {
  Field,
  FieldLabel,
  FieldError,
  FieldDescription,
} from '#components/ui/field';
import { Input } from '#components/ui/input';
import { NativeSelect, NativeSelectOption } from '#components/ui/native-select';
import { State, FormActions } from './states.js';
import { useCopy, useWrite } from './common.js';
// Editable starting points, not a claim that the account has access to these models.
// Provider URLs/key requirements come from the installed native provider catalog.
const startingModels: Record<string, string> = {
  openai: 'gpt-4.1-mini',
  anthropic: 'claude-sonnet-5-5',
  google: 'gemini-3.8-flash',
  deepseek: 'deepseek-flash',
  alibaba: 'qwen-plus',
  moonshotai: 'kimi-k3',
  ollama: 'gemma4:e2b',
  cohere: 'command-a-03-2025',
};
function defaultsFor(provider: string) {
  const native = MODEL_PROVIDERS.find((p) => p.name === provider);
  return {
    title: native?.title ?? '',
    baseUrl: native?.defaultBaseUrl ?? '',
    model: startingModels[provider] ?? '',
  };
}
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
          {record && <ModelServiceForm record={record} write={write} />}
        </>
      ) : (
        <ModelServiceForm write={write} />
      )}
    </RouteDialog>
  );
}
export function ModelServiceForm({
  record,
  write,
}: {
  record?: ModelServiceView;
  write: ReturnType<typeof useWrite>;
}) {
  const { t } = useCopy(),
    overlay = useRouteOverlay(),
    cache = useQueryClient(),
    schema = useMemo(
      () =>
        z
          .object({
            title: z
              .string()
              .trim()
              .min(1, t('showcase.required'))
              .max(100, t('showcase.modelNameLength')),
            provider: z.enum(MODEL_PROVIDER_NAMES),
            baseUrl: z
              .string()
              .trim()
              .refine((value) => {
                if (!value) return true;
                try {
                  const url = new URL(value);
                  return (
                    ['https:', 'http:'].includes(url.protocol) &&
                    !url.username &&
                    !url.password
                  );
                } catch {
                  return false;
                }
              }, t('showcase.modelUrlInvalid')),
            apiKey: z.string().trim(),
            model: z
              .string()
              .trim()
              .min(1, t('showcase.required'))
              .max(200, t('showcase.modelIdLength')),
          })
          .superRefine((values, ctx) => {
            const provider = MODEL_PROVIDERS.find(
              (p) => p.name === values.provider,
            );
            if (provider?.keyRequired && !values.apiKey && !record?.apiKeySet)
              ctx.addIssue({
                code: 'custom',
                path: ['apiKey'],
                message: t('showcase.modelKeyRequired'),
              });
            if (values.provider === 'openai-compatible' && !values.baseUrl)
              ctx.addIssue({
                code: 'custom',
                path: ['baseUrl'],
                message: t('showcase.modelUrlRequired'),
              });
          }),
      [t, record?.apiKeySet],
    ),
    form = useForm({
      resolver: zodResolver(schema),
      defaultValues: {
        title: record?.title ?? defaultsFor('openai').title,
        provider: record?.provider ?? 'openai',
        baseUrl: record
          ? (record.baseUrl ?? '')
          : defaultsFor('openai').baseUrl,
        apiKey: '',
        model: record
          ? (record.models[0]?.value ?? '')
          : defaultsFor('openai').model,
      },
    });
  const providerField = form.register('provider');
  function changeProvider(provider: string) {
    const old = defaultsFor(form.getValues('provider'));
    const next = defaultsFor(provider);
    for (const key of ['title', 'baseUrl', 'model'] as const) {
      const value = form.getValues(key);
      if (!value.trim() || value === old[key])
        form.setValue(key, next[key], {
          shouldDirty: true,
          shouldValidate: form.formState.isSubmitted,
        });
    }
    // A key entered for one provider must never silently be reused for another.
    form.setValue('apiKey', '', { shouldDirty: true });
    form.clearErrors();
  }
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
      autoComplete='off'
      onSubmit={(e) => void submit(e)}
    >
      {form.formState.errors.root && (
        <p role='alert'>{form.formState.errors.root.message}</p>
      )}
      <p className='text-sm text-muted-foreground'>
        {t('showcase.modelSetupHint')}
      </p>
      <div className='grid gap-4 sm:grid-cols-2'>
        <Field className='sm:col-span-2'>
          <FieldLabel htmlFor='model-provider'>
            {t('showcase.provider')} *
          </FieldLabel>
          <NativeSelect
            id='model-provider'
            disabled={!!record || write.isPending}
            {...providerField}
            onChange={(event) => {
              changeProvider(event.target.value);
              void providerField.onChange(event);
            }}
          >
            {MODEL_PROVIDERS.map((p) => (
              <NativeSelectOption value={p.name} key={p.name}>
                {p.title}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <FieldDescription>{t('showcase.modelPresetHint')}</FieldDescription>
        </Field>
        {(['title', 'baseUrl', 'apiKey', 'model'] as const).map((key) => (
          <Field key={key} data-invalid={!!form.formState.errors[key]}>
            <FieldLabel htmlFor={`model-${key}`}>
              {t(`showcase.modelFields.${key}`)}
              {['title', 'model'].includes(key) ? ' *' : ''}
            </FieldLabel>
            <Input
              id={`model-${key}`}
              type={
                key === 'apiKey'
                  ? 'password'
                  : key === 'baseUrl'
                    ? 'url'
                    : 'text'
              }
              autoComplete={key === 'apiKey' ? 'new-password' : 'off'}
              autoCapitalize='none'
              spellCheck={false}
              disabled={write.isPending}
              aria-invalid={!!form.formState.errors[key]}
              placeholder={t(`showcase.modelPlaceholders.${key}`)}
              {...form.register(key)}
            />
            {key === 'apiKey' && (
              <FieldDescription>
                {t(
                  record?.apiKeySet
                    ? 'showcase.modelKeyKeep'
                    : 'showcase.modelKeyHint',
                )}
              </FieldDescription>
            )}
            {key === 'baseUrl' && (
              <FieldDescription>{t('showcase.modelUrlHint')}</FieldDescription>
            )}
            <FieldError
              errors={
                form.formState.errors[key] ? [form.formState.errors[key]] : []
              }
            />
          </Field>
        ))}
      </div>
    </form>
  );
}
