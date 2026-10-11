import { useState } from 'react';
import { Link, Outlet, useParams, useLocation } from 'react-router';
import { useApiClient, useToaster } from '@nocobase/app-client';
import { useQueryClient } from '@tanstack/react-query';
import { RouteDrawer } from '#components/route-drawer';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
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
  type Doc,
  type Kind,
  type RunItem,
  transitions,
} from '../../../shared/operations.js';
import {
  useKind,
  useCopy,
  useData,
  useCapabilities,
  money,
  failure,
  type Lookups,
} from './common.js';
import { State, Status } from './states.js';

export default function Detail({ related = false }: { related?: boolean }) {
  const baseKind = useKind(),
    params = useParams();
  const kind = related ? (params.relatedKind as Kind) : baseKind,
    id = related ? params.relatedId : params.id,
    { t, i18n } = useCopy(),
    location = useLocation(),
    api = useApiClient(),
    cache = useQueryClient(),
    toast = useToaster();
  const query = useData<{ data: Doc }>(`${kind}/${id}`),
    lookups = useData<{ data: Lookups }>(`lookups/${kind}`),
    caps = useCapabilities(),
    history = useData<{
      data: {
        id: string;
        action: string;
        at: string;
        actorId: string;
        toStatus: string;
      }[];
    }>(`${kind}/${id}/history`);
  const [action, setAction] = useState(''),
    [reason, setReason] = useState(''),
    [reference, setReference] = useState(''),
    [date, setDate] = useState(() => new Date().toISOString().slice(0, 10)),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false),
    [preview, setPreview] = useState<RunItem[] | null>(null);
  const doc = query.data?.data;
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  function selectAction(next: string) {
    setAction(next);
    setReason('');
    setReference('');
    setError('');
    setRequestId(crypto.randomUUID());
  }
  async function execute() {
    if (!doc) return;
    setPending(true);
    setError('');
    try {
      const res = await api.request<{
        data: Doc | { items: RunItem[]; dryRun: boolean };
      }>({
        path: `operations/${kind}/${doc.id}/actions/${action}`,
        method: 'POST',
        json: {
          version: doc.version,
          requestId,
          reason,
          reference,
          businessDate: date,
        },
      });
      if ('dryRun' in res.data) setPreview(res.data.items);
      else {
        if (res.data.id === doc.id)
          cache.setQueryData(['operations', `${kind}/${id}`, {}], {
            data: res.data,
          });
        await cache.invalidateQueries({ queryKey: ['operations'] });
      }
      toast.show({ type: 'success', title: t('ops.done') });
      setAction('');
    } catch (e) {
      setError(failure(e));
    } finally {
      setPending(false);
    }
  }
  const permitted = caps.data?.data.permissions[kind] ?? [];
  return (
    <RouteDrawer
      title={doc?.name ?? t(`ops.kinds.${kind}`)}
      description={doc?.number}
      beforeClose={() => !pending}
    >
      <State
        loading={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
      {doc && (
        <div className='space-y-6'>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <Status value={doc.status} />
            <span className='text-2xl font-semibold tabular-nums'>
              {money(doc.amount, i18n.language)}
            </span>
          </div>
          <dl className='grid grid-cols-2 gap-4 text-sm'>
            {[
              ['businessDate', doc.businessDate],
              [
                'supplierId',
                lookups.data?.data.suppliers?.find(
                  (s) => s.id === doc.supplierId,
                )?.name ?? '—',
              ],
              ['version', doc.version],
              ['notes', doc.notes || '—'],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className='text-muted-foreground'>
                  {t(`ops.fields.${k}`)}
                </dt>
                <dd className='mt-1 break-words'>{v}</dd>
              </div>
            ))}
          </dl>
          {Object.entries(doc.payload)
            .filter(
              ([k, v]) =>
                typeof v !== 'object' &&
                !['submittedBy', 'approvedBy', 'requesterId', 'lines'].includes(
                  k,
                ),
            )
            .map(([key, v]) => {
              const related: Record<string, Kind> = {
                orderId: 'orders',
                receiptId: 'receipts',
                invoiceId: 'invoices',
                settlementId: 'settlements',
                policyId: 'policies',
                warehouseId: 'warehouses',
              };
              return (
                <div
                  key={key}
                  className='flex justify-between gap-4 border-b pb-2 text-sm'
                >
                  <span className='text-muted-foreground'>
                    {t(`ops.fields.${key}`, { defaultValue: key })}
                  </span>
                  {related[key] &&
                  caps.data?.data.permissions[related[key]].includes('view') ? (
                    <Link
                      className='text-primary'
                      to={{
                        pathname: `related/${related[key]}/${String(v)}`,
                        search: location.search,
                      }}
                    >
                      {lookups.data?.data[related[key]]?.find((r) => r.id === v)
                        ?.number ?? t('ops.related')}
                    </Link>
                  ) : (
                    <span className='break-all text-right'>
                      {[
                        'net',
                        'tax',
                        'paid',
                        'opening',
                        'closing',
                        'calculated',
                      ].includes(key)
                        ? money(Number(v), i18n.language)
                        : key === 'template'
                          ? t(`ops.templates.${v}`)
                          : key === 'reason'
                            ? t(`ops.errors.${v}`, { defaultValue: String(v) })
                            : String(v)}
                    </span>
                  )}
                </div>
              );
            })}
          {doc.payload.conflicts?.map((c) => (
            <p key={c} role='alert' className='text-destructive'>
              {t(`ops.errors.${c}`)}
            </p>
          ))}
          {doc.payload.lines && (
            <div className='overflow-x-auto'>
              <Table>
                <TableHeader>
                  <TableRow>
                    {['materialId', 'quantity', 'price', 'taxRate'].map((k) => (
                      <TableHead key={k}>{t(`ops.fields.${k}`)}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {doc.payload.lines.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>
                        {lookups.data?.data.materials?.find(
                          (m) => m.id === l.materialId,
                        )?.name ?? l.materialId}
                      </TableCell>
                      <TableCell>{l.quantity}</TableCell>
                      <TableCell>
                        {money(Math.round(l.price * 100), i18n.language)}
                      </TableCell>
                      <TableCell>{l.taxRate}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <div className='flex flex-wrap gap-2'>
            {!related &&
              permitted.includes('edit') &&
              ['draft', 'active', 'disabled'].includes(doc.status) && (
                <Button
                  variant='outline'
                  nativeButton={false}
                  render={
                    <Link to={{ pathname: 'edit', search: location.search }} />
                  }
                >
                  {t('ops.edit')}
                </Button>
              )}
            {Object.entries(transitions[kind] ?? {})
              .filter(
                ([key, r]) =>
                  r.from.includes(doc.status) && permitted.includes(key),
              )
              .map(([key]) => (
                <Button
                  variant='outline'
                  disabled={pending}
                  key={key}
                  onClick={() => selectAction(key)}
                >
                  {t(`ops.actions.${key}`)}
                </Button>
              ))}
          </div>
          {action && (
            <div className='space-y-4 rounded-xl border p-4'>
              <h3 className='font-medium'>
                {t('ops.confirmAction', { action: t(`ops.actions.${action}`) })}
              </h3>
              {['reject', 'dispute'].includes(action) && (
                <div className='space-y-2'>
                  <Label>{t('ops.fields.reason')}</Label>
                  <Input
                    aria-label={t('ops.fields.reason')}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    disabled={pending}
                  />
                </div>
              )}
              {action === 'record' && (
                <>
                  <p className='text-sm text-muted-foreground'>
                    {t('ops.paymentNote')}
                  </p>
                  <Input
                    aria-label={t('ops.fields.reference')}
                    placeholder={t('ops.fields.reference')}
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    disabled={pending}
                  />
                  <DatePicker
                    label={t('ops.fields.businessDate')}
                    value={date}
                    onChange={setDate}
                    disabled={pending}
                  />
                </>
              )}
              {error && (
                <p role='alert' className='text-destructive'>
                  {t(`ops.errors.${error}`, { defaultValue: t('ops.error') })}
                </p>
              )}
              <div className='flex justify-end gap-2'>
                <Button
                  variant='outline'
                  disabled={pending}
                  onClick={() => setAction('')}
                >
                  {t('ops.cancel')}
                </Button>
                <Button disabled={pending} onClick={() => void execute()}>
                  {t(pending ? 'ops.saving' : 'ops.confirm')}
                </Button>
              </div>
            </div>
          )}
          {(preview || doc.payload.items) && (
            <section className='space-y-3'>
              <h3 className='font-semibold'>
                {t(preview ? 'ops.preview' : 'ops.results')}
              </h3>
              {(preview ?? doc.payload.items ?? []).map((item) => (
                <div
                  className='flex justify-between gap-4 rounded-lg border p-3 text-sm'
                  key={`${item.kind}-${item.targetId}-${item.action}`}
                >
                  <Link
                    className='text-primary'
                    to={{
                      pathname: `related/${item.kind}/${item.targetId}`,
                      search: location.search,
                    }}
                  >
                    {t(`ops.kinds.${item.kind}`)} · {item.targetId.slice(0, 8)}
                  </Link>
                  <Status value={item.status} />
                </div>
              ))}
              {(preview ?? doc.payload.items ?? []).length === 0 && (
                <p className='text-sm text-muted-foreground'>
                  {t('ops.noHits')}
                </p>
              )}
            </section>
          )}
          <section className='space-y-3'>
            <h3 className='font-semibold'>{t('ops.history')}</h3>
            <State
              loading={history.isPending}
              error={history.error}
              retry={() => void history.refetch()}
            />
            {history.data?.data.map((event) => (
              <div
                className='flex justify-between gap-3 border-l-2 pl-3 text-sm'
                key={event.id}
              >
                <span>
                  {t(`ops.actions.${event.action}`, {
                    defaultValue: event.action,
                  })}{' '}
                  ·{' '}
                  {t(`ops.status.${event.toStatus}`, {
                    defaultValue: event.toStatus,
                  })}
                </span>
                <time className='text-muted-foreground'>
                  {new Date(event.at).toLocaleString(i18n.language)}
                </time>
              </div>
            ))}
          </section>
        </div>
      )}
      <Outlet />
    </RouteDrawer>
  );
}
