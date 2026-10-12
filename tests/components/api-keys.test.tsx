import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import locales from '../../client/locales/index.js';
import ApiKeys, { ApiKeyForm } from '../../client/pages/api-keys/index.js';
const { api, show } = vi.hoisted(() => ({
  api: {
    list: vi.fn(),
    create: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  show: vi.fn(),
}));
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({ session: { user: { id: 'fixture-user' } } }),
  useAuthenticationClient: () => ({ apiKey: api }),
}));
vi.mock('@nocobase/app-plugin-authorization/client', async (original) => ({
  ...(await original<
    typeof import('@nocobase/app-plugin-authorization/client')
  >()),
  useAuthorizationRevision: () => 0,
}));
vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<typeof import('@nocobase/app-client')>()),
  useToaster: () => ({ show }),
}));
afterEach(cleanup);
async function setup(
  path = '/api-keys/new',
  prepare?: (cache: QueryClient) => void,
) {
  for (const f of Object.values(api)) f.mockReset();
  show.mockReset();
  api.list.mockResolvedValue({ data: { apiKeys: [], total: 0 }, error: null });
  api.create.mockResolvedValue({
    data: { id: 'fixture-key', key: 'fixture-only-secret' },
    error: null,
  });
  api.delete.mockResolvedValue({ data: { success: true }, error: null });
  api.update.mockResolvedValue({ data: { success: true }, error: null });
  const runtime = new I18nRuntime({
    defaultLocale: 'zh-CN',
    locales: ['zh-CN', 'en-US'],
    applicationNamespace: 'app',
  });
  runtime.registerApplicationNamespace('app', locales);
  await runtime.init('zh-CN');
  const router = createMemoryRouter(
    [
      {
        path: '/api-keys',
        element: <ApiKeys />,
        children: [
          { path: 'new', element: <ApiKeyForm /> },
          { path: ':id/edit', element: <ApiKeyForm /> },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  prepare?.(cache);
  render(
    <I18nProvider runtime={runtime}>
      <QueryClientProvider client={cache}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </I18nProvider>,
  );
  return { cache, router };
}
describe('native API key management', () => {
  it('validates the name and displays a newly created key once without placing it in query cache', async () => {
    const { cache, router } = await setup();
    fireEvent.click(screen.getByRole('button', { name: '新建', exact: true }));
    expect(api.create).not.toHaveBeenCalled();
    expect(screen.getByLabelText('密钥名称 *')).toHaveFocus();
    fireEvent.change(screen.getByLabelText('密钥名称 *'), {
      target: { value: 'ERP connection' },
    });
    fireEvent.click(screen.getByRole('button', { name: '新建', exact: true }));
    await screen.findByText(/完整密钥仅显示这一次/);
    expect(api.create).toHaveBeenCalledWith({
      name: 'ERP connection',
      expiresIn: 2592000,
    });
    expect(
      JSON.stringify(
        cache
          .getQueryCache()
          .getAll()
          .map((q) => q.state.data),
      ),
    ).not.toContain('fixture-only-secret');
    expect(
      screen.queryByRole('button', { name: '新建', exact: true }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '完成' }));
    await screen.findByText('已安全保存密钥？');
    fireEvent.click(screen.getByRole('button', { name: '关闭', exact: true }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/api-keys'),
    );
    await waitFor(() =>
      expect(
        screen.queryByDisplayValue('fixture-only-secret'),
      ).not.toBeInTheDocument(),
    );
  });
  it('keeps the create form and user input when the native service rejects creation', async () => {
    await setup();
    api.create.mockResolvedValue({
      error: { code: 'BAD_REQUEST' },
      data: null,
    });
    fireEvent.change(screen.getByLabelText('密钥名称 *'), {
      target: { value: 'Warehouse integration' },
    });
    fireEvent.click(screen.getByRole('button', { name: '新建', exact: true }));
    await screen.findByText('操作未完成，请核对资料后重试。');
    expect(screen.getByLabelText('密钥名称 *')).toHaveValue(
      'Warehouse integration',
    );
    expect(
      screen.getByRole('button', { name: '新建', exact: true }),
    ).toBeEnabled();
  });
  it('waits for fresh key details before exposing the rename editor', async () => {
    let resolve!: (value: unknown) => void;
    await setup('/api-keys/fixture-key/edit', (cache) => {
      cache.setQueryData(
        ['srm-api-key-edit', 'fixture-key', 'fixture-user', 0],
        { id: 'fixture-key', name: 'stale name' },
      );
      api.get.mockReturnValue(
        new Promise((done) => {
          resolve = done;
        }),
      );
    });
    expect(screen.queryByDisplayValue('stale name')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: '密钥名称 *' }),
    ).not.toBeInTheDocument();
    resolve({
      data: { id: 'fixture-key', name: 'Fresh key name' },
      error: null,
    });
    expect(
      await screen.findByDisplayValue('Fresh key name'),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue('Fresh key name'), {
      target: { value: 'Edited key name' },
    });
    await cacheFocusTick();
    expect(screen.getByDisplayValue('Edited key name')).toBeInTheDocument();
  });
});

async function cacheFocusTick() {
  window.dispatchEvent(new Event('focus'));
  await Promise.resolve();
}
