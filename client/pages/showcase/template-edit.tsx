import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { RouteDialog } from '#components/route-dialog';
import { useRouteOverlay } from '#components/use-route-overlay';
import { Field, FieldLabel, FieldError } from '#components/ui/field';
import { Input } from '#components/ui/input';
import { NativeSelect, NativeSelectOption } from '#components/ui/native-select';
import { State, FormActions } from './states.js';
import { TemplateSchema } from '../../../shared/showcase.js';
import { useCopy, useShowcase, useWrite } from './common.js';
export default function TemplateEdit() {
  const { t } = useCopy(),
    write = useWrite(),
    q = useShowcase<{
      data: { revision: number; config: z.infer<typeof TemplateSchema> };
    }>('printTemplates/delivery');
  return (
    <RouteDialog
      title={t('showcase.editTemplate')}
      footer={
        <FormActions
          formId='showcase-template'
          pending={write.isPending}
          label={t('ops.save')}
        />
      }
      beforeClose={() => !write.isPending}
    >
      <State
        loading={q.isPending}
        error={q.error}
        retry={() => void q.refetch()}
      />
      {q.data && <Body initial={q.data.data} write={write} />}
    </RouteDialog>
  );
}
function Body({
  initial,
  write,
}: {
  initial: { revision: number; config: z.infer<typeof TemplateSchema> };
  write: ReturnType<typeof useWrite>;
}) {
  const { t } = useCopy(),
    overlay = useRouteOverlay(),
    form = useForm({
      resolver: zodResolver(TemplateSchema),
      defaultValues: initial.config,
    });
  const submit = form.handleSubmit(async (config) => {
    try {
      await write.mutateAsync({
        path: 'showcase/printTemplates/delivery',
        method: 'PATCH',
        json: { expectedRevision: initial.revision, config },
      });
      await overlay.close();
    } catch {
      form.setError('root', { message: t('showcase.error') });
    }
  });
  return (
    <form
      id='showcase-template'
      className='flex flex-col gap-4'
      noValidate
      onSubmit={(e) => void submit(e)}
    >
      {form.formState.errors.root && (
        <p role='alert'>{form.formState.errors.root.message}</p>
      )}
      <div className='grid gap-4 sm:grid-cols-2'>
        {(['title', 'labelColumns', 'labelRows', 'labelCount'] as const).map(
          (key) => (
            <Field key={key}>
              <FieldLabel htmlFor={`template-${key}`}>
                {t(`showcase.templateFields.${key}`)} *
              </FieldLabel>
              <Input
                id={`template-${key}`}
                type={key === 'title' ? 'text' : 'number'}
                {...form.register(key, { valueAsNumber: key !== 'title' })}
              />
              <FieldError
                errors={
                  form.formState.errors[key]
                    ? [{ message: t('showcase.invalidLine') }]
                    : []
                }
              />
            </Field>
          ),
        )}
        <Field>
          <FieldLabel htmlFor='template-locale'>
            {t('showcase.language')} *
          </FieldLabel>
          <NativeSelect id='template-locale' {...form.register('locale')}>
            <NativeSelectOption value='zh-CN'>
              {t('showcase.chinese')}
            </NativeSelectOption>
            <NativeSelectOption value='en-US'>
              {t('showcase.english')}
            </NativeSelectOption>
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel>{t('showcase.columns')} *</FieldLabel>
          {(
            [
              'sku',
              'name',
              'orderId',
              'fnsku',
              'region',
              'allocation',
              'unitsPerBox',
              'boxes',
            ] as const
          ).map((key) => (
            <label className='flex items-center gap-2' key={key}>
              <input
                type='checkbox'
                value={key}
                {...form.register('columns')}
              />
              {t(`showcase.fields.${key}`)}
            </label>
          ))}
          <FieldError
            errors={
              form.formState.errors.columns
                ? [{ message: t('showcase.required') }]
                : []
            }
          />
        </Field>
      </div>
    </form>
  );
}
