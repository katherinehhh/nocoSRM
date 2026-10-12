import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router';
import { useForm, useFieldArray, Controller, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { RouteChildPage } from '#components/route-child-page';
import { DatePicker } from '#components/date-picker';
import { ArrowLeftIcon } from 'lucide-react';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Textarea } from '#components/ui/textarea';
import { NativeSelect, NativeSelectOption } from '#components/ui/native-select';
import { Field, FieldLabel, FieldError } from '#components/ui/field';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '#components/ui/alert-dialog';
import { Spinner } from '#components/ui/spinner';
import { State } from './states.js';
import {
  DeliveryInput,
  type DeliveryValues,
} from '../../../shared/showcase.js';
import {
  useCopy,
  useChildFocus,
  useShowcase,
  useWrite,
  type DeliveryView,
} from './common.js';
export default function DeliveryFormPage() {
  useChildFocus();
  const { id } = useParams(),
    { t } = useCopy(),
    template = useShowcase<{ data: { config: { labelCount: number } } }>(
      'printTemplates/delivery',
      {},
      !id,
      true,
    ),
    query = useShowcase<{ data: DeliveryView }>(
      `deliveryPlans/${id}`,
      {},
      !!id,
      true,
    );
  return (
    <RouteChildPage>
      <PageContainer>
        <PageHeader
          title={t(id ? 'showcase.editDelivery' : 'showcase.newDelivery')}
        />
        {id ? (
          <>
            <State
              loading={query.isPending || query.isFetching}
              error={query.error}
              retry={() => void query.refetch()}
            />
            {query.data && !query.error && !query.isFetching && (
              <DeliveryForm
                key={query.data.data.record.id}
                record={query.data.data}
              />
            )}
          </>
        ) : (
          <>
            <State
              loading={template.isPending || template.isFetching}
              error={template.error}
              retry={() => void template.refetch()}
            />
            {template.data && !template.error && !template.isFetching && (
              <DeliveryForm
                defaultLabelCount={template.data.data.config.labelCount}
              />
            )}
          </>
        )}
      </PageContainer>
    </RouteChildPage>
  );
}
export function DeliveryForm({
  record,
  defaultLabelCount = 40,
}: {
  record?: DeliveryView;
  defaultLabelCount?: number;
}) {
  const [orderSearch, setOrderSearch] = useState(''),
    [orderQuery, setOrderQuery] = useState(''),
    [orderPage, setOrderPage] = useState(1),
    [pendingOrder, setPendingOrder] = useState('');
  const { t } = useCopy(),
    navigate = useNavigate(),
    location = useLocation(),
    write = useWrite(),
    orders = useShowcase<{
      data: {
        id: string;
        number: string;
        name: string;
        version: number;
        sourceLines: {
          id: string;
          sku: string;
          name: string;
          quantity: number;
        }[];
      }[];
      meta: { total: number };
    }>(
      'orders',
      {
        q: orderQuery,
        page: orderPage,
        ...(record ? { orderId: record.record.orderId } : {}),
      },
      true,
    ),
    r = record?.record;
  const [identity] = useState(() => ({
    date: new Date().toLocaleDateString('en-CA'),
    requestId: crypto.randomUUID(),
  }));
  const form = useForm({
      resolver: zodResolver(DeliveryInput),
      defaultValues: {
        name: r?.name ?? '',
        orderId: r?.orderId ?? '',
        region: (r?.region ?? 'CN') as 'AU' | 'EU' | 'US' | 'CN',
        businessDate: r?.businessDate ?? identity.date,
        notes: r?.notes ?? '',
        labelCount: r?.labelCount ?? defaultLabelCount,
        requestId: identity.requestId,
        expectedVersion: r?.lifecycleVersion,
        expectedOrderVersion: r?.orderSourceVersion ?? undefined,
        lines: r ? (JSON.parse(r.lines) as DeliveryValues['lines']) : [],
      },
    }),
    lines = useFieldArray({ control: form.control, name: 'lines' });
  const selectedOrderId = useWatch({ control: form.control, name: 'orderId' });
  function loadOrder(id: string) {
    const order = orders.data?.data.find((o) => o.id === id);
    if (!order) return;
    form.setValue('orderId', id, { shouldDirty: true });
    form.setValue('expectedOrderVersion', order.version, { shouldDirty: true });
    lines.replace(
      order.sourceLines.map((line) => ({
        sourceLineId: line.id,
        sku: line.sku,
        name: line.name,
        fnsku: '',
        allocation: Number.isInteger(line.quantity) ? line.quantity : 1,
        unitsPerBox: 1,
      })),
    );
    setPendingOrder('');
  }
  const [discard, setDiscard] = useState(false);
  const navigationTargetRef = useRef<string | null>(null),
    allowUnloadRef = useRef(false);
  const leave = () => {
    if (navigationTargetRef.current) {
      allowUnloadRef.current = true;
      window.location.assign(navigationTargetRef.current);
      return;
    }
    void navigate({ pathname: '..', search: location.search });
  };
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (form.formState.isDirty && !allowUnloadRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    const followLink = (event: MouseEvent) => {
      const anchor =
        event.target instanceof Element ? event.target.closest('a') : null;
      if (
        !anchor ||
        anchor.target === '_blank' ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0
      )
        return;
      const url = new URL(anchor.href, window.location.href);
      if (
        url.origin !== window.location.origin ||
        url.href === window.location.href
      )
        return;
      if (write.isPending || form.formState.isDirty) {
        event.preventDefault();
        event.stopPropagation();
        if (!write.isPending) {
          navigationTargetRef.current = url.href;
          setDiscard(true);
        }
      }
    };
    document.addEventListener('click', followLink, true);
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
      document.removeEventListener('click', followLink, true);
    };
  }, [form.formState.isDirty, write.isPending]);
  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await write.mutateAsync({
        path: `showcase/deliveryPlans${r ? `/${r.id}` : ''}`,
        method: r ? 'PATCH' : 'POST',
        json: values,
      });
      void navigate({ pathname: '..', search: location.search });
    } catch {
      form.setError('root', { message: t('showcase.error') });
    }
  });
  return (
    <form
      className='flex flex-col gap-6'
      noValidate
      onSubmit={(e) => void onSubmit(e)}
    >
      <button
        type='button'
        className='inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground'
        disabled={write.isPending}
        onClick={() => {
          if (form.formState.isDirty) setDiscard(true);
          else leave();
        }}
      >
        <ArrowLeftIcon className='size-4' />
        {t('navigation.back')}
      </button>
      <State
        loading={!r && orders.isPending}
        error={orders.error}
        empty={
          !!r &&
          !!orders.data &&
          !orders.isFetching &&
          !orders.data.data.some((o) => o.id === r.orderId)
        }
        emptyLabel={t('srm.sourceUnavailable')}
        retry={() => void orders.refetch()}
      />
      {form.formState.errors.root && (
        <p role='alert' className='text-destructive'>
          {form.formState.errors.root.message}
        </p>
      )}
      <div className='grid gap-4 sm:grid-cols-2'>
        <Field>
          <FieldLabel htmlFor='delivery-name'>
            {t('ops.fields.name')} *
          </FieldLabel>
          <Input
            id='delivery-name'
            {...form.register('name')}
            aria-invalid={!!form.formState.errors.name}
          />
          <FieldError
            errors={
              form.formState.errors.name
                ? [{ message: t('showcase.required') }]
                : []
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor='delivery-order'>
            {t('showcase.fields.orderId')} *
          </FieldLabel>
          <div className='flex flex-wrap gap-2'>
            <Input
              placeholder={t('srm.orderSearch')}
              aria-label={t('srm.orderSearch')}
              value={orderSearch}
              onChange={(e) => setOrderSearch(e.target.value)}
            />
            <Button
              type='button'
              variant='outline'
              onClick={() => {
                setOrderQuery(orderSearch);
                setOrderPage(1);
              }}
            >
              {t('ops.searchButton')}
            </Button>
          </div>
          <NativeSelect
            id='delivery-order'
            disabled={write.isPending}
            value={selectedOrderId}
            onChange={(e) => {
              if (form.formState.isDirty && form.getValues('lines').length) {
                setPendingOrder(e.target.value);
              } else loadOrder(e.target.value);
            }}
          >
            <NativeSelectOption value=''>
              {t('showcase.chooseOrder')}
            </NativeSelectOption>
            {r && !orders.data?.data.some((o) => o.id === r.orderId) && (
              <NativeSelectOption value={r.orderId}>
                {r.orderNumber ?? r.orderId}
              </NativeSelectOption>
            )}
            {orders.data?.data
              .filter((o) => !r || o.id === r.orderId)
              .map((o) => (
                <NativeSelectOption key={o.id} value={o.id}>
                  {o.number} · {o.name}
                </NativeSelectOption>
              ))}
          </NativeSelect>
          {r && (
            <Button
              type='button'
              variant='outline'
              disabled={write.isPending || orders.isFetching}
              onClick={() => {
                void orders.refetch().then((fresh) => {
                  if (
                    !fresh.error &&
                    fresh.data?.data.some((o) => o.id === r.orderId)
                  )
                    setPendingOrder(r.orderId);
                });
              }}
            >
              {t('srm.reloadSource')}
            </Button>
          )}
          <div className='flex gap-2'>
            <Button
              type='button'
              variant='outline'
              disabled={orderPage === 1}
              onClick={() => setOrderPage(orderPage - 1)}
            >
              {t('srm.previous')}
            </Button>
            <Button
              type='button'
              variant='outline'
              disabled={orderPage * 20 >= (orders.data?.meta?.total ?? 0)}
              onClick={() => setOrderPage(orderPage + 1)}
            >
              {t('srm.next')}
            </Button>
          </div>
          {pendingOrder && (
            <div className='flex flex-wrap gap-2'>
              <p>{t('srm.discard')}</p>
              <Button
                type='button'
                disabled={
                  orders.isFetching ||
                  !orders.data?.data.some((o) => o.id === pendingOrder)
                }
                onClick={() => loadOrder(pendingOrder)}
              >
                {t('srm.loadLatest')}
              </Button>
              <Button
                type='button'
                variant='outline'
                onClick={() => setPendingOrder('')}
              >
                {t('srm.cancel')}
              </Button>
            </div>
          )}
          <FieldError
            errors={
              form.formState.errors.orderId
                ? [{ message: t('showcase.required') }]
                : []
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor='delivery-date'>
            {t('ops.fields.businessDate')} *
          </FieldLabel>
          <Controller
            control={form.control}
            name='businessDate'
            render={({ field }) => (
              <DatePicker
                label={t('ops.fields.businessDate')}
                value={field.value}
                onChange={field.onChange}
                disabled={write.isPending}
              />
            )}
          />
          <FieldError
            errors={
              form.formState.errors.businessDate
                ? [{ message: t('showcase.required') }]
                : []
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor='delivery-region'>
            {t('showcase.fields.region')} *
          </FieldLabel>
          <NativeSelect id='delivery-region' {...form.register('region')}>
            {['AU', 'EU', 'US', 'CN'].map((region) => (
              <NativeSelectOption key={region} value={region}>
                {region}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <section className='flex flex-col gap-4'>
        <h2 className='text-base font-medium'>{t('showcase.lines')}</h2>
        {lines.fields.map((line, index) => (
          <div
            key={line.id}
            className='grid gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-5'
          >
            {(
              ['sku', 'name', 'fnsku', 'allocation', 'unitsPerBox'] as const
            ).map((key) => (
              <Field key={key}>
                <FieldLabel htmlFor={`line-${index}-${key}`}>
                  {t(
                    key === 'name'
                      ? 'showcase.productName'
                      : `showcase.fields.${key}`,
                  )}{' '}
                  {key === 'fnsku' ? '' : '*'}
                </FieldLabel>
                <Input
                  id={`line-${index}-${key}`}
                  type={
                    ['allocation', 'unitsPerBox'].includes(key)
                      ? 'number'
                      : 'text'
                  }
                  {...form.register(`lines.${index}.${key}`, {
                    valueAsNumber: ['allocation', 'unitsPerBox'].includes(key),
                  })}
                />
                <FieldError
                  errors={
                    form.formState.errors.lines?.[index]?.[key]
                      ? [{ message: t('showcase.invalidLine') }]
                      : []
                  }
                />
              </Field>
            ))}
            {lines.fields.length > 1 && (
              <Button
                type='button'
                variant='ghost'
                onClick={() => lines.remove(index)}
              >
                {t('showcase.removeLine')}
              </Button>
            )}
          </div>
        ))}
      </section>
      <Field>
        <FieldLabel htmlFor='delivery-labels'>
          {t('showcase.labelCount')} *
        </FieldLabel>
        <Input
          id='delivery-labels'
          type='number'
          {...form.register('labelCount', { valueAsNumber: true })}
        />
        <FieldError
          errors={
            form.formState.errors.labelCount
              ? [{ message: t('showcase.invalidLine') }]
              : []
          }
        />
      </Field>
      <Field>
        <FieldLabel htmlFor='delivery-notes'>
          {t('showcase.fields.notes')}
        </FieldLabel>
        <Textarea id='delivery-notes' {...form.register('notes')} />
      </Field>
      <div className='flex justify-end gap-3'>
        <Button
          type='button'
          variant='outline'
          disabled={write.isPending}
          onClick={() => {
            if (form.formState.isDirty) setDiscard(true);
            else leave();
          }}
        >
          {t('ops.cancel')}
        </Button>
        <Button type='submit' disabled={write.isPending}>
          {write.isPending && <Spinner />}
          {t(r ? 'ops.save' : 'ops.create')}
        </Button>
      </div>
      <AlertDialog open={discard} onOpenChange={setDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('showcase.discardTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('showcase.discardDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('ops.cancel')}</AlertDialogCancel>
            <Button variant='destructive' type='button' onClick={leave}>
              {t('showcase.discard')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
