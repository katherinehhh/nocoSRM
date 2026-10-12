import { CoreStatus } from './presentation.js';
import { useState } from 'react';
import { Link, Outlet, useLocation, useParams } from 'react-router';
import { useTranslation } from '@nocobase/i18n/client';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { RouteChildPage } from '#components/route-child-page';
import { BackButton } from '#components/back-button';
import { Card, CardHeader, CardTitle, CardContent } from '#components/ui/card';
import { Button } from '#components/ui/button';
import { Textarea } from '#components/ui/textarea';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import { NativeSelect, NativeSelectOption } from '#components/ui/native-select';
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
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '#components/ui/table';
import { State, Refresh } from '../showcase/states.js';
import { useChildFocus } from '../showcase/common.js';
import {
  useCore,
  useCoreKind,
  useCoreWrite,
  coreError,
  money,
  type DetailData,
  type CoreLookups,
} from './common.js';
import {
  corePaths,
  coreAmounts,
  type CoreKind,
} from '../../../shared/srm-core.js';
export default function CoreDetail({
  kind: override,
  idParam = 'id',
}: { kind?: CoreKind; idParam?: string } = {}) {
  useChildFocus();
  const inferredKind = useCoreKind(),
    kind = override ?? inferredKind,
    id = useParams()[idParam],
    location = useLocation(),
    { t, i18n } = useTranslation(),
    q = useCore<{ data: DetailData }>(`${kind}/${id}`),
    lookups = useCore<{ data: CoreLookups }>(`lookups/${kind}`),
    write = useCoreWrite(),
    caps = useCore<{ data: { permissions: Record<string, string[]> } }>(
      'capabilities',
    );
  const [action, setAction] = useState(''),
    [reason, setReason] = useState(''),
    [quote, setQuote] = useState(''),
    [tracking, setTracking] = useState(''),
    [key, setKey] = useState(() => crypto.randomUUID()),
    [pending, setPending] = useState(false),
    [error, setError] = useState('');
  const d = q.data?.data,
    r = d?.record;
  const choose = (name: string) => {
    setKey(crypto.randomUUID());
    setAction(name);
    setReason('');
    setTracking('');
    setError('');
  };
  const execute = async () => {
    if (!r || pending) return;
    setPending(true);
    setError('');
    try {
      await write(
        `${kind}/${r.id}/actions/${action}`,
        {
          version: r.lifecycleVersion,
          requestKey: key,
          reason,
          tracking,
          ...(quote ? { selectedQuoteId: quote } : {}),
        },
        action,
      );
      setAction('');
      await q.refetch();
    } catch (e) {
      setError(coreError(e));
    } finally {
      setPending(false);
    }
  };
  const sourcePath =
    kind === 'admission'
      ? '/supply/suppliers'
      : kind === 'inspection'
        ? '/supply/receipts'
        : kind === 'quote'
          ? corePaths.rfq
          : corePaths.inspection;
  return (
    <>
      <RouteChildPage>
        <PageContainer>
          <BackButton />
          <PageHeader
            title={r?.name ?? t(`core.kinds.${kind}`)}
            description={r?.number}
            actions={
              <>
                {d?.available.includes('edit') && (
                  <Button
                    variant='outline'
                    nativeButton={false}
                    render={
                      <Link
                        to={{ pathname: 'edit', search: location.search }}
                      />
                    }
                  >
                    {t('core.actions.edit')}
                  </Button>
                )}
                <Refresh
                  pending={q.isFetching}
                  onClick={() => void q.refetch()}
                />
              </>
            }
          />
          <State
            loading={q.isPending}
            error={q.error}
            retry={() => void q.refetch()}
          />
          {r && d && (
            <>
              {((kind === 'rfq' &&
                d.available.some((a) => ['edit', 'nominate'].includes(a))) ||
                (kind === 'inspection' &&
                  r.status === 'approved' &&
                  d.source?.status === 'posted' &&
                  caps.data?.data.permissions.return?.includes('create'))) && (
                <Card>
                  <CardHeader>
                    <CardTitle>{t('srmAi.title')}</CardTitle>
                  </CardHeader>
                  <CardContent className='flex flex-wrap items-center justify-between gap-3'>
                    <p className='text-sm text-muted-foreground'>
                      {t('srmAi.hint')}
                    </p>
                    <Button
                      variant='outline'
                      nativeButton={false}
                      render={
                        <Link
                          to={{ pathname: 'ai', search: location.search }}
                        />
                      }
                    >
                      {t('srmAi.analyze')}
                    </Button>
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardHeader>
                  <CardTitle>
                    <CoreStatus status={r.status} />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className='grid gap-4 sm:grid-cols-2'>
                    {[
                      ['version', r.lifecycleVersion],
                      [
                        'deadline',
                        r.deadline
                          ? new Date(
                              `${r.deadline}T12:00:00`,
                            ).toLocaleDateString(i18n.language)
                          : '—',
                      ],
                      [
                        'supplierId',
                        lookups.data?.data.suppliers.find(
                          (s) => s.id === r.supplierId,
                        )?.name ?? '—',
                      ],
                      [
                        'updatedAt',
                        new Date(r.updatedAt).toLocaleString(i18n.language),
                      ],
                    ].map(([field, value]) => (
                      <div key={field} className='grid grid-cols-3 gap-3'>
                        <dt className='text-sm text-muted-foreground'>
                          {t(`core.fields.${field}`)}
                        </dt>
                        <dd className='col-span-2 break-words'>{value}</dd>
                      </div>
                    ))}
                  </dl>
                  {d.source &&
                    (kind === 'return' &&
                    !caps.data?.data.permissions.inspection?.includes(
                      'view',
                    ) ? (
                      <p className='text-sm'>
                        {t('core.source')}: {d.source.number} · {d.source.name}
                      </p>
                    ) : (
                      <Button
                        variant='link'
                        nativeButton={false}
                        render={<Link to={`${sourcePath}/${r.sourceId}`} />}
                      >
                        {t('core.source')}: {d.source.number} · {d.source.name}
                      </Button>
                    ))}
                  {kind === 'quote' &&
                    d.source &&
                    'data' in d.source &&
                    d.source.status === 'awarded' && (
                      <p className='text-sm'>
                        {t(
                          d.source.data.selectedQuoteId === r.id
                            ? 'core.quoteSelected'
                            : 'core.rfqEnded',
                        )}
                      </p>
                    )}
                  {r.data.orderId && (
                    <Button
                      variant='link'
                      nativeButton={false}
                      render={<Link to={`/supply/orders/${r.data.orderId}`} />}
                    >
                      {t('core.generatedOrder')}
                    </Button>
                  )}
                </CardContent>
              </Card>
              {(r.data.lines?.length ?? 0) > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>{t('core.lines')}</CardTitle>
                  </CardHeader>
                  <CardContent className='overflow-x-auto'>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('core.fields.materialId')}</TableHead>
                          <TableHead className='text-right'>
                            {t('core.fields.quantity')}
                          </TableHead>
                          {kind === 'quote' && (
                            <>
                              <TableHead className='text-right'>
                                {t('core.fields.price')}
                              </TableHead>
                              <TableHead className='text-right'>
                                {t('core.fields.tax')}
                              </TableHead>
                            </>
                          )}
                          {kind === 'inspection' && (
                            <>
                              <TableHead className='text-right'>
                                {t('core.fields.accepted')}
                              </TableHead>
                              <TableHead className='text-right'>
                                {t('core.fields.rejected')}
                              </TableHead>
                            </>
                          )}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {r.data.lines!.map((l) => (
                          <TableRow key={l.id}>
                            <TableCell>
                              {lookups.data?.data.materials.find(
                                (m) => m.id === l.materialId,
                              )?.name ?? l.materialId}
                            </TableCell>
                            <TableCell className='text-right tabular-nums'>
                              {new Intl.NumberFormat(i18n.language).format(
                                l.quantity,
                              )}
                            </TableCell>
                            {kind === 'quote' && (
                              <>
                                <TableCell className='text-right tabular-nums'>
                                  {money(l.price ?? 0, i18n.language)}
                                </TableCell>
                                <TableCell className='text-right tabular-nums'>
                                  {(l.taxRateBps ?? 0) / 100}%
                                </TableCell>
                              </>
                            )}
                            {kind === 'inspection' && (
                              <>
                                <TableCell className='text-right'>
                                  {new Intl.NumberFormat(i18n.language).format(
                                    l.accepted ?? 0,
                                  )}
                                </TableCell>
                                <TableCell className='text-right'>
                                  {new Intl.NumberFormat(i18n.language).format(
                                    l.rejected ?? 0,
                                  )}
                                </TableCell>
                              </>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {kind === 'quote' && (
                      <p className='text-right font-medium'>
                        {t('core.gross')}: {money(r.total, i18n.language)}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardHeader>
                  <CardTitle>{t('core.evidence')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className='grid gap-4 sm:grid-cols-2'>
                    {(
                      [
                        'qualification',
                        'validUntil',
                        'deliveryDate',
                        'criteria',
                        'evidence',
                        'reason',
                        'decisionReason',
                        'tracking',
                      ] as const
                    )
                      .filter((field) =>
                        (kind === 'admission'
                          ? ['qualification', 'validUntil', 'evidence']
                          : kind === 'quote'
                            ? ['validUntil', 'deliveryDate', 'evidence']
                            : kind === 'inspection'
                              ? ['criteria', 'evidence']
                              : kind === 'return'
                                ? ['reason', 'tracking']
                                : ['decisionReason']
                        ).includes(field),
                      )
                      .map((field) => (
                        <div key={field} className='grid grid-cols-3 gap-3'>
                          <dt className='text-sm text-muted-foreground'>
                            {t(`core.fields.${field}`)}
                          </dt>
                          <dd className='col-span-2 break-words whitespace-pre-wrap'>
                            {r.data[field] &&
                            ['validUntil', 'deliveryDate'].includes(field)
                              ? new Date(
                                  `${r.data[field]}T12:00:00`,
                                ).toLocaleDateString(i18n.language)
                              : r.data[field] || '—'}
                          </dd>
                        </div>
                      ))}
                  </dl>
                </CardContent>
              </Card>
              {kind === 'rfq' && d.quotes.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>{t('core.compare')}</CardTitle>
                  </CardHeader>
                  <CardContent className='overflow-x-auto'>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('core.fields.supplierId')}</TableHead>
                          <TableHead>{t('core.fields.status')}</TableHead>
                          <TableHead className='text-right'>
                            {t('core.net')}
                          </TableHead>
                          <TableHead className='text-right'>
                            {t('core.taxAmount')}
                          </TableHead>
                          <TableHead className='text-right'>
                            {t('core.gross')}
                          </TableHead>
                          <TableHead>{t('core.fields.deliveryDate')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {d.quotes.map((b) => (
                          <TableRow key={b.id}>
                            <TableCell>
                              <Link
                                className='text-primary hover:underline'
                                to={`${location.pathname}/quote/${b.id}`}
                              >
                                {lookups.data?.data.suppliers.find(
                                  (s) => s.id === b.supplierId,
                                )?.name ?? b.name}
                              </Link>
                            </TableCell>
                            <TableCell>
                              <CoreStatus status={b.status} />
                            </TableCell>
                            <TableCell className='text-right tabular-nums'>
                              {money(coreAmounts(b.data).net, i18n.language)}
                            </TableCell>
                            <TableCell className='text-right tabular-nums'>
                              {money(coreAmounts(b.data).tax, i18n.language)}
                            </TableCell>
                            <TableCell className='text-right tabular-nums'>
                              {money(b.total, i18n.language)}
                            </TableCell>
                            <TableCell>
                              {b.data.deliveryDate
                                ? new Date(
                                    `${b.data.deliveryDate}T12:00:00`,
                                  ).toLocaleDateString(i18n.language)
                                : '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardHeader>
                  <CardTitle>{t('core.operations')}</CardTitle>
                </CardHeader>
                <CardContent className='flex flex-wrap gap-2'>
                  {d.available
                    .filter((a) => a !== 'edit')
                    .map((a, index) => (
                      <Button
                        key={a}
                        variant={
                          a === 'reject' || a === 'cancel' || a === 'disable'
                            ? 'destructive'
                            : index === 0
                              ? 'default'
                              : 'outline'
                        }
                        onClick={() => choose(a)}
                      >
                        {t(`core.actions.${a}`)}
                      </Button>
                    ))}
                  {!d.available.filter((a) => a !== 'edit').length && (
                    <p className='text-sm text-muted-foreground'>
                      {t('core.noActions')}
                    </p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>{t('core.history')}</CardTitle>
                </CardHeader>
                <CardContent>
                  {d.history.map((h) => (
                    <p className='text-sm' key={h.version}>
                      {t(`core.actions.${h.transition}`, {
                        defaultValue: t('core.created'),
                      })}{' '}
                      · {new Date(h.at).toLocaleString(i18n.language)} ·{' '}
                      {t('core.fields.version')}: {h.version}
                    </p>
                  ))}
                </CardContent>
              </Card>
            </>
          )}
        </PageContainer>
      </RouteChildPage>
      <AlertDialog
        open={!!action}
        onOpenChange={(v) => {
          if (!v && !pending) setAction('');
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('core.confirm', {
                action: t(`core.actions.${action}`),
                name: r?.name,
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('core.confirmHint', { name: r?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {action === 'nominate' && (
            <div className='flex flex-col gap-2'>
              <Label htmlFor='core-quote'>{t('core.selectedQuote')} *</Label>
              <NativeSelect
                id='core-quote'
                value={quote}
                onChange={(e) => setQuote(e.target.value)}
                disabled={pending}
              >
                <NativeSelectOption value=''>
                  {t('core.choose')}
                </NativeSelectOption>
                {d?.quotes
                  .filter((b) => b.status === 'submitted')
                  .map((b) => (
                    <NativeSelectOption key={b.id} value={b.id}>
                      {b.number} ·{' '}
                      {lookups.data?.data.suppliers.find(
                        (s) => s.id === b.supplierId,
                      )?.name ?? b.name}{' '}
                      · {money(b.total, i18n.language)}
                    </NativeSelectOption>
                  ))}
              </NativeSelect>
            </div>
          )}
          {['reject', 'nominate', 'cancel'].includes(action) && (
            <div className='flex flex-col gap-2'>
              <Label htmlFor='core-reason'>{t('core.fields.reason')} *</Label>
              <Textarea
                id='core-reason'
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={pending}
              />
            </div>
          )}
          {action === 'ship' && (
            <div className='flex flex-col gap-2'>
              <Label htmlFor='core-tracking'>
                {t('core.fields.tracking')} *
              </Label>
              <Input
                id='core-tracking'
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
                disabled={pending}
              />
            </div>
          )}
          {error && (
            <p role='alert' className='text-sm text-destructive'>
              {t(`core.errors.${error}`, { defaultValue: t('core.error') })}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending} onClick={() => setAction('')}>
              {t('core.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              variant={
                ['disable', 'cancel'].includes(action)
                  ? 'destructive'
                  : 'default'
              }
              disabled={
                pending ||
                (action === 'nominate' && !quote) ||
                (['nominate', 'cancel', 'reject'].includes(action) &&
                  !reason.trim()) ||
                (action === 'ship' && !tracking.trim())
              }
              onClick={(e) => {
                e.preventDefault();
                void execute();
              }}
            >
              {t(pending ? 'core.saving' : `core.actions.${action}`)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Outlet />
    </>
  );
}
