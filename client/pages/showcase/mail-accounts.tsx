import { MailAccountsPage } from '@nocobase/app-plugin-mail/client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { Link } from 'react-router';
import { Button } from '#components/ui/button';
export default function MailAccounts() {
  const { can } = useCan({
      resource: { type: 'settings', id: 'operations.admin' },
      action: 'update',
    }),
    { t } = useTranslation();
  return (
    <>
      {can && (
        <div className='flex justify-end p-6'>
          <Button
            variant='outline'
            nativeButton={false}
            render={<Link to='/mail-services' />}
          >
            {t('srmMail.title')}
          </Button>
        </div>
      )}
      <MailAccountsPage />
    </>
  );
}
