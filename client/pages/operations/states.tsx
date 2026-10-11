import { Button } from '#components/ui/button';
import { Spinner } from '#components/ui/spinner';
import { StatusBadge } from '#components/status-badge';
import { useCopy, failure } from './common.js';
export function State({
  loading,
  error,
  empty,
  retry,
  emptyLabel,
}: {
  loading?: boolean;
  error?: unknown;
  empty?: boolean;
  retry?: () => void;
  emptyLabel?: string;
}) {
  const { t } = useCopy();
  if (loading)
    return (
      <div role='status' className='flex justify-center gap-2 p-12'>
        <Spinner />
        {t('ops.loading')}
      </div>
    );
  if (error) {
    const code = failure(error);
    return (
      <div role='alert' className='rounded-xl border p-8 text-center'>
        <p>{t(`ops.errors.${code}`, { defaultValue: t('ops.error') })}</p>
        {![
          'FORBIDDEN',
          'NOT_FOUND',
          '401',
          '403',
          '404',
          'UNAUTHENTICATED',
        ].includes(code) &&
          retry && (
            <Button className='mt-4' variant='outline' onClick={retry}>
              {t('ops.retry')}
            </Button>
          )}
      </div>
    );
  }
  return empty ? (
    <div className='rounded-xl border border-dashed p-12 text-center text-muted-foreground'>
      {emptyLabel ?? t('ops.empty')}
    </div>
  ) : null;
}
export function Status({ value }: { value: string }) {
  const { t } = useCopy();
  return (
    <StatusBadge
      tone={
        [
          'approved',
          'paid',
          'posted',
          'succeeded',
          'completed',
          'confirmed',
          'active',
          'enabled',
          'reviewed',
        ].includes(value)
          ? 'success'
          : ['pending', 'partial', 'shipped', 'open'].includes(value)
            ? 'info'
            : ['disputed', 'failed'].includes(value)
              ? 'warning'
              : 'neutral'
      }
    >
      {t(`ops.status.${value}`, {
        defaultValue: t(`showcase.states.${value}`, { defaultValue: value }),
      })}
    </StatusBadge>
  );
}
