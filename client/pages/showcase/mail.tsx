import { MailWorkspacePage } from '@nocobase/app-plugin-mail/client';
import { useCopy } from './common.js';
export default function Mail() {
  const { t } = useCopy();
  return (
    <MailWorkspacePage
      title={t('showcase.mail')}
      description={t('showcase.mailDescription')}
      accountsHref='/mail-accounts'
    />
  );
}
