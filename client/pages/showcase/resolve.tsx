import { useState, useRef } from 'react';
import { useParams } from 'react-router';
import { RouteDialog } from '#components/route-dialog';
import { useRouteOverlay } from '#components/use-route-overlay';
import { Textarea } from '#components/ui/textarea';
import { Field, FieldLabel, FieldError } from '#components/ui/field';
import { State, FormActions } from './states.js';
import { useCopy, useShowcase, useWrite, type Ledger } from './common.js';
export default function Resolve() {
  const { t } = useCopy(),
    write = useWrite();
  return (
    <RouteDialog
      className='sm:max-w-md'
      title={t('showcase.resolve')}
      description={t('showcase.resolutionNotice')}
      footer={
        <FormActions
          formId='showcase-resolve'
          pending={write.isPending}
          label={t('showcase.resolve')}
        />
      }
      beforeClose={() => !write.isPending}
    >
      <ResolveBody write={write} />
    </RouteDialog>
  );
}
function ResolveBody({ write }: { write: ReturnType<typeof useWrite> }) {
  const { id } = useParams(),
    { t } = useCopy(),
    overlay = useRouteOverlay(),
    q = useShowcase<{ data: Ledger }>(`businessLedger/${id}`),
    inputRef = useRef<HTMLTextAreaElement>(null),
    [reason, setReason] = useState(''),
    [invalid, setInvalid] = useState(false);
  return (
    <form
      id='showcase-resolve'
      className='flex flex-col gap-4'
      onSubmit={(e) => {
        e.preventDefault();
        if (!reason.trim()) {
          setInvalid(true);
          inputRef.current?.focus();
          return;
        }
        if (q.data)
          write.mutate(
            {
              path: `showcase/businessLedger/${id}/resolve`,
              json: {
                reason,
                expectedVersion: q.data.data.version,
                requestId: crypto.randomUUID(),
              },
            },
            { onSuccess: () => void overlay.close() },
          );
      }}
    >
      <State
        loading={q.isPending}
        error={q.error}
        retry={() => void q.refetch()}
      />
      <Field>
        <FieldLabel htmlFor='resolve-reason'>
          {t('showcase.reason')} *
        </FieldLabel>
        <Textarea
          ref={inputRef}
          id='resolve-reason'
          autoFocus
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            if (e.target.value.trim()) setInvalid(false);
          }}
          aria-invalid={invalid}
          maxLength={2000}
        />
        <FieldError
          errors={invalid ? [{ message: t('showcase.required') }] : []}
        />
      </Field>
    </form>
  );
}
