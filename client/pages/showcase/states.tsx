import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ApiClientError } from '@nocobase/app-client';
import { InboxIcon, RefreshCwIcon } from 'lucide-react';
import { useRouteOverlay } from '#components/use-route-overlay';
import { Spinner } from '#components/ui/spinner';
import { Button } from '#components/ui/button';
import { Skeleton } from '#components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '#components/ui/alert';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from '#components/ui/empty';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '#components/ui/tooltip';
import { useCopy } from './common.js';
import { failure } from '../operations/common.js';
export { Status } from '../operations/states.js';
export function Refresh({
  pending,
  onClick,
}: {
  pending: boolean;
  onClick: () => void;
}) {
  const { t } = useCopy();
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant='outline'
            size='icon'
            aria-label={t('ops.refresh')}
            disabled={pending}
            onClick={onClick}
          />
        }
      >
        <RefreshCwIcon className={pending ? 'animate-spin' : ''} />
      </TooltipTrigger>
      <TooltipContent>{t('ops.refresh')}</TooltipContent>
    </Tooltip>
  );
}
export function State({
  loading,
  error,
  empty,
  retry,
  emptyLabel,
  emptyAction,
  emptyDescription,
  clear,
}: {
  loading?: boolean;
  error?: unknown;
  empty?: boolean;
  retry?: () => void;
  emptyLabel?: string;
  emptyAction?: ReactNode;
  emptyDescription?: string;
  clear?: () => void;
}) {
  const { t } = useCopy();
  if (loading)
    return (
      <div
        role='status'
        aria-label={t('ops.loading')}
        className='grid gap-4 rounded-xl border p-6'
      >
        {['first', 'second', 'third'].map((key) => (
          <div className='grid grid-cols-3 gap-4' key={key}>
            <Skeleton className='h-6' />
            <Skeleton className='h-6' />
            <Skeleton className='h-6' />
          </div>
        ))}
      </div>
    );
  if (error) {
    const code = failure(error);
    const status =
      error instanceof ApiClientError
        ? error.status
        : error instanceof Error && 'status' in error
          ? Number(error.status)
          : 0;
    const permanent =
      [401, 403, 404].includes(status) ||
      ['FORBIDDEN', 'NOT_FOUND', 'UNAUTHENTICATED'].includes(code);
    return (
      <Alert variant='destructive'>
        <AlertTitle>{t('showcase.error')}</AlertTitle>
        <AlertDescription>
          <p>
            {t(`showcase.errors.${code}`, {
              defaultValue: t(`ops.errors.${code}`, {
                defaultValue: t('ops.error'),
              }),
            })}
          </p>
          {status === 401 ? (
            <Button
              nativeButton={false}
              variant='outline'
              render={<Link to='/login' />}
            >
              {t('showcase.signInAgain')}
            </Button>
          ) : status === 404 ? (
            <Button
              nativeButton={false}
              variant='outline'
              render={<Link to='..' />}
            >
              {t('navigation.back')}
            </Button>
          ) : permanent ? (
            <p>{t('showcase.askAdministrator')}</p>
          ) : (
            retry && (
              <Button variant='outline' onClick={retry}>
                {t('ops.retry')}
              </Button>
            )
          )}
        </AlertDescription>
      </Alert>
    );
  }
  if (!empty) return null;
  return (
    <Empty className='min-h-48 border border-dashed'>
      <EmptyHeader>
        <EmptyMedia variant='icon'>
          <InboxIcon />
        </EmptyMedia>
        <EmptyTitle>{emptyLabel ?? t('showcase.emptyTitle')}</EmptyTitle>
        <EmptyDescription>
          {emptyDescription ??
            (emptyLabel
              ? t('showcase.noResults')
              : t('showcase.emptyDescription'))}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {clear ? (
          <Button variant='outline' onClick={clear}>
            {t('ops.clear')}
          </Button>
        ) : (
          emptyAction
        )}
      </EmptyContent>
    </Empty>
  );
}

export function FormActions({
  formId,
  pending,
  label,
}: {
  formId: string;
  pending: boolean;
  label: string;
}) {
  const { t } = useCopy();
  const overlay = useRouteOverlay();
  return (
    <div className='flex justify-end gap-3'>
      <Button
        type='button'
        variant='outline'
        disabled={pending}
        onClick={() => void overlay.close()}
      >
        {t('ops.cancel')}
      </Button>
      <Button type='submit' form={formId} disabled={pending}>
        {pending && <Spinner />}
        {label}
      </Button>
    </div>
  );
}
