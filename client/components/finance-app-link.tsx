import { ExternalLink } from 'lucide-react';
import { useTranslation } from '@nocobase/i18n/client';
import { buttonVariants } from '#components/ui/button';
import { financeAppUrl } from '../lib/srm-scope.js';

export function FinanceAppLink() {
  const { t } = useTranslation();
  return (
    <a
      className={buttonVariants({ variant: 'outline' })}
      href={financeAppUrl}
      target='_blank'
      rel='noopener noreferrer'
    >
      <ExternalLink aria-hidden />
      {t('showcase.openFinance')}
    </a>
  );
}
