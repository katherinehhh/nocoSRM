import { Link, Outlet } from 'react-router';
import { ArrowUpRight } from 'lucide-react';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { portalKinds } from '../../../shared/operations.js';
import { useCopy, useCapabilities } from './common.js';
import { State } from './states.js';

export default function Portal() {
  const { t } = useCopy(),
    caps = useCapabilities();
  return (
    <>
      <PageContainer>
        <PageHeader
          title={t('ops.portal')}
          description={t('ops.portalDescription')}
        />
        <State
          loading={caps.isPending}
          error={caps.error}
          retry={() => void caps.refetch()}
        />
        <div className='grid gap-5 md:grid-cols-2 xl:grid-cols-3'>
          {portalKinds
            .filter((k) => caps.data?.data.permissions[k].includes('view'))
            .map((k) => (
              <Link
                key={k}
                className='space-y-5 rounded-xl border bg-card p-6 hover:bg-muted/40'
                to={`/portal/${k}`}
              >
                <div className='flex justify-between'>
                  <h2 className='text-lg font-semibold'>
                    {t(`ops.kinds.${k}`)}
                  </h2>
                  <ArrowUpRight className='size-5' />
                </div>
                <p className='text-sm leading-6 text-muted-foreground'>
                  {t(`ops.descriptions.${k}`)}
                </p>
              </Link>
            ))}
        </div>
      </PageContainer>
      <Outlet />
    </>
  );
}
