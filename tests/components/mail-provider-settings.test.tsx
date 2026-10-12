import {
  render,
  screen,
  fireEvent,
  within,
  cleanup,
  waitFor,
} from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import locales from '../../client/locales/index.js';
import MailSettings from '../../client/pages/mail-settings/index.js';
const mock = vi.hoisted(() => ({
  can: true,
  request: vi.fn(),
  toast: vi.fn(),
  guard: null as (() => boolean) | null,
}));
vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => ({ request: mock.request }),
  useToaster: () => ({ show: mock.toast }),
  useNavigationGuard: (guard: () => boolean) => {
    mock.guard = guard;
  },
}));
vi.mock('@nocobase/app-plugin-authorization/client', async (original) => ({
  ...(await original<
    typeof import('@nocobase/app-plugin-authorization/client')
  >()),
  useCan: () => ({ can: mock.can }),
  useAuthorizationRevision: () => 0,
}));
vi.mock('@nocobase/app-plugin-authentication/client', async (original) => ({
  ...(await original<
    typeof import('@nocobase/app-plugin-authentication/client')
  >()),
  useAuthentication: () => ({ session: { user: { id: 'mail-admin' } } }),
}));
const gmail = {
  name: 'gmail',
  type: 'gmail',
  configured: false,
  enabled: false,
  hasSecret: false,
  clientId: '',
  tenant: 'common',
  imap: { host: '', port: 993, secure: true },
  smtp: { host: '', port: 465, secure: true },
};
const data = {
  version: '0:fixture',
  callbackUrl: 'http://127.0.0.1:13001/main/mail/oauth/callback',
  providers: [gmail],
};
async function setup() {
  const i18n = new I18nRuntime({
    defaultLocale: 'zh-CN',
    locales: ['zh-CN', 'en-US'],
    applicationNamespace: 'app',
  });
  i18n.registerApplicationNamespace('app', locales);
  await i18n.init('zh-CN');
  render(
    <I18nProvider runtime={i18n}>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <RouterProvider
          router={createMemoryRouter([
            { path: '/', element: <MailSettings /> },
            {
              path: '/mail-accounts',
              element: <div>Connected mailbox destination</div>,
            },
          ])}
        />
      </QueryClientProvider>
    </I18nProvider>,
  );
}
afterEach(() => {
  cleanup();
  mock.can = true;
  mock.request.mockReset();
  mock.toast.mockReset();
});
describe('Mail provider configuration', () => {
  it('does not load or expose configuration controls for nonadministrators', async () => {
    mock.can = false;
    await setup();
    expect(screen.getByText('仅管理员可以配置邮件服务。')).toBeInTheDocument();
    expect(mock.request).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/客户端密钥/)).not.toBeInTheDocument();
  });
  it('focuses missing fields, retains failed secret input, clears it on success and confirms disable', async () => {
    mock.request.mockImplementation(({ method }) =>
      method === 'POST'
        ? Promise.reject(new Error('isolated save refusal'))
        : Promise.resolve({ data }),
    );
    await setup();
    await screen.findByText('Gmail');
    const card = within(
      screen.getByText('Gmail').closest('[data-slot="card"]') as HTMLElement,
    );
    const client = card.getByLabelText(/客户端 ID/),
      secret = card.getByLabelText(/客户端密钥/);
    fireEvent.change(client, { target: { value: 'temporary' } });
    fireEvent.change(client, { target: { value: '' } });
    fireEvent.click(card.getByRole('button', { name: /保存.*配置/ }));
    expect(client).toHaveFocus();
    expect(
      mock.request.mock.calls.filter(([v]) => v.method === 'POST'),
    ).toHaveLength(0);
    fireEvent.change(client, { target: { value: 'new-client' } });
    fireEvent.click(card.getByRole('button', { name: /保存.*配置/ }));
    expect(secret).toHaveFocus();
    fireEvent.change(secret, { target: { value: 'isolated-ui-secret' } });
    expect(card.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(card.getByRole('button', { name: /保存.*配置/ }));
    await screen.findByText('保存失败，已保留填写内容。');
    expect(secret).toHaveValue('isolated-ui-secret');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(mock.guard?.()).toBe(false);
    expect(confirm).toHaveBeenCalledWith(
      '将丢弃未保存的邮件服务配置，已保存的配置保持不变。',
    );
    expect(secret).toHaveValue('isolated-ui-secret');
    confirm.mockRestore();
    fireEvent.click(screen.getByRole('button', { name: '连接邮箱账户' }));
    await screen.findByRole('alertdialog');
    expect(
      screen.getByText('将丢弃未保存的邮件服务配置，已保存的配置保持不变。'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    );
    expect(secret).toHaveValue('isolated-ui-secret');
    expect(
      screen.queryByText('Connected mailbox destination'),
    ).not.toBeInTheDocument();
    const calls = mock.request.mock.calls.filter(([v]) => v.method === 'POST');
    const firstKey = calls[0][0].json.requestKey;
    mock.request.mockResolvedValueOnce({
      data: {
        ...data,
        version: '1:fixture',
        providers: [
          {
            ...gmail,
            configured: true,
            enabled: true,
            hasSecret: true,
            clientId: 'new-client',
          },
        ],
      },
    });
    fireEvent.click(card.getByRole('button', { name: /保存.*配置/ }));
    await screen.findByText('已有密钥，无需重复填写');
    expect(secret).toHaveValue('');
    expect(
      mock.request.mock.calls.filter(([v]) => v.method === 'POST')[1][0].json
        .requestKey,
    ).toBe(firstKey);
    fireEvent.click(card.getByRole('button', { name: '停用' }));
    await screen.findByRole('alertdialog');
    expect(
      screen.getByText(
        '已连接账户将暂停收发和同步。已保存邮件保留，可重新启用服务商。',
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    );
    expect(
      mock.request.mock.calls.filter(([v]) => v.path.endsWith('/enabled')),
    ).toHaveLength(0);
  });
});
