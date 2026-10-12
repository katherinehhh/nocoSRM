import { useRef, useState } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
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
export function useDirtyClose(
  dirty: boolean,
  pending: boolean,
  notice?: { title: string; description: string },
) {
  const { t } = useTranslation(),
    [open, setOpen] = useState(false),
    approvedRef = useRef(false),
    resolverRef = useRef<((v: boolean) => void) | null>(null);
  function finish(value: boolean) {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setOpen(false);
  }
  return {
    allowClose: () => {
      approvedRef.current = true;
    },
    beforeClose: () =>
      approvedRef.current
        ? true
        : pending
          ? false
          : !dirty
            ? true
            : new Promise<boolean>((resolve) => {
                resolverRef.current = resolve;
                setOpen(true);
              }),
    confirmation: (
      <AlertDialog
        open={open}
        onOpenChange={(v) => {
          if (!v) finish(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {notice?.title ?? t('srm.discard')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {notice?.description ?? t('srm.discardNotice')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => finish(false)}>
              {t('srm.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => finish(true)}>
              {t('srm.close')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    ),
  };
}
