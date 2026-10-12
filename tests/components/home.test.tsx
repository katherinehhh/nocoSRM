import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router';
import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import locales from '../../client/locales/index.js';
import Workspace from '../../client/pages/home/index.js';
const { access } = vi.hoisted(() => ({ access: { allowed: true } }));
vi.mock('@nocobase/app-plugin-authorization/client', () => ({
  useCan: () => ({ can: access.allowed, isPending: false }),
}));
vi.mock('../../client/pages/operations/common.js', async (original) => ({
  ...(await original<
    typeof import('../../client/pages/operations/common.js')
  >()),
  useData: () => ({
    isPending: false,
    isFetching: false,
    data: access.allowed
      ? {
          data: {
            cards: [{ kind: 'orders', count: 2 }],
            tasks: [{ id: 'task-1', name: 'Check delivery', status: 'open' }],
            recent: [],
            stock: [],
          },
        }
      : undefined,
  }),
}));
vi.mock('../../client/pages/showcase/common.js', async (original) => ({
  ...(await original<typeof import('../../client/pages/showcase/common.js')>()),
  useShowcase: () => ({
    isPending: false,
    isFetching: false,
    data: access.allowed ? { data: { pending: 1 } } : undefined,
  }),
}));
afterEach(cleanup);
async function setup(language = 'zh-CN') {
  const runtime = new I18nRuntime({
    defaultLocale: language,
    locales: ['zh-CN', 'en-US'],
    applicationNamespace: 'app',
  });
  runtime.registerApplicationNamespace('app', locales);
  await runtime.init(language);
  render(
    <I18nProvider runtime={runtime}>
      <MemoryRouter>
        <Workspace />
      </MemoryRouter>
    </I18nProvider>,
  );
}
describe('SRM workspace', () => {
  it.each(['zh-CN', 'en-US'])(
    'shows operational tasks and contextual links without developer or demo prompts (%s)',
    async (language) => {
      access.allowed = true;
      await setup(language);
      expect(
        screen.getByRole('heading', {
          level: 1,
          name: language === 'zh-CN' ? 'SRM 工作台' : 'SRM workspace',
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: /Check delivery/ }),
      ).toHaveAttribute('href', '/records/tasks/task-1');
      expect(
        screen.queryByText(/Create demonstration scenario|创建新演示场景/),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Describe.*build.*review/i),
      ).not.toBeInTheDocument();
    },
  );
  it('keeps an unbound user on a usable landing page without business data or links', async () => {
    access.allowed = false;
    await setup();
    expect(
      screen.getByText('暂无业务权限，请联系管理员配置角色和业务归属。'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Check delivery')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: '采购订单' }),
    ).not.toBeInTheDocument();
  });
});
