import { Link, Outlet, useParams, useLocation } from 'react-router';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { RouteChildPage } from '#components/route-child-page';
import { BackButton } from '#components/back-button';
import { FinanceAppLink } from '#components/finance-app-link';
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from '#components/ui/empty';
import { Button } from '#components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '#components/ui/card';
import { State, Status, Refresh } from './states.js';
import { money } from '../operations/common.js';
import {
  useCopy,
  useChildFocus,
  useShowcase,
  type Ledger,
  type Overview,
} from './common.js';
export default function LedgerDetail() {
  useChildFocus();
  const { id } = useParams(),
    location = useLocation(),
    { t, i18n } = useCopy(),
    q = useShowcase<{ data: Ledger }>(`businessLedger/${id}`),
    caps = useShowcase<{ data: Overview }>('overview'),
    r = q.data?.data;
  const evidence = r?.resolution as {
    reason?: string;
    actorId?: string;
    at?: string;
    disposition?: string;
    previous?: string | null;
  } | null;
  const audit: NonNullable<typeof evidence>[] = [];
  let entry = evidence;
  while (entry && audit.length < 20) {
    audit.push(entry);
    try {
      entry = entry.previous
        ? (JSON.parse(entry.previous) as typeof evidence)
        : null;
    } catch {
      entry = null;
    }
  }
  return (
    <>
      <RouteChildPage>
        <PageContainer>
          <BackButton />
          <PageHeader
            title={r?.name ?? t('showcase.ledger')}
            actions={
              <>
                {' '}
                {caps.data?.data.actions.includes('resolve') && (
                  <Button
                    nativeButton={false}
                    render={
                      <Link
                        to={{ pathname: 'resolve', search: location.search }}
                      />
                    }
                  >
                    {t('showcase.resolve')}
                  </Button>
                )}{' '}
                {caps.data?.data.actions.includes('sync') && (
                  <Button
                    nativeButton={false}
                    variant='outline'
                    render={
                      <Link
                        to={{
                          pathname: 'acknowledgment',
                          search: location.search,
                        }}
                      />
                    }
                  >
                    {t('srm.ack')}
                  </Button>
                )}
                <FinanceAppLink />
                <Refresh
                  pending={q.isFetching || caps.isFetching}
                  onClick={() => {
                    void q.refetch();
                    void caps.refetch();
                  }}
                />
              </>
            }
          />
          <State
            loading={q.isPending}
            error={q.error}
            retry={() => void q.refetch()}
          />
          {r && (
            <Card>
              <CardHeader>
                <CardTitle>{t('srm.financeBridge')}</CardTitle>
                <CardDescription>
                  {t('srm.financeBridgeNotice')}
                </CardDescription>
              </CardHeader>
              <CardContent className='flex flex-col gap-3'>
                {!r.financeBridgeEnabled ? (
                  <Empty>
                    <EmptyHeader>
                      <EmptyTitle>{t('srm.financeUnconfigured')}</EmptyTitle>
                      <EmptyDescription>
                        {t('srm.financeConfigureHint')}
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : !r.finance?.length ? (
                  <Empty>
                    <EmptyHeader>
                      <EmptyTitle>{t('srm.financeWaiting')}</EmptyTitle>
                      <EmptyDescription>
                        {t('srm.financeWaitingHint')}
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  r.finance.map((item) => (
                    <div
                      key={item.id}
                      className='flex flex-col gap-3 rounded-lg border p-4'
                    >
                      <span className='text-sm text-muted-foreground'>
                        {item.receiptNo} · {t('srm.financeLine')}:{' '}
                        {item.receiptLineId} · {t('srm.financeSyncTime')}:{' '}
                        {new Date(item.updatedAt).toLocaleString(i18n.language)}
                      </span>
                      <span>
                        {t(
                          item.state === 'excluded'
                            ? 'srm.financeExcluded'
                            : item.state === 'failed'
                              ? item.error === 'SOURCE_UNSUPPORTED'
                                ? 'srm.financeUnsupported'
                                : 'srm.financeFailed'
                              : item.result?.status === 'posted'
                                ? 'srm.financePosted'
                                : item.state === 'synced'
                                  ? 'srm.financeSynced'
                                  : 'srm.financeWaiting',
                        )}
                      </span>
                      {item.original && (
                        <span>
                          {t('srm.financeOriginal')}: {t('srm.financeNet')}:{' '}
                          {money(item.original.netAmount, i18n.language)} ·{' '}
                          {t('srm.financeTax')}:{' '}
                          {money(item.original.taxAmount, i18n.language)} ·{' '}
                          {t('srm.financeGross')}:{' '}
                          {money(item.original.grossAmount, i18n.language)}
                        </span>
                      )}
                      {item.result && item.result.status !== 'draft' ? (
                        <span>
                          {t('srm.financeSettlement')}: {t('srm.financeNet')}:{' '}
                          {money(item.result.netAmount, i18n.language)} ·{' '}
                          {t('srm.financeTax')}:{' '}
                          {money(item.result.taxAmount, i18n.language)} ·{' '}
                          {t('srm.financeGross')}:{' '}
                          {money(item.result.grossAmount, i18n.language)} ·{' '}
                          {t('srm.financeStatus')}:{' '}
                          {t(`srm.financeState_${item.result.status}`)}
                        </span>
                      ) : item.state === 'excluded' ? null : (
                        <span>{t('srm.financeUnreconciled')}</span>
                      )}
                      {item.stale && <span>{t('srm.financeStale')}</span>}
                      {item.url && (
                        <Button
                          variant='outline'
                          nativeButton={false}
                          render={
                            <a
                              href={item.url}
                              target='_blank'
                              rel='noopener noreferrer'
                            />
                          }
                        >
                          {t('srm.financeBill')}
                        </Button>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          )}
          {r && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>
                    <Status value={r.disposition} />
                  </CardTitle>
                  <CardDescription>
                    {t('showcase.ledgerDescription')}{' '}
                    {t('showcase.financeBoundary')}
                  </CardDescription>
                </CardHeader>
                <CardContent className='grid gap-4 sm:grid-cols-2'>
                  {(
                    [
                      'localAmount',
                      'externalAmount',
                      'difference',
                      'localQuantity',
                      'externalQuantity',
                      'quantityDifference',
                    ] as const
                  ).map((key) => (
                    <div key={key}>
                      <p className='text-sm text-muted-foreground'>
                        {t(
                          key.includes('Quantity') ||
                            key === 'quantityDifference'
                            ? `srm.${key}`
                            : `showcase.${key}`,
                        )}
                      </p>
                      <p className='mt-1 text-base tabular-nums'>
                        {r[key] === null
                          ? '—'
                          : key.includes('Quantity') ||
                              key === 'quantityDifference'
                            ? Number(r[key]).toLocaleString(i18n.language)
                            : money(r[key], i18n.language)}
                      </p>
                    </div>
                  ))}
                  <div>
                    <p className='text-sm text-muted-foreground'>
                      {t('showcase.fields.version')}
                    </p>
                    <p className='break-all text-sm'>{r.version}</p>
                  </div>
                </CardContent>
              </Card>
              {!r.provenance && (
                <p>{t(r.legacyEvidence ? 'srm.legacy' : 'srm.noEvidence')}</p>
              )}
              {r.provenance && (
                <p>
                  {t(`srm.${r.provenance}`)} · {r.externalReference} ·{' '}
                  {r.recordedAt
                    ? new Date(r.recordedAt).toLocaleString(i18n.language)
                    : '—'}
                </p>
              )}
              <Card>
                <CardHeader>
                  <CardTitle>{t('showcase.evidence')}</CardTitle>
                  <CardDescription>
                    {t('showcase.resolutionNotice')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {evidence ? (
                    <dl className='grid gap-4 sm:grid-cols-2'>
                      <div className='sm:col-span-2'>
                        <dt className='text-sm text-muted-foreground'>
                          {t('showcase.reason')}
                        </dt>
                        <dd className='mt-1 whitespace-pre-wrap break-words'>
                          {evidence.reason}
                        </dd>
                      </div>
                      <div>
                        <dt className='text-sm text-muted-foreground'>
                          {t('showcase.actor')}
                        </dt>
                        <dd className='mt-1 break-all'>{evidence.actorId}</dd>
                      </div>
                      <div>
                        <dt className='text-sm text-muted-foreground'>
                          {t('showcase.updatedAt')}
                        </dt>
                        <dd className='mt-1'>
                          {evidence.at
                            ? new Date(evidence.at).toLocaleString(
                                i18n.language,
                              )
                            : '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className='text-sm text-muted-foreground'>
                          {t('ops.fields.status')}
                        </dt>
                        <dd className='mt-1'>
                          <Status value={evidence.disposition ?? 'resolved'} />
                        </dd>
                      </div>
                    </dl>
                  ) : (
                    <p className='text-muted-foreground'>{t('ops.empty')}</p>
                  )}
                  {audit.length > 1 && (
                    <section className='mt-6'>
                      <h3 className='text-base font-medium'>
                        {t('showcase.history')}
                      </h3>
                      <ul className='mt-3 flex flex-col gap-3'>
                        {audit.slice(1).map((item) => (
                          <li
                            key={`${item.at}:${item.actorId}`}
                            className='rounded-lg border p-3'
                          >
                            <p className='whitespace-pre-wrap break-words'>
                              {item.reason}
                            </p>
                            <p className='mt-2 text-sm text-muted-foreground'>
                              {item.at
                                ? new Date(item.at).toLocaleString(
                                    i18n.language,
                                  )
                                : '—'}{' '}
                              · {item.actorId}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </PageContainer>
      </RouteChildPage>
      <Outlet />
    </>
  );
}
