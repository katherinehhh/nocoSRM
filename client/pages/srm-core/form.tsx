import { Alert, AlertDescription } from '#components/ui/alert';
import { sourceValues } from './source-values.js';
import { useState, useEffect, useRef } from 'react';
import {
  useNavigate,
  useLocation,
  useParams,
  useSearchParams,
  useBlocker,
  useBeforeUnload,
} from 'react-router';
import { useTranslation } from '@nocobase/i18n/client';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { RouteChildPage } from '#components/route-child-page';
import { BackButton } from '#components/back-button';
import { DatePicker } from '#components/date-picker';
import { useDirtyClose } from '#hooks/use-dirty-close';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import { Textarea } from '#components/ui/textarea';
import { Checkbox } from '#components/ui/checkbox';
import { Card, CardHeader, CardTitle, CardContent } from '#components/ui/card';
import { NativeSelect, NativeSelectOption } from '#components/ui/native-select';
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from '#components/ui/table';
import { State } from '../showcase/states.js';
import { useChildFocus } from '../showcase/common.js';
import {
  useCore,
  useCoreKind,
  useCoreWrite,
  coreError,
  type CoreLookups,
  type DetailData,
} from './common.js';
import {
  CoreInput,
  CoreDataSchema,
  type CoreData,
  type CoreKind,
  type CoreView,
} from '../../../shared/srm-core.js';
import type { Doc } from '../../../shared/operations.js';
type Values = {
  name: string;
  sourceId: string;
  supplierId: string | null;
  deadline: string;
  data: CoreData;
};
type Source = Doc | CoreView;
function sources(kind: CoreKind, lookups: CoreLookups): Source[] {
  return kind === 'admission'
    ? lookups.suppliers
    : kind === 'quote'
      ? lookups.rfqs
      : kind === 'inspection'
        ? lookups.receipts
        : kind === 'return'
          ? lookups.inspections
          : [];
}
export default function CoreFormPage() {
  useChildFocus();
  const kind = useCoreKind(),
    { id } = useParams(),
    record = useCore<{ data: DetailData }>(`${kind}/${id}`, {}, !!id),
    lookups = useCore<{ data: CoreLookups }>(`lookups/${kind}`);
  return (
    <RouteChildPage>
      <PageContainer>
        <State
          loading={lookups.isPending || (!!id && record.isPending)}
          error={lookups.error || record.error}
          retry={() => {
            void lookups.refetch();
            if (id) void record.refetch();
          }}
        />
        {lookups.data && (!id || record.data) && (
          <Editor
            key={id ?? 'new'}
            kind={kind}
            record={record.data?.data.record}
            lookups={lookups.data.data}
          />
        )}
      </PageContainer>
    </RouteChildPage>
  );
}
function Editor({
  kind,
  record,
  lookups,
}: {
  kind: CoreKind;
  record?: CoreView;
  lookups: CoreLookups;
}) {
  const { t } = useTranslation(),
    [params] = useSearchParams(),
    location = useLocation(),
    navigate = useNavigate(),
    write = useCoreWrite(),
    formRef = useRef<HTMLFormElement>(null);
  const [value, setValue] = useState<Values>(() => {
    if (record)
      return {
        name: record.name,
        sourceId: record.sourceId,
        supplierId: record.supplierId,
        deadline: record.deadline,
        data: CoreDataSchema.strip().parse(record.data),
      };
    const initial: Values = {
      name: '',
      sourceId: '',
      supplierId: null,
      deadline: '',
      data: kind === 'rfq' ? { lines: [], supplierIds: [] } : {},
    };
    const source = sources(kind, lookups).find(
      (s) => s.id === params.get('sourceId'),
    );
    return source
      ? {
          ...initial,
          ...sourceValues(kind, source),
          name: `${t(`core.kinds.${kind}`)} · ${source.number}`,
        }
      : initial;
  });
  const [dirty, setDirty] = useState(false),
    [pending, setPending] = useState(false),
    [key] = useState(() => crypto.randomUUID()),
    [error, setError] = useState(''),
    [attempted, setAttempted] = useState(false),
    [errors, setErrors] = useState<Record<string, string>>({});
  const close = useDirtyClose(dirty, pending),
    sourceClose = useDirtyClose(dirty, pending, {
      title: t('core.changeSource'),
      description: t('core.changeSourceHint'),
    });
  const askedRef = useRef(false);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      (dirty || pending) && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (blocker.state !== 'blocked') {
      askedRef.current = false;
      return;
    }
    if (askedRef.current) return;
    askedRef.current = true;
    void Promise.resolve(close.beforeClose()).then((ok) =>
      ok ? blocker.proceed() : blocker.reset(),
    );
  }, [blocker, close]);
  useBeforeUnload((e) => {
    if (dirty || pending) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  function patch(values: Partial<Values>) {
    setDirty(true);
    setValue((old) => ({ ...old, ...values }));
  }
  function field(values: Partial<CoreData>) {
    setDirty(true);
    setValue((old) => ({ ...old, data: { ...old.data, ...values } }));
  }
  function problems(v: Values) {
    const result: Record<string, string> = {};
    if (!v.name.trim()) result.name = t('core.required');
    if (kind !== 'rfq' && !v.sourceId) result.sourceId = t('core.required');
    if (kind === 'rfq' && !v.deadline) result.deadline = t('core.required');
    if (kind === 'rfq' && !v.data.supplierIds?.length)
      result.supplierIds = t('core.required');
    for (const name of kind === 'admission'
      ? ['qualification', 'validUntil', 'evidence']
      : kind === 'quote'
        ? ['deliveryDate', 'validUntil']
        : kind === 'inspection'
          ? ['criteria', 'evidence']
          : kind === 'return'
            ? ['reason']
            : [])
      if (!v.data[name as keyof CoreData]) result[name] = t('core.required');
    if (
      kind !== 'admission' &&
      (!v.data.lines?.length ||
        v.data.lines.some(
          (l) =>
            !l.materialId ||
            !Number.isInteger(l.quantity) ||
            l.quantity <= 0 ||
            (kind === 'quote' && (!Number.isInteger(l.price) || !l.price)) ||
            (kind === 'inspection' &&
              (!Number.isInteger(l.accepted) ||
                !Number.isInteger(l.rejected) ||
                (l.accepted ?? 0) + (l.rejected ?? 0) !== l.quantity)),
        ))
    )
      result.lines = t('core.invalidLines');
    return result;
  }
  const visible = attempted ? problems(value) : errors;
  function blur(name: string) {
    setErrors((old) => {
      const next = { ...old };
      const error = problems(value)[name];
      if (error) next[name] = error;
      else delete next[name];
      return next;
    });
  }
  function wrap(name: string, node: React.ReactNode) {
    return (
      <div
        key={name}
        className='flex flex-col gap-2'
        data-invalid={!!visible[name]}
        onBlurCapture={() => blur(name)}
      >
        <Label htmlFor={`core-${name}`}>
          {t(`core.fields.${name}`)}
          {(['name', 'sourceId', 'deadline', 'supplierIds'].includes(name) ||
            (kind === 'admission'
              ? ['qualification', 'validUntil', 'evidence']
              : kind === 'quote'
                ? ['validUntil', 'deliveryDate']
                : kind === 'inspection'
                  ? ['criteria', 'evidence']
                  : kind === 'return'
                    ? ['reason']
                    : []
            ).includes(name)) &&
            ' *'}
        </Label>
        {node}
        {visible[name] && (
          <p role='alert' className='text-sm text-destructive'>
            {visible[name]}
          </p>
        )}
      </div>
    );
  }
  function text(
    name: 'qualification' | 'evidence' | 'criteria' | 'reason' | 'tracking',
    multiline = false,
  ) {
    const props = {
      id: `core-${name}`,
      value: String(value.data[name] ?? ''),
      onChange: (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
      ) => field({ [name]: e.target.value }),
      'aria-invalid': !!visible[name],
    };
    return wrap(
      name,
      multiline ? <Textarea {...props} /> : <Input {...props} />,
    );
  }
  function date(name: 'deadline' | 'validUntil' | 'deliveryDate') {
    return wrap(
      name,
      <DatePicker
        value={name === 'deadline' ? value.deadline : (value.data[name] ?? '')}
        label={t(`core.fields.${name}`)}
        disabled={pending}
        onChange={(next) =>
          name === 'deadline'
            ? patch({ deadline: next })
            : field({ [name]: next })
        }
      />,
    );
  }
  async function choose(id: string) {
    const source = sources(kind, lookups).find((s) => s.id === id);
    if (!source) return;
    if (value.sourceId && dirty && !(await sourceClose.beforeClose())) return;
    patch({
      ...sourceValues(kind, source),
      name: value.name || `${t(`core.kinds.${kind}`)} · ${source.number}`,
    });
    setError('');
  }
  function line(
    index: number,
    values: Partial<NonNullable<CoreData['lines']>[number]>,
  ) {
    field({
      lines: value.data.lines?.map((l, i) =>
        i === index ? { ...l, ...values } : l,
      ),
    });
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setAttempted(true);
    const issues = problems(value);
    setErrors(issues);
    if (Object.keys(issues).length) {
      requestAnimationFrame(() =>
        formRef.current
          ?.querySelector<HTMLElement>(
            '[aria-invalid="true"], [data-invalid="true"] input, [data-invalid="true"] button, [data-invalid="true"] select',
          )
          ?.focus(),
      );
      return;
    }
    setPending(true);
    setError('');
    try {
      const body = CoreInput.parse({ ...value, requestKey: key });
      const result = record
        ? await write(
            `${kind}/${record.id}/actions/edit`,
            {
              version: record.lifecycleVersion,
              requestKey: key,
              values: value,
            },
            'edit',
          )
        : await write(kind, body, 'create');
      close.allowClose();
      setDirty(false);
      setPending(false);
      await navigate(
        {
          pathname: record ? '..' : `../${result.id}`,
          search: location.search,
        },
        { replace: true },
      );
    } catch (e) {
      const code = coreError(e);
      const fieldErrors: Record<string, string> = {
        QUALIFICATION_REQUIRED: 'qualification',
        INVALID_DATE: kind === 'rfq' ? 'deadline' : 'validUntil',
        QUALITY_TOTAL: 'lines',
        PRICE_REQUIRED: 'lines',
        LINES_REQUIRED: 'lines',
        EVIDENCE_REQUIRED: 'evidence',
        REASON_REQUIRED: 'reason',
        RETURN_EXCEEDS_REJECTED: 'lines',
      };
      if (fieldErrors[code])
        setErrors((old) => ({
          ...old,
          [fieldErrors[code]]: t(`core.errors.${code}`, {
            defaultValue: t('core.error'),
          }),
        }));
      else setError(code);
      setPending(false);
    }
  }
  const title = record
    ? t('core.editTitle', { name: record.name })
    : t('core.new', { kind: t(`core.kinds.${kind}`) });
  return (
    <>
      <BackButton />
      <PageHeader
        title={title}
        description={t(`core.descriptions.${kind}`)}
        actions={
          <>
            <Button
              variant='outline'
              disabled={pending}
              onClick={() => {
                void (async () => {
                  if (await close.beforeClose())
                    await navigate(
                      { pathname: '..', search: location.search },
                      { replace: true },
                    );
                })();
              }}
            >
              {t('core.cancel')}
            </Button>
            <Button type='submit' form='srm-core-form' disabled={pending}>
              {t(pending ? 'core.saving' : 'core.save')}
            </Button>
          </>
        }
      />
      <form
        id='srm-core-form'
        ref={formRef}
        onSubmit={(e) => void submit(e)}
        className='max-w-4xl'
      >
        {error && (
          <Alert variant='destructive'>
            <AlertDescription>
              {t(`core.errors.${error}`, { defaultValue: t('core.error') })}
            </AlertDescription>
          </Alert>
        )}
        <fieldset disabled={pending} className='flex flex-col gap-6'>
          <Card>
            <CardHeader>
              <CardTitle>{t('core.basic')}</CardTitle>
            </CardHeader>
            <CardContent className='grid gap-4 sm:grid-cols-2'>
              {wrap(
                'name',
                <Input
                  id='core-name'
                  value={value.name}
                  aria-invalid={!!visible.name}
                  onChange={(e) => patch({ name: e.target.value })}
                />,
              )}
              {kind !== 'rfq' &&
                wrap(
                  'sourceId',
                  <NativeSelect
                    id='core-sourceId'
                    value={value.sourceId}
                    aria-invalid={!!visible.sourceId}
                    disabled={!!record}
                    onChange={(e) => void choose(e.target.value)}
                  >
                    <NativeSelectOption value=''>
                      {t('core.choose')}
                    </NativeSelectOption>
                    {sources(kind, lookups).map((s) => (
                      <NativeSelectOption key={s.id} value={s.id}>
                        {s.number} · {s.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>,
                )}
              {kind === 'rfq' && date('deadline')}
              {kind === 'admission' && (
                <>
                  {text('qualification')}
                  {date('validUntil')}
                  {text('evidence', true)}
                </>
              )}
              {kind === 'quote' && (
                <>
                  {date('deliveryDate')}
                  {date('validUntil')}
                </>
              )}
              {kind === 'inspection' && (
                <>
                  {text('criteria')}
                  {text('evidence', true)}
                </>
              )}
              {kind === 'return' && text('reason', true)}
            </CardContent>
          </Card>
          {kind === 'rfq' && (
            <Card>
              <CardHeader>
                <CardTitle>{t('core.inviteSuppliers')} *</CardTitle>
              </CardHeader>
              <CardContent className='grid gap-3 sm:grid-cols-2'>
                {lookups.suppliers
                  .filter((s) => s.status === 'active')
                  .map((s) => (
                    <Label key={s.id} className='flex items-center gap-2'>
                      <Checkbox
                        checked={
                          value.data.supplierIds?.includes(s.id) ?? false
                        }
                        onCheckedChange={(checked) =>
                          field({
                            supplierIds: checked
                              ? [...(value.data.supplierIds ?? []), s.id]
                              : (value.data.supplierIds ?? []).filter(
                                  (id) => id !== s.id,
                                ),
                          })
                        }
                      />
                      {s.name}
                    </Label>
                  ))}
                {visible.supplierIds && (
                  <p role='alert' className='text-sm text-destructive'>
                    {visible.supplierIds}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
          {kind !== 'admission' && (
            <Card>
              <CardHeader>
                <CardTitle>{t('core.lines')} *</CardTitle>
              </CardHeader>
              <CardContent
                className='flex flex-col gap-3 overflow-x-auto'
                data-invalid={!!visible.lines}
              >
                <p className='text-sm text-muted-foreground'>
                  {t('core.lineHint')}
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('core.fields.materialId')}</TableHead>
                      <TableHead className='text-right'>
                        {t('core.fields.quantity')}
                      </TableHead>
                      {kind === 'quote' && (
                        <>
                          <TableHead>{t('core.fields.price')}</TableHead>
                          <TableHead>{t('core.fields.tax')}</TableHead>
                        </>
                      )}
                      {kind === 'inspection' && (
                        <>
                          <TableHead>{t('core.fields.accepted')}</TableHead>
                          <TableHead>{t('core.fields.rejected')}</TableHead>
                        </>
                      )}
                      {kind === 'rfq' && <TableHead />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {value.data.lines?.map((l, index) => {
                      const material = lookups.materials.find(
                        (m) => m.id === l.materialId,
                      );
                      return (
                        <TableRow key={l.id}>
                          <TableCell>
                            {kind === 'rfq' ? (
                              <NativeSelect
                                aria-label={`${t('core.fields.materialId')} ${index + 1}`}
                                value={l.materialId}
                                aria-invalid={!!visible.lines && !l.materialId}
                                onChange={(e) =>
                                  line(index, { materialId: e.target.value })
                                }
                              >
                                <NativeSelectOption value=''>
                                  {t('core.choose')}
                                </NativeSelectOption>
                                {lookups.materials
                                  .filter((m) => m.status === 'active')
                                  .map((m) => (
                                    <NativeSelectOption key={m.id} value={m.id}>
                                      {m.number} · {m.name}
                                    </NativeSelectOption>
                                  ))}
                              </NativeSelect>
                            ) : (
                              (material?.name ?? l.materialId)
                            )}
                          </TableCell>
                          <TableCell className='text-right'>
                            {['rfq', 'return'].includes(kind) ? (
                              <Input
                                type='number'
                                step='1'
                                min='1'
                                aria-label={`${t('core.fields.quantity')} ${index + 1}`}
                                value={l.quantity}
                                onChange={(e) =>
                                  line(index, {
                                    quantity: Number(e.target.value),
                                  })
                                }
                              />
                            ) : (
                              l.quantity
                            )}
                          </TableCell>
                          {kind === 'quote' && (
                            <>
                              <TableCell>
                                <Input
                                  type='number'
                                  step='0.01'
                                  min='0.01'
                                  aria-label={`${t('core.fields.price')} ${index + 1}`}
                                  value={
                                    l.price === undefined ? '' : l.price / 100
                                  }
                                  onChange={(e) =>
                                    line(index, {
                                      price: Math.round(
                                        Number(e.target.value) * 100,
                                      ),
                                    })
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type='number'
                                  step='0.01'
                                  min='0'
                                  max='100'
                                  aria-label={`${t('core.fields.tax')} ${index + 1}`}
                                  value={(l.taxRateBps ?? 0) / 100}
                                  onChange={(e) =>
                                    line(index, {
                                      taxRateBps: Math.round(
                                        Number(e.target.value) * 100,
                                      ),
                                    })
                                  }
                                />
                              </TableCell>
                            </>
                          )}
                          {kind === 'inspection' &&
                            (['accepted', 'rejected'] as const).map((field) => (
                              <TableCell key={field}>
                                <Input
                                  type='number'
                                  step='1'
                                  min='0'
                                  aria-label={`${t(`core.fields.${field}`)} ${index + 1}`}
                                  value={l[field] ?? 0}
                                  onChange={(e) =>
                                    line(index, {
                                      [field]: Number(e.target.value),
                                    })
                                  }
                                />
                              </TableCell>
                            ))}
                          {kind === 'rfq' && (
                            <TableCell>
                              <Button
                                variant='ghost'
                                type='button'
                                onClick={() =>
                                  field({
                                    lines: value.data.lines?.filter(
                                      (_, i) => i !== index,
                                    ),
                                  })
                                }
                              >
                                {t('core.removeLine')}
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {kind === 'rfq' && (
                  <Button
                    variant='outline'
                    type='button'
                    onClick={() =>
                      field({
                        lines: [
                          ...(value.data.lines ?? []),
                          {
                            id: crypto.randomUUID(),
                            materialId: '',
                            quantity: 1,
                          },
                        ],
                      })
                    }
                  >
                    {t('core.addLine')}
                  </Button>
                )}
                {visible.lines && (
                  <p role='alert' className='text-sm text-destructive'>
                    {visible.lines}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
          {lookups.capped && (
            <p className='text-sm text-muted-foreground'>
              {t('core.lookupCap')}
            </p>
          )}
        </fieldset>
      </form>
      {close.confirmation}
      {sourceClose.confirmation}
    </>
  );
}
