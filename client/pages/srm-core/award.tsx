import { useState, useRef, useEffect } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import { useApiClient, useToaster } from '@nocobase/app-client';
import { useQueryClient } from '@tanstack/react-query';
import {
  approvalStepsOf,
  approvalWord,
  renderTimelineEntry,
  type RunView,
  type UpcomingStage,
  type TaskActions,
} from '@nocobase/app-plugin-approval/client';
import {
  ApprovalUiProvider,
  ApprovalProgress,
  ApprovalTimeline,
  ApprovalActionBar,
  type ApprovalBarAction,
} from '../../extensions/nocobase-approval-ui/index.js';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '#components/ui/card';
import { Label } from '#components/ui/label';
import { Textarea } from '#components/ui/textarea';
import { Alert, AlertDescription } from '#components/ui/alert';
import { State } from '../showcase/states.js';
import { useCore, coreError } from './common.js';
export default function Award({
  id,
  name,
  refreshRecord,
}: {
  id: string;
  name: string;
  refreshRecord: () => Promise<unknown>;
}) {
  const { t, i18n } = useTranslation(),
    api = useApiClient(),
    cache = useQueryClient(),
    toast = useToaster();
  const q = useCore<{
    data: {
      runs: RunView[];
      upcoming: UpcomingStage[];
      actions: TaskActions[];
      people: { id: string; name: string }[];
    };
  }>(`award/${id}`);
  const [error, setError] = useState('');
  const names = new Map(q.data?.data.people.map((p) => [p.id, p.name])),
    personName = (id: string | null | undefined) =>
      id ? (names.get(id) ?? id) : '—';
  const text = {
    t: (key: string, options?: Record<string, unknown>) => t(key, options),
    name: personName,
    stage: (key: string, title?: string | null) =>
      t(`srmApproval.${key}`, { defaultValue: title ?? key }),
  };
  const runs = q.data?.data.runs ?? [],
    steps = approvalStepsOf(runs, q.data?.data.upcoming).map((step) => ({
      ...step,
      title: text.stage(step.stage, step.title),
      policy:
        step.tasks.length === 1
          ? t('srmApproval.single')
          : approvalWord(
              text,
              `policies.${step.policy ?? 'single'}`,
              step.policy ?? 'single',
            ),
      tasks: step.tasks.map((task) => ({
        key: task.id,
        personId: task.assigneeId,
        comment: task.comment,
        badges: [
          {
            label: approvalWord(text, `taskStatus.${task.status}`, task.status),
          },
          {
            label: task.answer
              ? approvalWord(text, `actions.${task.answer}`, task.answer)
              : '',
          },
        ].filter((b) => b.label),
      })),
    }));
  const lines = runs
    .flatMap((run) => [
      ...run.timeline.entries,
      ...run.timeline.stages.flatMap((stay) => stay.entries),
    ])
    .map((entry) => {
      const view = renderTimelineEntry(entry, text);
      return {
        ...view,
        kind: view.kind === 'system' ? ('event' as const) : ('action' as const),
        emphasis:
          view.kind === 'system' ? ('muted' as const) : ('default' as const),
      };
    });
  const actions: ApprovalBarAction[] = (q.data?.data.actions ?? []).flatMap(
    (item) =>
      item.actions.map((action) => ({
        key: `${item.task.id}:${action.name}`,
        label: t(`srmApproval.${action.name}`),
        tone: action.tone,
        primary: action.primary,
        form: {
          initialValues: { comment: '', requestId: crypto.randomUUID() },
          description: (
            <>
              <p>
                {t('srmApproval.confirm', {
                  name,
                  action: t(`srmApproval.${action.name}`),
                })}
              </p>
              <p>{t('srmApproval.consequence')}</p>
            </>
          ),
          submitLabel: t(`srmApproval.${action.name}`),
          validate: (values) =>
            typeof values.comment === 'string' && values.comment.trim()
              ? []
              : ['comment'],
          render: (props) => (
            <Opinion
              {...props}
              error={
                error
                  ? t(`srmApproval.errors.${error}`, {
                      defaultValue: t('srmApproval.errors.FAILED'),
                    })
                  : ''
              }
              onEdit={() => setError('')}
            />
          ),
        },
        run: async (values) => {
          setError('');
          try {
            const run = runs.find((r) => r.run.id === item.task.runId);
            await api.request({
              path: `srmCore/award/${id}`,
              method: 'POST',
              json: {
                taskId: item.task.id,
                action: action.name,
                comment: values.comment,
                contentHash: run?.run.contentHash,
                requestId: values.requestId,
              },
            });
            await Promise.all([
              cache.invalidateQueries({ queryKey: ['srmCore'] }),
              cache.invalidateQueries({ queryKey: ['operations'] }),
              refreshRecord(),
              q.refetch(),
            ]);
            toast.show({
              type: 'success',
              title: t('srmApproval.success', {
                name,
                action: t(`srmApproval.${action.name}`),
              }),
            });
            return true;
          } catch (e) {
            setError(coreError(e));
            return false;
          }
        },
      })),
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('srmApproval.title')}</CardTitle>
        <CardDescription>{t('srmApproval.content')}</CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-6'>
        <State
          loading={q.isPending}
          error={q.error}
          retry={() => void q.refetch()}
        />
        {q.data && (
          <ApprovalUiProvider
            personName={personName}
            formatDateTime={(at) => new Date(at).toLocaleString(i18n.language)}
          >
            <ApprovalProgress steps={steps} />
            <ApprovalTimeline lines={lines} />
            <ApprovalActionBar actions={actions} />
          </ApprovalUiProvider>
        )}
      </CardContent>
    </Card>
  );
}
function Opinion({
  values,
  setValues,
  invalid,
  busy,
  error,
  onEdit,
}: {
  values: Record<string, unknown>;
  setValues: (v: Record<string, unknown>) => void;
  invalid: readonly string[];
  busy: boolean;
  error: string;
  onEdit: () => void;
}) {
  const { t } = useTranslation(),
    ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (invalid.length) ref.current?.focus();
  }, [invalid]);
  return (
    <div className='flex flex-col gap-2'>
      {error && (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Label htmlFor='award-opinion'>{t('srmApproval.opinion')} *</Label>
      <Textarea
        ref={ref}
        id='award-opinion'
        value={typeof values.comment === 'string' ? values.comment : ''}
        maxLength={2000}
        disabled={busy}
        aria-invalid={invalid.includes('comment')}
        aria-describedby={
          invalid.includes('comment') ? 'award-opinion-error' : undefined
        }
        onChange={(e) => {
          onEdit();
          setValues({
            ...values,
            comment: e.target.value,
            requestId: crypto.randomUUID(),
          });
        }}
      />
      {invalid.includes('comment') && (
        <p id='award-opinion-error' className='text-sm text-destructive'>
          {t('srmApproval.required')}
        </p>
      )}
    </div>
  );
}
