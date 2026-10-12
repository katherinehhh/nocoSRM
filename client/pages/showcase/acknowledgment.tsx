import { parseAmount } from '../../lib/acknowledgment.js';
import { useState, useRef } from 'react';
import { useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useApiClient, useToaster } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { RouteDialog } from '#components/route-dialog';
import { useRouteOverlay } from '#components/use-route-overlay';
import { useDirtyClose } from '#hooks/use-dirty-close';
import { Input } from '#components/ui/input';
import { Textarea } from '#components/ui/textarea';
import { Field, FieldLabel, FieldError } from '#components/ui/field';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { State, FormActions } from './states.js';
import { useCopy, useShowcase, type Ledger } from './common.js';
export default function Acknowledgment() {
  const { id } = useParams(),
    { t } = useCopy(),
    q = useShowcase<{ data: Ledger }>(`businessLedger/${id}`, {}, true, true),
    [pending, setPending] = useState(false),
    [dirty, setDirty] = useState(false),
    guard = useDirtyClose(dirty, pending),
    can = useCan({
      resource: { type: 'composite', id: 'showcase.delivery' },
      action: 'sync',
    }).can;
  return (
    <>
      <RouteDialog
        className='sm:max-w-2xl'
        title={t('srm.ackTitle', { name: q.data?.data.name ?? '' })}
        beforeClose={guard.beforeClose}
        footer={
          can && (
            <FormActions
              formId='acknowledgment'
              pending={pending}
              label={t('srm.save')}
            />
          )
        }
      >
        <State
          loading={q.isPending || q.isFetching}
          error={q.error}
          retry={() => void q.refetch()}
        />
        {q.data &&
          !q.error &&
          !q.isFetching &&
          (can ? (
            <AckBody
              record={q.data.data}
              pending={pending}
              setPending={setPending}
              setDirty={setDirty}
              onSaved={guard.allowClose}
            />
          ) : (
            <p>{t('srm.forbidden')}</p>
          ))}
      </RouteDialog>
      {guard.confirmation}
    </>
  );
}
function AckBody({
  record,
  pending,
  setPending,
  setDirty,
  onSaved,
}: {
  record: Ledger;
  pending: boolean;
  setPending: (v: boolean) => void;
  setDirty: (v: boolean) => void;
  onSaved: () => void;
}) {
  const { t } = useCopy(),
    api = useApiClient(),
    cache = useQueryClient(),
    toast = useToaster(),
    overlay = useRouteOverlay(),
    [values, setValues] = useState({
      amount: '',
      quantity: '',
      reference: '',
      reason: '',
    }),
    [invalid, setInvalid] = useState(''),
    [error, setError] = useState(''),
    [version, setVersion] = useState(record.version),
    [conflict, setConflict] = useState(false),
    [initialRequest] = useState(() => crypto.randomUUID()),
    requestRef = useRef(initialRequest);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const amount = parseAmount(values.amount),
      quantity = Number(values.quantity),
      field = invalidField(values);
    if (field) {
      setInvalid(field);
      document.getElementById(`ack-${field}`)?.focus();
      return;
    }
    setPending(true);
    setError('');
    try {
      const result = await api.request<{ data: Ledger }>({
        path: `showcase/businessLedger/${record.id}/acknowledgment`,
        method: 'POST',
        json: {
          ...values,
          amount,
          quantity,
          expectedVersion: version,
          requestId: requestRef.current,
        },
      });
      onSaved();
      cache.setQueriesData(
        { queryKey: ['showcase', `businessLedger/${record.id}`] },
        result,
      );
      await cache.invalidateQueries({ queryKey: ['showcase'] });
      toast.show({
        type: 'success',
        title: t('srm.ackSaved', { name: record.name }),
      });
      await overlay.close();
    } catch (e) {
      const reason =
        e instanceof Error && 'reason' in e ? String(e.reason) : '';
      setConflict(reason === 'CONFLICT');
      setError(t(reason === 'CONFLICT' ? 'srm.conflict' : 'srm.error'));
    } finally {
      setPending(false);
    }
  }
  return (
    <form
      id='acknowledgment'
      className='flex flex-col gap-4'
      onSubmit={(e) => void submit(e)}
    >
      <p className='text-sm text-muted-foreground'>{t('srm.amountScope')}</p>
      <p className='text-sm text-muted-foreground'>{t('srm.quantityHint')}</p>
      <fieldset disabled={pending} className='flex flex-col gap-4'>
        {(['amount', 'quantity', 'reference', 'reason'] as const).map((key) => (
          <Field key={key}>
            <FieldLabel htmlFor={`ack-${key}`}>{t(`srm.${key}`)} *</FieldLabel>
            {key === 'reason' ? (
              <Textarea
                id={`ack-${key}`}
                maxLength={2000}
                value={values[key]}
                onChange={(e) => {
                  setValues({ ...values, [key]: e.target.value });
                  setDirty(true);
                  if (invalid)
                    setInvalid(
                      invalidField({ ...values, [key]: e.target.value }),
                    );
                }}
              />
            ) : (
              <Input
                id={`ack-${key}`}
                inputMode={
                  key === 'amount'
                    ? 'decimal'
                    : key === 'quantity'
                      ? 'numeric'
                      : 'text'
                }
                maxLength={key === 'reference' ? 100 : 16}
                value={values[key]}
                aria-invalid={invalid === key}
                onChange={(e) => {
                  setValues({ ...values, [key]: e.target.value });
                  setDirty(true);
                  if (invalid)
                    setInvalid(
                      invalidField({ ...values, [key]: e.target.value }),
                    );
                }}
              />
            )}
            <FieldError
              errors={
                invalid === key
                  ? [
                      {
                        message: t(
                          key === 'amount' || key === 'quantity'
                            ? 'srm.invalidNumber'
                            : 'srm.required',
                        ),
                      },
                    ]
                  : []
              }
            />
          </Field>
        ))}
      </fieldset>
      {error && (
        <Alert variant='destructive'>
          <AlertDescription>
            {error}
            {conflict && (
              <Button
                type='button'
                variant='outline'
                onClick={() => {
                  void api
                    .request<{ data: Ledger }>({
                      path: `showcase/businessLedger/${record.id}`,
                    })
                    .then((r) => {
                      setVersion(r.data.version);
                      requestRef.current = crypto.randomUUID();
                      setConflict(false);
                      setError('');
                    })
                    .catch(() => setError(t('srm.error')));
                }}
              >
                {t('srm.loadLatest')}
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
    </form>
  );
}

function invalidField(values: {
  amount: string;
  quantity: string;
  reference: string;
  reason: string;
}) {
  const quantity = Number(values.quantity);
  return parseAmount(values.amount) === null
    ? 'amount'
    : !/^\d+$/.test(values.quantity) ||
        !Number.isSafeInteger(quantity) ||
        quantity > 10000000
      ? 'quantity'
      : !values.reference.trim() || values.reference.trim().length > 100
        ? 'reference'
        : !values.reason.trim() || values.reason.trim().length > 2000
          ? 'reason'
          : '';
}
