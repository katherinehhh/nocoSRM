import { Link, Outlet } from 'react-router';
import { z } from 'zod';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '#components/ui/card';
import { Button } from '#components/ui/button';
import { State } from './states.js';
import { TemplateSchema } from '../../../shared/showcase.js';
import { useCopy, useShowcase, type Overview } from './common.js';
export default function Templates() {
  const { t } = useCopy(),
    caps = useShowcase<{ data: Overview }>('overview'),
    q = useShowcase<{
      data: { revision: number; config: z.infer<typeof TemplateSchema> };
    }>('printTemplates/delivery');
  return (
    <>
      <PageContainer>
        <PageHeader
          title={t('showcase.templates')}
          description={t('showcase.templateDescription')}
        />
        <State
          loading={q.isPending}
          error={q.error}
          retry={() => void q.refetch()}
        />
        {q.data && (
          <Card>
            <CardHeader>
              <CardTitle>{q.data.data.config.title}</CardTitle>
              <CardDescription>
                {t('showcase.revision', { revision: q.data.data.revision })}
              </CardDescription>
            </CardHeader>
            <CardContent className='flex flex-col gap-4'>
              <p>
                {t('showcase.grid', {
                  columns: q.data.data.config.labelColumns,
                  rows: q.data.data.config.labelRows,
                  count: q.data.data.config.labelCount,
                })}
              </p>
              <p className='text-sm text-muted-foreground'>
                {t('showcase.templateSafe')}
              </p>
              {caps.data?.data.actions.includes('configure') && (
                <Button
                  className='self-end'
                  nativeButton={false}
                  render={<Link to='edit' />}
                >
                  {t('ops.edit')}
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </PageContainer>
      <Outlet />
    </>
  );
}
