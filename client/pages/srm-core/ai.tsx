import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useState, useEffect, useRef } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useTranslation } from '@nocobase/i18n/client';
import { useApiClient, useToaster } from '@nocobase/app-client';
import { useQueryClient } from '@tanstack/react-query';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { RouteChildPage } from '#components/route-child-page';
import { BackButton } from '#components/back-button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from '#components/ui/card';
import { Button } from '#components/ui/button';
import { Spinner } from '#components/ui/spinner';
import { Label } from '#components/ui/label';
import { Textarea } from '#components/ui/textarea';
import { Alert, AlertDescription } from '#components/ui/alert';
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
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '#components/ui/table';
import { State, Refresh } from '../showcase/states.js';
import { useChildFocus } from '../showcase/common.js';
import {
  useCore,
  useCoreKind,
  coreError,
  type DetailData,
  type CoreLookups,
  money,
} from './common.js';
import {
  aiPurposes,
  type AiProposal,
  type AiAnalyze,
} from '../../../shared/srm-ai.js';
export default function BusinessAi() {
  useChildFocus();
  const kind = useCoreKind(),
    { id } = useParams(),
    [search, setSearch] = useSearchParams(),
    { t, i18n } = useTranslation(),
    api = useApiClient(),
    cache = useQueryClient(),
    toast = useToaster();
  const modelAccess = useCan({
    resource: { type: 'page', id: 'showcase.models' },
    action: 'access',
  }).can;
  const q = useCore<{ data: DetailData }>(`${kind}/${id}`),
    record = q.data?.data.record,
    purpose: AiAnalyze['purpose'] = aiPurposes.includes(
      search.get('purpose') as AiAnalyze['purpose'],
    )
      ? (search.get('purpose') as AiAnalyze['purpose'])
      : kind === 'inspection'
        ? 'qualityReturn'
        : record?.status === 'draft'
          ? 'requestDraft'
          : 'quoteDecision';
  const status = useCore<{
      data: {
        configured: boolean;
        model: { model: string; modelService: string } | null;
      };
    }>('ai/status'),
    lookups = useCore<{ data: CoreLookups }>(`lookups/${kind}`);
  const caps = useCore<{ data: { permissions: Record<string, string[]> } }>(
    'capabilities',
  );
  const stored = useCore<{ data: AiProposal }>(
    `ai/${purpose}/proposals/${search.get('proposal') ?? ''}`,
    {},
    !!search.get('proposal'),
  );
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [local, setLocal] = useState<AiProposal | null>(null),
    [text, setText] = useState(''),
    [key, setKey] = useState(() => crypto.randomUUID()),
    [pending, setPending] = useState(false),
    [error, setError] = useState(''),
    [confirm, setConfirm] = useState(false);
  const p = local ?? stored.data?.data,
    eligible =
      !!record &&
      (purpose === 'quoteDecision'
        ? q.data?.data.available.includes('nominate')
        : purpose === 'requestDraft'
          ? q.data?.data.available.includes('edit')
          : record.status === 'approved' &&
            q.data?.data.source?.status === 'posted' &&
            !!caps.data?.data.permissions.return?.includes('create'));
  const stale =
    !!p &&
    !!record &&
    (p.recordId !== record.id ||
      (p.status === 'pending' &&
        (p.version !== record.lifecycleVersion ||
          p.expiresAt < new Date(clock).toISOString())));
  const refresh = () =>
    Promise.all([
      q.refetch(),
      status.refetch(),
      lookups.refetch(),
      ...(search.get('proposal') ? [stored.refetch()] : []),
    ]);
  async function analyze(requestKey = key) {
    if (!record || pending) return;
    if (purpose === 'requestDraft' && !text.trim()) {
      setError('TEXT_REQUIRED');
      textRef.current?.focus();
      return;
    }
    setPending(true);
    setError('');
    try {
      const r = await api.request<{ data: AiProposal }>({
        path: 'srmCore/ai/analyze',
        method: 'POST',
        json: {
          purpose,
          kind,
          id,
          version: record.lifecycleVersion,
          text,
          requestKey,
        },
      });
      setLocal(r.data);
      const next = new URLSearchParams(search);
      next.set('proposal', r.data.id);
      next.set('purpose', r.data.purpose);
      setSearch(next, { replace: true });
    } catch (e) {
      setError(coreError(e));
    } finally {
      setPending(false);
    }
  }
  async function apply() {
    if (!p || pending) return;
    setPending(true);
    setError('');
    try {
      const r = await api.request<{ data: AiProposal }>({
        path: `srmCore/ai/${p.purpose}/proposals/${p.id}/confirm`,
        method: 'POST',
        json: {},
      });
      setLocal(r.data);
      setConfirm(false);
      await Promise.all(
        ['srmCore', 'operations', 'showcase'].map((prefix) =>
          cache.invalidateQueries({ queryKey: [prefix] }),
        ),
      );
      toast.show({
        type: 'success',
        title: t('srmAi.applied', { name: p.recordName }),
      });
      await q.refetch();
    } catch (e) {
      setConfirm(false);
      setError(coreError(e));
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <RouteChildPage>
        <PageContainer>
          <BackButton
            to={{
              pathname: '..',
              search: (() => {
                const parent = new URLSearchParams(search);
                parent.delete('purpose');
                parent.delete('proposal');
                return parent.toString();
              })(),
            }}
          />
          <PageHeader
            title={t(`srmAi.purposes.${purpose}`)}
            description={record?.name ?? t('srmAi.hint')}
            actions={
              <Refresh
                pending={q.isFetching || pending}
                onClick={() => void refresh()}
              />
            }
          />
          <State
            loading={
              q.isPending ||
              status.isPending ||
              lookups.isPending ||
              caps.isPending ||
              (!!search.get('proposal') && stored.isPending)
            }
            error={
              q.error ??
              status.error ??
              stored.error ??
              lookups.error ??
              caps.error
            }
            retry={() => void refresh()}
          />
          {record && status.data && (
            <>
              {error && (
                <Alert variant='destructive'>
                  <AlertDescription>
                    {t(`srmAi.errors.${error}`, {
                      defaultValue: t(`core.errors.${error}`, {
                        defaultValue: t('srmAi.failed'),
                      }),
                    })}
                  </AlertDescription>
                </Alert>
              )}
              <Card>
                <CardHeader>
                  <CardTitle>{t('srmAi.model')}</CardTitle>
                  <CardDescription>
                    {t(
                      status.data.data.configured
                        ? 'srmAi.configured'
                        : 'srmAi.unconfigured',
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className='flex flex-wrap justify-between gap-3'>
                  <span>{status.data.data.model?.model ?? '—'}</span>
                  {!status.data.data.configured && modelAccess && (
                    <Button
                      variant='link'
                      nativeButton={false}
                      render={<Link to='/model-services' />}
                    >
                      {t('srmAi.configure')}
                    </Button>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>{t('srmAi.evidence')}</CardTitle>
                  <CardDescription>
                    {t('srmAi.evidenceHint', {
                      number: record.number,
                      version: record.lifecycleVersion,
                    })}
                  </CardDescription>
                </CardHeader>
                <CardContent className='flex flex-col gap-4'>
                  <dl className='grid grid-cols-3 gap-3'>
                    <dt>{t('core.fields.status')}</dt>
                    <dd className='col-span-2'>
                      {t(`core.status.${record.status}`)}
                    </dd>
                    <dt>{t('core.fields.quantity')}</dt>
                    <dd className='col-span-2 tabular-nums'>
                      {new Intl.NumberFormat(i18n.language).format(
                        (record.data.lines ?? []).reduce(
                          (n, l) => n + l.quantity,
                          0,
                        ),
                      )}
                    </dd>
                  </dl>
                  {purpose !== 'quoteDecision' && (
                    <div className='overflow-x-auto'>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t('core.fields.materialId')}</TableHead>
                            <TableHead>{t('srmAi.currentQuantity')}</TableHead>
                            {purpose === 'qualityReturn' && (
                              <>
                                <TableHead>
                                  {t('core.fields.accepted')}
                                </TableHead>
                                <TableHead>
                                  {t('core.fields.rejected')}
                                </TableHead>
                                <TableHead>{t('srmAi.reserved')}</TableHead>
                                <TableHead>{t('srmAi.available')}</TableHead>
                              </>
                            )}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(record.data.lines ?? []).map((line) => (
                            <TableRow key={line.id}>
                              <TableCell>
                                {lookups.data?.data.materials.find(
                                  (m) => m.id === line.materialId,
                                )?.name ?? '—'}
                              </TableCell>
                              <TableCell className='text-right tabular-nums'>
                                {new Intl.NumberFormat(i18n.language).format(
                                  line.quantity,
                                )}
                              </TableCell>
                              {purpose === 'qualityReturn' && (
                                <>
                                  <TableCell className='text-right tabular-nums'>
                                    {new Intl.NumberFormat(
                                      i18n.language,
                                    ).format(line.accepted ?? 0)}
                                  </TableCell>
                                  <TableCell className='text-right tabular-nums'>
                                    {new Intl.NumberFormat(
                                      i18n.language,
                                    ).format(line.rejected ?? 0)}
                                  </TableCell>
                                  <TableCell className='text-right tabular-nums'>
                                    {new Intl.NumberFormat(
                                      i18n.language,
                                    ).format(
                                      q.data?.data.returnBalances?.[line.id]
                                        ?.reserved ?? 0,
                                    )}
                                  </TableCell>
                                  <TableCell className='text-right tabular-nums'>
                                    {q.data?.data.returnBalances?.[line.id]
                                      ? new Intl.NumberFormat(
                                          i18n.language,
                                        ).format(
                                          q.data.data.returnBalances[line.id]
                                            .available,
                                        )
                                      : '—'}
                                  </TableCell>
                                </>
                              )}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                  {purpose === 'quoteDecision' && (
                    <div className='overflow-x-auto'>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t('core.fields.supplierId')}</TableHead>
                            <TableHead className='text-right'>
                              {t('core.gross')}
                            </TableHead>
                            <TableHead>
                              {t('core.fields.deliveryDate')}
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {q.data?.data.quotes.map((quote) => (
                            <TableRow key={quote.id}>
                              <TableCell>
                                {lookups.data?.data.suppliers.find(
                                  (s) => s.id === quote.supplierId,
                                )?.name ?? quote.number}
                              </TableCell>
                              <TableCell className='text-right tabular-nums'>
                                {money(quote.total, i18n.language)}
                              </TableCell>
                              <TableCell>
                                {quote.data.deliveryDate
                                  ? new Date(
                                      `${quote.data.deliveryDate}T12:00:00`,
                                    ).toLocaleDateString(i18n.language)
                                  : '—'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                  <Label htmlFor='ai-source-text'>
                    {t('srmAi.text')}
                    {purpose === 'requestDraft' ? ' *' : ''}
                  </Label>
                  <Textarea
                    id='ai-source-text'
                    ref={textRef}
                    value={text}
                    maxLength={8000}
                    disabled={pending}
                    aria-invalid={error === 'TEXT_REQUIRED'}
                    aria-describedby={
                      error === 'TEXT_REQUIRED' ? 'ai-text-error' : undefined
                    }
                    onChange={(e) => {
                      setText(e.target.value);
                      if (error === 'TEXT_REQUIRED') setError('');
                      setKey(crypto.randomUUID());
                      setLocal(null);
                      const next = new URLSearchParams(search);
                      next.delete('proposal');
                      setSearch(next, { replace: true });
                    }}
                    placeholder={t('srmAi.textHint')}
                  />
                  {error === 'TEXT_REQUIRED' && (
                    <p id='ai-text-error' className='text-sm text-destructive'>
                      {t('srmAi.errors.TEXT_REQUIRED')}
                    </p>
                  )}
                  {!eligible && (
                    <p className='text-sm text-muted-foreground'>
                      {t('srmAi.noEligible')}
                    </p>
                  )}
                  <Button
                    variant={
                      p?.canApply && !stale && p.status === 'pending'
                        ? 'outline'
                        : 'default'
                    }
                    disabled={
                      pending || !eligible || !status.data.data.configured
                    }
                    onClick={() => {
                      const next = p ? crypto.randomUUID() : key;
                      setKey(next);
                      void analyze(next);
                    }}
                  >
                    {pending && <Spinner />}
                    {t(pending ? 'srmAi.working' : 'srmAi.analyze')}
                  </Button>
                </CardContent>
              </Card>
              {p && (
                <Card>
                  <CardHeader>
                    <CardTitle>{t('srmAi.proposal')}</CardTitle>
                    <CardDescription>
                      {t('srmAi.inferred', {
                        model: p.model.model,
                        at: new Date(p.createdAt).toLocaleString(i18n.language),
                      })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className='flex flex-col gap-4'>
                    <p className='whitespace-pre-wrap'>
                      {p.suggestion.summary}
                    </p>
                    {p.suggestion.findings.map((f) => (
                      <div
                        key={`${f.evidence}:${f.observation}`}
                        className='rounded-lg border p-3'
                      >
                        <p>{f.observation}</p>
                        <blockquote className='mt-2 whitespace-pre-wrap text-sm text-muted-foreground'>
                          {f.evidence}
                        </blockquote>
                      </div>
                    ))}
                    <p className='whitespace-pre-wrap'>{p.suggestion.reason}</p>
                    {p.suggestion.selectedQuoteId && (
                      <p>
                        {t('core.selectedQuote')}:{' '}
                        {q.data?.data.quotes.find(
                          (c) => c.id === p.suggestion.selectedQuoteId,
                        )?.number ?? '—'}
                      </p>
                    )}
                    {p.suggestion.lines.length > 0 && (
                      <div className='overflow-x-auto'>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>
                                {t('core.fields.materialId')}
                              </TableHead>
                              <TableHead className='text-right'>
                                {t('core.fields.quantity')}
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {p.suggestion.lines.map((l) => (
                              <TableRow key={l.id}>
                                <TableCell>
                                  {lookups.data?.data.materials.find(
                                    (m) => m.id === l.materialId,
                                  )?.name ?? '—'}
                                </TableCell>
                                <TableCell className='text-right tabular-nums'>
                                  {new Intl.NumberFormat(i18n.language).format(
                                    l.quantity,
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                    {p.suggestion.uncertainties.length > 0 && (
                      <Alert>
                        <AlertDescription>
                          {p.suggestion.uncertainties.join('\n')}
                        </AlertDescription>
                      </Alert>
                    )}
                    {stale && (
                      <Alert variant='destructive'>
                        <AlertDescription>{t('srmAi.stale')}</AlertDescription>
                      </Alert>
                    )}
                    {p.status === 'applied' ? (
                      <>
                        <p>{t('srmAi.applied', { name: p.recordName })}</p>
                        {p.result && (
                          <Button
                            variant='outline'
                            nativeButton={false}
                            render={<Link to={p.result.path} />}
                          >
                            {t('srmAi.openResult')}
                          </Button>
                        )}
                      </>
                    ) : p.canApply ? (
                      <Button
                        variant={stale || !eligible ? 'outline' : 'default'}
                        disabled={
                          pending ||
                          !eligible ||
                          stale ||
                          ['CONFLICT', 'AI_EXPIRED'].includes(error)
                        }
                        onClick={() => setConfirm(true)}
                      >
                        {t(`srmAi.apply.${p.purpose}`)}
                      </Button>
                    ) : (
                      <p>{t('srmAi.noAction')}</p>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </PageContainer>
      </RouteChildPage>
      <AlertDialog
        open={confirm}
        onOpenChange={(v) => {
          if (!pending) setConfirm(v);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('srmAi.confirm', { name: record?.name })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('srmAi.confirmHint')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={pending}
              onClick={() => setConfirm(false)}
            >
              {t('core.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={
                pending || stale || ['CONFLICT', 'AI_EXPIRED'].includes(error)
              }
              onClick={(e) => {
                e.preventDefault();
                void apply();
              }}
            >
              {pending && <Spinner />}
              {t(pending ? 'srmAi.working' : `srmAi.apply.${purpose}`)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
