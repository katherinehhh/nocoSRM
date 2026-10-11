import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '@nocobase/app-client';
import { Link, Outlet, useLocation } from 'react-router';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Button } from '#components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '#components/ui/card';
import { State, Refresh } from './states.js';
import { useCopy, useShowcase, useWrite, type Overview } from './common.js';
const steps = [
  'delivery-plans',
  'work-board',
  'business-ledger',
  'integrations',
  'print-templates',
  'ai-workbench',
  'mail-center',
] as const;
export default function Showcase() {
  const { t } = useCopy(),
    location = useLocation(),
    query = useShowcase<{ data: Overview }>('overview'),
    write = useWrite(),
    api = useApiClient();
  const workflows = useQuery({
    queryKey: ['showcase', 'workflow-setup'],
    queryFn: ({ signal }) =>
      api.request<{
        data: {
          key: string;
          id: string | null;
          hash: string | null;
          enabled: boolean;
        }[];
      }>({ path: 'workflows', signal }),
    enabled: query.data?.data.workflowManage === true,
    retry: false,
  });
  const approval = workflows.data?.data.find(
    (w) => w.key === 'delivery-approval',
  );
  return (
    <>
      <PageContainer>
        <PageHeader
          title={t('showcase.guide')}
          description={t('showcase.description')}
          actions={
            <Refresh
              pending={query.isFetching}
              onClick={() => {
                void query.refetch();
                void workflows.refetch();
              }}
            />
          }
        />
        <State
          loading={query.isPending}
          error={query.error}
          retry={() => void query.refetch()}
        />
        {query.data && (
          <>
            <div className='grid gap-4 sm:grid-cols-3'>
              {(['count', 'pending', 'completed'] as const).map((key) => (
                <Card key={key}>
                  <CardHeader>
                    <CardDescription>
                      {t(`showcase.metrics.${key}`)}
                    </CardDescription>
                    <CardTitle className='text-3xl tabular-nums'>
                      {query.data.data[key]}
                    </CardTitle>
                  </CardHeader>
                </Card>
              ))}
            </div>
            <Card>
              <CardHeader>
                <CardTitle>{t('showcase.story')}</CardTitle>
                <CardDescription>
                  {t('showcase.storyDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent className='flex flex-col gap-4'>
                {query.data.data.workflowManage && (
                  <div className='flex flex-col gap-3'>
                    <State
                      loading={workflows.isPending}
                      error={workflows.error}
                      retry={() => void workflows.refetch()}
                    />
                    {approval && (
                      <Button
                        className='self-start'
                        variant='outline'
                        disabled={approval.enabled || write.isPending}
                        onClick={() =>
                          write.mutate(
                            {
                              path: `workflows/${approval.id ?? approval.hash}/enable`,
                              json: {},
                            },
                            { onSuccess: () => void workflows.refetch() },
                          )
                        }
                      >
                        {t(
                          approval.enabled
                            ? 'showcase.workflowEnabled'
                            : 'showcase.enableWorkflow',
                        )}
                      </Button>
                    )}
                  </div>
                )}

                <p className='text-sm text-muted-foreground'>
                  {t('showcase.localNotice')}
                </p>
                <div className='flex flex-wrap gap-3'>
                  {query.data.data.actions.includes('create') && (
                    <Button
                      disabled={write.isPending}
                      onClick={() =>
                        write.mutate({
                          path: 'showcase/scenarios',
                          json: { requestId: crypto.randomUUID() },
                        })
                      }
                    >
                      {t('showcase.newScenario')}
                    </Button>
                  )}
                  <Button
                    nativeButton={false}
                    variant='outline'
                    render={<Link to='/delivery-plans' />}
                  >
                    {t('showcase.start')}
                  </Button>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t('showcase.presenterTitle')}</CardTitle>
                <CardDescription>
                  {t('showcase.presenterPrerequisites')}
                </CardDescription>
              </CardHeader>
              <CardContent className='flex flex-col gap-4'>
                <p>{t('showcase.presenterSequence')}</p>
                <p>{t('showcase.presenterLowRisk')}</p>
                <p>{t('showcase.presenterAI')}</p>
                <p className='text-sm text-muted-foreground'>
                  {t(
                    query.data.data.modelReady
                      ? 'showcase.modelReady'
                      : 'showcase.modelUnconfigured',
                  )}
                </p>
                <p className='text-sm text-muted-foreground'>
                  {t('showcase.presenterRepeat')}
                </p>
              </CardContent>
            </Card>
            <div className='grid gap-4 md:grid-cols-2'>
              {steps
                .filter((key) => query.data.data.pages[key])
                .map((key, i) => (
                  <Card key={key}>
                    <CardHeader>
                      <CardTitle>
                        {i + 1}. {t(`showcase.pages.${key}`)}
                      </CardTitle>
                      <CardDescription>
                        {t(`showcase.steps.${key}`)}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button
                        nativeButton={false}
                        variant='outline'
                        render={<Link to={`/${key}`} />}
                      >
                        {t('showcase.open')}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
            </div>
          </>
        )}
      </PageContainer>
      <Outlet context={{ search: location.search }} />
    </>
  );
}
