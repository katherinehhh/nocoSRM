import { ListTodo } from 'lucide-react';
import { Link, Outlet, useLocation } from 'react-router';
import { useTranslation } from '@nocobase/i18n/client';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '#components/ui/card';
import { Button } from '#components/ui/button';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '#components/ui/empty';
import { State, Refresh } from '../showcase/states.js';
import { useCore } from './common.js';
import { coreKinds, corePaths } from '../../../shared/srm-core.js';
interface WorkData {
  tasks: {
    id: string;
    name: string;
    number: string;
    kind: string;
    action: string;
    path: string;
    deadline: string;
  }[];
  blocked: {
    id: string;
    name: string;
    path: string;
    remaining: number;
    overdue: boolean;
  }[];
  capped: boolean;
}
export default function CoreWorkbench() {
  const { t, i18n } = useTranslation(),
    location = useLocation(),
    q = useCore<{ data: WorkData }>('workbench'),
    r = q.data?.data;
  return (
    <>
      <PageContainer>
        <PageHeader
          title={t('core.workbench')}
          description={t('core.workbenchHint')}
          actions={
            <Refresh pending={q.isFetching} onClick={() => void q.refetch()} />
          }
        />
        <State
          loading={q.isPending}
          error={q.error}
          retry={() => void q.refetch()}
        />
        {r && (
          <>
            <div className='grid gap-4 sm:grid-cols-2'>
              {[
                ['taskCount', r.tasks.length],
                ['shortfallCount', r.blocked.length],
              ].map(([label, value]) => (
                <Card key={label}>
                  <CardHeader>
                    <CardTitle>{t(`core.${label}`)}</CardTitle>
                  </CardHeader>
                  <CardContent className='text-3xl font-semibold tabular-nums'>
                    {new Intl.NumberFormat(i18n.language).format(Number(value))}
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className='grid gap-4 lg:grid-cols-2'>
              {[...coreKinds, 'order', 'receipt'].map((kind) => {
                const rows = r.tasks.filter((task) => task.kind === kind);
                if (!rows.length) return null;
                return (
                  <Card key={kind}>
                    <CardHeader>
                      <CardTitle>
                        {t(`core.kinds.${kind}`)} ·{' '}
                        {new Intl.NumberFormat(i18n.language).format(
                          rows.length,
                        )}
                      </CardTitle>
                      <CardDescription>{t('core.taskHint')}</CardDescription>
                    </CardHeader>
                    <CardContent className='flex flex-col gap-3'>
                      {rows.slice(0, 10).map((task) => (
                        <div
                          key={`${task.id}:${task.action}`}
                          className='flex flex-wrap items-center justify-between gap-2'
                        >
                          <span className='min-w-0 break-words text-sm'>
                            {task.name}
                          </span>
                          <Button
                            variant='outline'
                            nativeButton={false}
                            render={
                              <Link
                                to={
                                  task.path.includes('?')
                                    ? task.path
                                    : {
                                        pathname: task.path,
                                        search: location.search,
                                      }
                                }
                              />
                            }
                          >
                            {t(`core.actions.${task.action}`)}
                          </Button>
                        </div>
                      ))}
                    </CardContent>
                    <CardFooter>
                      <Button
                        variant='link'
                        nativeButton={false}
                        render={
                          <Link
                            to={
                              kind === 'order'
                                ? '/portal/orders'
                                : kind === 'receipt'
                                  ? '/supply/receipts'
                                  : corePaths[kind as keyof typeof corePaths]
                            }
                          />
                        }
                      >
                        {t('core.viewAll')}
                      </Button>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
            {!r.tasks.length && (
              <Empty className='border'>
                <EmptyHeader>
                  <EmptyMedia variant='icon'>
                    <ListTodo />
                  </EmptyMedia>
                  <EmptyTitle>{t('core.noTasks')}</EmptyTitle>
                  <EmptyDescription>{t('core.noTasksHint')}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
            <Card>
              <CardHeader>
                <CardTitle>{t('core.shortfalls')}</CardTitle>
                <CardDescription>{t('core.shortfallHint')}</CardDescription>
              </CardHeader>
              <CardContent className='flex flex-col gap-3'>
                {r.blocked.slice(0, 10).map((task) => (
                  <div
                    key={task.id}
                    className='flex flex-wrap items-center justify-between gap-2'
                  >
                    <span className='text-sm'>
                      {task.name} ·{' '}
                      {t('core.remaining', { count: task.remaining })}
                      {task.overdue && ` · ${t('core.overdue')}`}
                    </span>
                    <Button
                      variant='outline'
                      nativeButton={false}
                      render={<Link to={task.path} />}
                    >
                      {t('core.open')}
                    </Button>
                  </div>
                ))}
                {!r.blocked.length && (
                  <p className='text-sm text-muted-foreground'>
                    {t('core.noShortfalls')}
                  </p>
                )}
              </CardContent>
              <CardFooter>
                <Button
                  variant='link'
                  nativeButton={false}
                  render={<Link to='/supply/orders' />}
                >
                  {t('core.viewAll')}
                </Button>
              </CardFooter>
            </Card>
            {r.capped && (
              <p className='text-sm text-muted-foreground'>
                {t('core.workCap')}
              </p>
            )}
          </>
        )}
      </PageContainer>
      <Outlet />
    </>
  );
}
