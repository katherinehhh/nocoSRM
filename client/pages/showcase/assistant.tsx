import { Spinner } from '#components/ui/spinner';
import { useState } from 'react';
import { Link, Outlet } from 'react-router';
import { resolveAppUrl } from '@nocobase/app-client';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '#components/ui/card';
import { Field, FieldLabel } from '#components/ui/field';
import { Input } from '#components/ui/input';
import { Textarea } from '#components/ui/textarea';
import { Button } from '#components/ui/button';
import { NativeSelect, NativeSelectOption } from '#components/ui/native-select';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '#components/ui/alert-dialog';
import { State, Refresh } from './states.js';
import { useCopy, useShowcase, useWrite, type Overview } from './common.js';
import type { Delivery } from '../../../shared/showcase.js';
interface Analysis {
  mode: 'rules' | 'model';
  text?: string;
  fields?: {
    sku: string | null;
    quantity: number | null;
    fnsku: string | null;
  };
  evidence?: string[];
  missing?: string[];
}
interface Proposal {
  id: string;
  current: { status: string; disposition: string };
  proposed: { disposition: string };
  operation: string;
  recordId: string;
  name: string;
  version: string | number;
  expiresAt: number;
  reason: string;
}
export default function Assistant() {
  const { t, i18n } = useCopy(),
    overview = useShowcase<{ data: Overview }>('overview'),
    records = useShowcase<{ data: Delivery[] }>('deliveryPlans', {
      pageSize: 100,
    }),
    extract = useWrite(),
    analyze = useWrite(),
    prepare = useWrite(),
    commit = useWrite(),
    [text, setText] = useState(''),
    [mode, setMode] = useState('rules'),
    [employee, setEmployee] = useState('showcase.delivery'),
    [target, setTarget] = useState(''),
    [utterance, setUtterance] = useState(''),
    [result, setResult] = useState<Analysis | null>(null),
    [proposal, setProposal] = useState<Proposal | null>(null),
    [confirm, setConfirm] = useState(false),
    [printId, setPrintId] = useState(''),
    [fileError, setFileError] = useState('');
  return (
    <>
      <PageContainer>
        <PageHeader
          title={t('showcase.ai')}
          description={t('showcase.aiDescription')}
          actions={
            <Refresh
              pending={overview.isFetching || records.isFetching}
              onClick={() => {
                void overview.refetch();
                void records.refetch();
              }}
            />
          }
        />
        <State
          loading={overview.isPending}
          error={overview.error}
          retry={() => void overview.refetch()}
        />
        <Card>
          <CardHeader>
            <CardTitle>{t('showcase.employeesTitle')}</CardTitle>
            <CardDescription>{t('showcase.employeeNotice')}</CardDescription>
          </CardHeader>
          <CardContent className='grid gap-4 sm:grid-cols-2'>
            <Field>
              <FieldLabel htmlFor='ai-employee'>
                {t('showcase.employee')}
              </FieldLabel>
              <NativeSelect
                id='ai-employee'
                value={employee}
                onChange={(e) => setEmployee(e.target.value)}
              >
                {['delivery', 'approval', 'ledger'].map((key) => (
                  <NativeSelectOption key={key} value={`showcase.${key}`}>
                    {t(`showcase.employees.${key}`)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <p className='text-sm text-muted-foreground'>
                {t(`showcase.employeeDescriptions.${employee.split('.')[1]}`)}
              </p>
            </Field>
            <Field>
              <FieldLabel htmlFor='ai-mode'>{t('showcase.mode')}</FieldLabel>
              <NativeSelect
                id='ai-mode'
                value={mode}
                onChange={(e) => setMode(e.target.value)}
              >
                <NativeSelectOption value='rules'>
                  {t('showcase.rulesMode')}
                </NativeSelectOption>
                <NativeSelectOption
                  value='model'
                  disabled={!overview.data?.data.modelReady}
                >
                  {t('showcase.modelMode')}
                </NativeSelectOption>
              </NativeSelect>
              <p className='text-sm text-muted-foreground'>
                {t(
                  overview.data?.data.modelReady
                    ? 'showcase.modelReady'
                    : 'showcase.modelUnconfigured',
                )}
              </p>
              {overview.data?.data.actions.includes('configure') && (
                <Link
                  className='text-sm text-primary underline'
                  to='/model-services'
                >
                  {t('showcase.models')}
                </Link>
              )}
            </Field>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              {analyze.isPending && <Spinner />}
              {t('showcase.analyze')}
            </CardTitle>
            <CardDescription>
              {t('showcase.analyzeDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className='flex flex-col gap-4'
              onSubmit={(e) => {
                e.preventDefault();
                analyze.mutate(
                  {
                    path: 'showcase/assistant/analyze',
                    json: {
                      text,
                      mode,
                      employee,
                      ...(target ? { recordId: target } : {}),
                    },
                  },
                  { onSuccess: (r) => setResult(r.data as Analysis) },
                );
              }}
            >
              <Field>
                <FieldLabel htmlFor='ai-file'>
                  {t('showcase.uploadText')}
                </FieldLabel>
                <Input
                  id='ai-file'
                  type='file'
                  accept='.pdf,.txt,.csv,.json,.md'
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (
                      file.size >
                      (/\.pdf$/i.test(file.name) ? 2 * 1024 * 1024 : 65536)
                    ) {
                      setFileError(t('showcase.fileTooLarge'));
                      return;
                    }
                    setFileError('');
                    if (/\.pdf$/i.test(file.name)) {
                      void file
                        .arrayBuffer()
                        .then((buffer) => {
                          let binary = '';
                          for (const b of new Uint8Array(buffer))
                            binary += String.fromCharCode(b);
                          extract.mutate(
                            {
                              path: 'showcase/assistant/extractPdf',
                              json: { content: btoa(binary) },
                            },
                            {
                              onSuccess: (r) => {
                                const data = r.data as {
                                  text: string;
                                  truncated: boolean;
                                };
                                setText(data.text);
                                if (data.truncated)
                                  setFileError(t('showcase.documentTruncated'));
                              },
                            },
                          );
                        })
                        .catch(() => setFileError(t('showcase.error')));
                      return;
                    }
                    void file
                      .text()
                      .then((content) => {
                        if (content.length > 20000)
                          setFileError(t('showcase.fileTooLarge'));
                        else setText(content);
                      })
                      .catch(() => setFileError(t('showcase.error')));
                  }}
                />
                {extract.isPending && <p role='status'>{t('ops.loading')}</p>}
                {fileError && <p role='alert'>{fileError}</p>}
              </Field>
              <Field>
                <FieldLabel htmlFor='ai-source'>
                  {t('showcase.sourceText')} *
                </FieldLabel>
                <Textarea
                  id='ai-source'
                  className='min-h-40'
                  maxLength={20000}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  required
                  placeholder={t('showcase.sampleText')}
                />
              </Field>
              <Button
                className='self-end'
                disabled={
                  analyze.isPending || extract.isPending || !text.trim()
                }
                type='submit'
              >
                {analyze.isPending && <Spinner />}
                {t('showcase.analyze')}
              </Button>
            </form>
            {result !== null && (
              <section className='mt-6 rounded-lg border p-4'>
                <h3 className='font-medium'>{t('showcase.result')}</h3>
                <p className='mt-2 text-sm text-muted-foreground'>
                  {t(
                    result.mode === 'model'
                      ? 'showcase.modelMode'
                      : 'showcase.rulesMode',
                  )}
                </p>
                {result.text && (
                  <p className='mt-3 whitespace-pre-wrap break-words'>
                    {result.text}
                  </p>
                )}
                {result.fields && (
                  <dl className='mt-3 grid gap-3 sm:grid-cols-3'>
                    {Object.entries(result.fields).map(([key, value]) => (
                      <div key={key}>
                        <dt className='text-sm text-muted-foreground'>
                          {t(`showcase.analysisFields.${key}`)}
                        </dt>
                        <dd className='mt-1 break-words'>{value ?? '—'}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {!!result.evidence?.length && (
                  <section className='mt-4'>
                    <h4 className='font-medium'>{t('showcase.evidence')}</h4>
                    <ul className='mt-2 list-inside list-disc text-sm'>
                      {[...new Set(result.evidence)].map((value) => (
                        <li className='break-words' key={value}>
                          {value}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {!!result.missing?.length && (
                  <p className='mt-4 text-sm'>
                    {t('showcase.missingFields')}:{' '}
                    {result.missing
                      .map((key) => t(`showcase.analysisFields.${key}`))
                      .join(', ')}
                  </p>
                )}
              </section>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('showcase.naturalLanguage')}</CardTitle>
            <CardDescription>{t('showcase.proposalNotice')}</CardDescription>
          </CardHeader>
          <CardContent className='flex flex-col gap-4'>
            <State error={records.error} retry={() => void records.refetch()} />
            <Field>
              <FieldLabel htmlFor='ai-target'>
                {t('showcase.target')} *
              </FieldLabel>
              <NativeSelect
                id='ai-target'
                value={target}
                onChange={(e) => {
                  setTarget(e.target.value);
                  setProposal(null);
                }}
              >
                <NativeSelectOption value=''>
                  {t('showcase.chooseTarget')}
                </NativeSelectOption>
                {records.data?.data.map((r) => (
                  <NativeSelectOption key={r.id} value={r.id}>
                    {r.number} · {r.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor='ai-utterance'>
                {t('showcase.instruction')} *
              </FieldLabel>
              <Input
                id='ai-utterance'
                value={utterance}
                onChange={(e) => {
                  setUtterance(e.target.value);
                  setProposal(null);
                }}
                placeholder={t('showcase.utteranceExample')}
              />
            </Field>
            <Button
              variant='outline'
              className='self-end'
              disabled={prepare.isPending || !target || !utterance.trim()}
              onClick={() =>
                prepare.mutate(
                  {
                    path: 'showcase/assistant/prepare',
                    json: { id: target, utterance },
                  },
                  { onSuccess: (r) => setProposal(r.data as Proposal) },
                )
              }
            >
              {prepare.isPending && <Spinner />}
              {t('showcase.preview')}
            </Button>
            {proposal && (
              <div className='flex flex-col gap-3 rounded-lg border p-4'>
                <h3 className='font-semibold'>
                  {prepare.isPending && <Spinner />}
                  {t('showcase.preview')}
                </h3>
                <p>{proposal.name}</p>
                <p>
                  {t('showcase.proposedAction', {
                    action: t(
                      proposal.operation === 'print'
                        ? 'showcase.print'
                        : proposal.operation === 'markReview'
                          ? 'showcase.markReview'
                          : 'showcase.resolve',
                    ),
                  })}
                </p>
                <p className='text-sm text-muted-foreground'>
                  {t('showcase.proposalVersion', {
                    version: proposal.version,
                    expiry: new Date(proposal.expiresAt).toLocaleTimeString(
                      i18n.language,
                    ),
                  })}
                </p>
                <dl className='grid gap-3 sm:grid-cols-2'>
                  <div>
                    <dt className='text-sm text-muted-foreground'>
                      {t('showcase.currentValue')}
                    </dt>
                    <dd>
                      {t(`showcase.states.${proposal.current.disposition}`)}
                    </dd>
                  </div>
                  <div>
                    <dt className='text-sm text-muted-foreground'>
                      {t('showcase.proposedValue')}
                    </dt>
                    <dd>
                      {t(`showcase.states.${proposal.proposed.disposition}`)}
                    </dd>
                  </div>
                </dl>
                <p className='text-sm text-muted-foreground'>
                  {t(
                    proposal.operation === 'print'
                      ? 'showcase.printOnly'
                      : 'showcase.sourceUnchanged',
                  )}
                </p>
                <p>{proposal.reason}</p>
                <Button
                  variant='outline'
                  className='self-end'
                  onClick={() => setConfirm(true)}
                  disabled={commit.isPending}
                >
                  {commit.isPending && <Spinner />}
                  {t('showcase.apply')}
                </Button>
              </div>
            )}
            {printId && (
              <Button
                nativeButton={false}
                variant='outline'
                render={
                  <a
                    href={resolveAppUrl(
                      `/api/showcase/deliveryPlans/${printId}/pdf`,
                    )}
                    target='_blank'
                    rel='noreferrer'
                  />
                }
              >
                {t('showcase.print')}
              </Button>
            )}
          </CardContent>
        </Card>
      </PageContainer>
      <AlertDialog
        open={confirm}
        onOpenChange={(value) => {
          if (!commit.isPending) setConfirm(value);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('showcase.confirmAction', {
                name: proposal?.name ?? '',
                action: t(
                  proposal?.operation === 'print'
                    ? 'showcase.print'
                    : proposal?.operation === 'markReview'
                      ? 'showcase.markReview'
                      : 'showcase.resolve',
                ),
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('showcase.confirmConsequence')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={commit.isPending}>
              {t('ops.cancel')}
            </AlertDialogCancel>
            <Button
              disabled={commit.isPending || !proposal}
              onClick={() =>
                proposal &&
                commit.mutate(
                  {
                    path: 'showcase/assistant/commit',
                    json: {
                      proposalId: proposal.id,
                      requestId: crypto.randomUUID(),
                    },
                  },
                  {
                    onSuccess: (r) => {
                      const value = r.data as {
                        operation: string;
                        recordId: string;
                      };
                      if (value.operation === 'print')
                        setPrintId(value.recordId);
                      setConfirm(false);
                      setProposal(null);
                    },
                  },
                )
              }
            >
              {commit.isPending && <Spinner />}
              {t('showcase.apply')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Outlet />
    </>
  );
}
