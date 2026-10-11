import { useState, type ReactNode } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router';
import { useApiClient, useToaster } from '@nocobase/app-client';
import { useQueryClient } from '@tanstack/react-query';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { RouteChildPage } from '#components/route-child-page';
import { BackButton } from '#components/back-button';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import { NativeSelect, NativeSelectOption } from '#components/ui/native-select';
import { DatePicker } from '#components/date-picker';
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from '#components/ui/table';
import {
  type Kind,
  type Doc,
  type Payload,
  type Line,
  lineKinds,
  lineTotals,
} from '../../../shared/operations.js';
import {
  useKind,
  useCopy,
  useData,
  failure,
  money,
  type Lookups,
} from './common.js';
import { State } from './states.js';

export default function FormPage() {
  const kind = useKind(),
    { id } = useParams(),
    { t } = useCopy();
  const lookup = useData<{ data: Lookups }>(`lookups/${kind}`);
  const record = useData<{ data: Doc }>(`${kind}/${id}`, {}, !!id);
  return (
    <RouteChildPage>
      <PageContainer className='mx-auto max-w-4xl'>
        <BackButton />
        <PageHeader
          title={
            t(id ? 'ops.edit' : 'ops.create') + ' · ' + t(`ops.kinds.${kind}`)
          }
        />
        <State
          loading={lookup.isPending || (!!id && record.isPending)}
          error={lookup.error ?? record.error}
          retry={() => {
            void lookup.refetch();
            if (id) void record.refetch();
          }}
        />
        {lookup.data && (!id || record.data) && (
          <DocumentForm
            key={id ?? 'new'}
            kind={kind}
            initial={record.data?.data}
            lookups={lookup.data.data}
          />
        )}
      </PageContainer>
    </RouteChildPage>
  );
}
export function DocumentForm({
  kind,
  initial,
  lookups,
}: {
  kind: Kind;
  initial?: Doc;
  lookups: Lookups;
}) {
  const { t, i18n } = useCopy(),
    api = useApiClient(),
    cache = useQueryClient(),
    navigate = useNavigate(),
    location = useLocation(),
    toast = useToaster();
  const [value, setValue] = useState<Partial<Doc>>(
    () =>
      initial ?? {
        name: '',
        supplierId: null,
        businessDate: new Date().toISOString().slice(0, 10),
        notes: '',
        amount: 0,
        payload: {
          lines: [],
          unit: '件',
          terms: 30,
          reorderPoint: 0,
          openingStock: 0,
          template: 'delivery',
          threshold: 3,
          timezone: 'Asia/Shanghai',
          deductible: 100,
          inputTax: 0,
          outputTax: 0,
        },
      },
  );
  const [pending, setPending] = useState(false),
    [error, setError] = useState('');
  const [requestId] = useState(() => crypto.randomUUID());
  const payload = value.payload!;
  function patch(v: Partial<Doc>) {
    setValue((x) => ({ ...x, ...v }));
  }
  function field(v: Partial<Payload>) {
    setValue((x) => ({ ...x, payload: { ...x.payload, ...v } }));
  }
  function wrap(key: string, children: ReactNode) {
    return (
      <div key={key} className='space-y-2'>
        <Label>{t(`ops.fields.${key}`)}</Label>
        {children}
      </div>
    );
  }
  function text(key: keyof Payload, type = 'text') {
    return wrap(
      key,
      <Input
        aria-label={t(`ops.fields.${key}`)}
        type={type}
        step={type === 'number' ? 'any' : undefined}
        value={String(
          typeof payload[key] === 'object' ? '' : (payload[key] ?? ''),
        )}
        onChange={(e) =>
          field({
            [key]: type === 'number' ? Number(e.target.value) : e.target.value,
          })
        }
      />,
    );
  }
  function select(
    key: keyof Payload,
    source: Kind,
    filter?: (d: Doc) => boolean,
  ) {
    return wrap(
      key,
      <NativeSelect
        className='w-full'
        aria-label={t(`ops.fields.${key}`)}
        value={String(
          typeof payload[key] === 'object' ? '' : (payload[key] ?? ''),
        )}
        onChange={(e) => {
          const doc = lookups[source]?.find((d) => d.id === e.target.value);
          if (key === 'orderId' && doc) {
            patch({
              supplierId: doc.supplierId,
              payload: {
                ...payload,
                orderId: doc.id,
                lines: doc.payload.lines?.map((l) => ({
                  ...l,
                  id: crypto.randomUUID(),
                  sourceLineId: l.id,
                  accepted: l.quantity,
                  rejected: 0,
                })),
              },
            });
          } else if (key === 'settlementId' && doc) {
            patch({
              supplierId: doc.supplierId,
              amount: doc.amount,
              payload: { ...payload, settlementId: doc.id },
            });
          } else field({ [key]: e.target.value });
        }}
      >
        <NativeSelectOption value=''>{t('ops.choose')}</NativeSelectOption>
        {(lookups[source] ?? []).filter(filter ?? (() => true)).map((d) => (
          <NativeSelectOption key={d.id} value={d.id}>
            {d.number} · {d.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>,
    );
  }
  function line(index: number, change: Partial<Line>) {
    field({
      lines: payload.lines!.map((l, i) =>
        i === index ? { ...l, ...change } : l,
      ),
    });
  }
  async function save() {
    setError('');
    setPending(true);
    try {
      await api.request({
        path: initial
          ? `operations/${kind}/${initial.id}`
          : `operations/${kind}`,
        method: initial ? 'PATCH' : 'POST',
        json: {
          name: value.name,
          supplierId: value.supplierId,
          businessDate: value.businessDate,
          notes: value.notes,
          payload,
          amount: value.amount,
          version: initial?.version,
          requestId,
        },
      });
      await cache.invalidateQueries({ queryKey: ['operations'] });
      toast.show({ type: 'success', title: t('ops.saved') });
      void navigate(
        { pathname: '..', search: location.search },
        { replace: true },
      );
    } catch (e) {
      setError(failure(e));
    } finally {
      setPending(false);
    }
  }
  return (
    <form
      className='space-y-8'
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <fieldset disabled={pending} className='space-y-8'>
        <div className='grid gap-5 rounded-xl border p-6 md:grid-cols-2'>
          {wrap(
            'name',
            <Input
              required
              maxLength={200}
              aria-label={t('ops.fields.name')}
              value={value.name}
              onChange={(e) => patch({ name: e.target.value })}
            />,
          )}
          {wrap(
            'businessDate',
            <DatePicker
              label={t('ops.fields.businessDate')}
              value={value.businessDate ?? ''}
              onChange={(businessDate) => patch({ businessDate })}
            />,
          )}
          {![
            'suppliers',
            'materials',
            'warehouses',
            'taxScenarios',
            'policies',
          ].includes(kind) &&
            wrap(
              'supplierId',
              <NativeSelect
                aria-label={t('ops.fields.supplierId')}
                value={value.supplierId ?? ''}
                onChange={(e) => patch({ supplierId: e.target.value || null })}
              >
                <NativeSelectOption value=''>
                  {t('ops.choose')}
                </NativeSelectOption>
                {lookups.suppliers?.map((d) => (
                  <NativeSelectOption key={d.id} value={d.id}>
                    {d.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>,
            )}
          {kind === 'suppliers' && (
            <>
              {text('contact')}
              {text('terms', 'number')}
            </>
          )}
          {kind === 'materials' && (
            <>
              {text('unit')}
              {text('reorderPoint', 'number')}
              {text('openingStock', 'number')}
              {select('warehouseId', 'warehouses')}
            </>
          )}
          {['dispatches', 'receipts', 'invoices', 'settlements'].includes(
            kind,
          ) &&
            select('orderId', 'orders', (d) =>
              ['confirmed', 'partial', 'received'].includes(d.status),
            )}
          {kind === 'dispatches' && text('tracking')}
          {kind === 'receipts' && select('warehouseId', 'warehouses')}
          {kind === 'invoices' && text('invoiceNumber')}
          {kind === 'settlements' && (
            <>
              {select(
                'receiptId',
                'receipts',
                (d) =>
                  d.payload.orderId === payload.orderId &&
                  d.status === 'posted',
              )}
              {select(
                'invoiceId',
                'invoices',
                (d) => d.payload.orderId === payload.orderId,
              )}
            </>
          )}
          {kind === 'payments' && (
            <>
              {select(
                'settlementId',
                'settlements',
                (d) => d.status === 'approved',
              )}
              {wrap(
                'amount',
                <Input
                  aria-label={t('ops.fields.amount')}
                  type='number'
                  min='0.01'
                  step='0.01'
                  value={(value.amount ?? 0) / 100}
                  onChange={(e) =>
                    patch({ amount: Math.round(Number(e.target.value) * 100) })
                  }
                />,
              )}
            </>
          )}
          {kind === 'reconciliations' &&
            (['from', 'to'] as const).map((key) =>
              wrap(
                key,
                <DatePicker
                  label={t(`ops.fields.${key}`)}
                  value={payload[key] ?? ''}
                  onChange={(date) => field({ [key]: date })}
                />,
              ),
            )}
          {kind === 'taxScenarios' && (
            <div className='col-span-full text-sm text-muted-foreground'>
              {t('ops.taxNote')}
            </div>
          )}
          {kind === 'taxScenarios' && (
            <>
              {text('inputTax', 'number')}
              {text('outputTax', 'number')}
              {text('deductible', 'number')}
            </>
          )}
          {kind === 'policies' && (
            <>
              {wrap(
                'template',
                <NativeSelect
                  aria-label={t('ops.fields.template')}
                  value={payload.template}
                  onChange={(e) => field({ template: e.target.value })}
                >
                  {['reorder', 'delivery', 'matching', 'payment'].map((k) => (
                    <NativeSelectOption key={k} value={k}>
                      {t(`ops.templates.${k}`)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>,
              )}
              {text('threshold', 'number')}
              {text('timezone')}
              {(['validFrom', 'validTo'] as const).map((key) =>
                wrap(
                  key,
                  <DatePicker
                    label={t(`ops.fields.${key}`)}
                    value={payload[key] ?? ''}
                    onChange={(date) => field({ [key]: date })}
                  />,
                ),
              )}
            </>
          )}
          {wrap(
            'notes',
            <Input
              maxLength={4000}
              aria-label={t('ops.fields.notes')}
              value={value.notes ?? ''}
              onChange={(e) => patch({ notes: e.target.value })}
            />,
          )}
        </div>
        {lineKinds.includes(kind) && (
          <section className='space-y-4'>
            <div className='flex items-center justify-between'>
              <h2 className='text-lg font-semibold'>{t('ops.lines')}</h2>
              {['plans', 'orders'].includes(kind) && (
                <Button
                  type='button'
                  variant='outline'
                  onClick={() =>
                    field({
                      lines: [
                        ...(payload.lines ?? []),
                        {
                          id: crypto.randomUUID(),
                          materialId: '',
                          quantity: 1,
                          price: 0,
                          taxRate: 13,
                        },
                      ],
                    })
                  }
                >
                  {t('ops.addLine')}
                </Button>
              )}
            </div>
            <div className='overflow-x-auto rounded-xl border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    {[
                      'materialId',
                      'quantity',
                      'price',
                      'taxRate',
                      ...(kind === 'receipts' ? ['accepted', 'rejected'] : []),
                      'actions',
                    ].map((k) => (
                      <TableHead key={k}>{t(`ops.fields.${k}`)}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payload.lines?.map((l, index) => (
                    <TableRow key={l.id}>
                      <TableCell>
                        <NativeSelect
                          aria-label={t('ops.fields.materialId')}
                          disabled={!!payload.orderId}
                          value={l.materialId}
                          onChange={(e) =>
                            line(index, { materialId: e.target.value })
                          }
                        >
                          <NativeSelectOption value=''>
                            {t('ops.choose')}
                          </NativeSelectOption>
                          {lookups.materials?.map((m) => (
                            <NativeSelectOption key={m.id} value={m.id}>
                              {m.name}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </TableCell>
                      {(
                        [
                          'quantity',
                          'price',
                          'taxRate',
                          ...(kind === 'receipts'
                            ? ['accepted', 'rejected']
                            : []),
                        ] as (keyof Line)[]
                      ).map((key) => (
                        <TableCell key={key}>
                          <Input
                            aria-label={t(`ops.fields.${key}`)}
                            className='min-w-24'
                            type='number'
                            step='any'
                            min='0'
                            value={String(l[key] ?? 0)}
                            onChange={(e) =>
                              line(index, { [key]: Number(e.target.value) })
                            }
                          />
                        </TableCell>
                      ))}
                      <TableCell>
                        <Button
                          variant='ghost'
                          type='button'
                          onClick={() =>
                            field({
                              lines: payload.lines!.filter(
                                (_, i) => i !== index,
                              ),
                            })
                          }
                        >
                          {t('ops.remove')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {!payload.lines?.length && (
              <p className='text-sm text-muted-foreground'>
                {t(payload.orderId ? 'ops.empty' : 'ops.lineHint')}
              </p>
            )}
            <div className='text-right font-semibold'>
              {t('ops.fields.amount')} ·{' '}
              {money(lineTotals(payload.lines ?? []).amount, i18n.language)}
            </div>
          </section>
        )}
        {error && (
          <p role='alert' className='text-destructive'>
            {t(`ops.errors.${error}`, { defaultValue: t('ops.error') })}
          </p>
        )}
        <div className='flex justify-end gap-3'>
          <Button
            type='button'
            variant='outline'
            onClick={() =>
              void navigate(
                { pathname: '..', search: location.search },
                { replace: true },
              )
            }
          >
            {t('ops.cancel')}
          </Button>
          <Button type='submit'>
            {t(pending ? 'ops.saving' : 'ops.save')}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
