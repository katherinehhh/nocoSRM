vi.mock('@nocobase/app-plugin-authorization/client', async (original) => ({
  ...(await original<
    typeof import('@nocobase/app-plugin-authorization/client')
  >()),
  useAuthorizationRevision: () => 0,
}));
vi.mock('@nocobase/app-plugin-authentication/client', async (original) => ({
  ...(await original<
    typeof import('@nocobase/app-plugin-authentication/client')
  >()),
  useAuthentication: () => ({ session: { user: { id: 'fixture-owner' } } }),
}));
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import type { ModelServiceView } from '@nocobase/app-plugin-agents/shared/models';
import locales from '../../client/locales/index.js';
import { ModelServiceForm } from '../../client/pages/showcase/model-form.js';
import { useWrite } from '../../client/pages/showcase/common.js';
const { request, show, close } = vi.hoisted(() => ({
  request: vi.fn(),
  show: vi.fn(),
  close: vi.fn(),
}));
vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => ({ request }),
  useToaster: () => ({ show }),
}));
vi.mock('../../client/components/use-route-overlay.js', () => ({
  useRouteOverlay: () => ({ close }),
}));
function Harness({ record }: { record?: ModelServiceView }) {
  const write = useWrite();
  return (
    <>
      <ModelServiceForm record={record} write={write} />
      <button type='submit' form='showcase-model'>
        保存
      </button>
    </>
  );
}
async function setup(record?: ModelServiceView) {
  request.mockReset();
  close.mockReset();
  show.mockReset();
  request.mockResolvedValue({ data: { name: 'saved' } });
  const runtime = new I18nRuntime({
    defaultLocale: 'zh-CN',
    locales: ['zh-CN', 'en-US'],
    applicationNamespace: 'app',
  });
  runtime.registerApplicationNamespace('app', locales);
  await runtime.init('zh-CN');
  render(
    <I18nProvider runtime={runtime}>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter>
          <Harness record={record} />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nProvider>,
  );
}
afterEach(cleanup);
const field = (label: string) => screen.getByLabelText(label);
const choose = (value: string) =>
  fireEvent.change(field('供应商 *'), { target: { value } });
describe('model setup defaults', () => {
  it('prefills native URL and model and submits selected provider values', async () => {
    await setup();
    expect(field('服务名称 *')).toHaveValue('OpenAI');
    expect(field('服务地址')).toHaveValue('https://api.openai.com/v1');
    choose('deepseek');
    expect(field('服务名称 *')).toHaveValue('DeepSeek');
    expect(field('模型标识 *')).toHaveValue('deepseek-flash');
    expect(field('服务地址')).toHaveValue('https://api.deepseek.com');
    fireEvent.change(field('API 密钥'), { target: { value: 'fixture-key' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          json: expect.objectContaining({
            provider: 'deepseek',
            baseUrl: 'https://api.deepseek.com',
            models: [{ value: 'deepseek-flash', kind: 'chat' }],
          }),
        }),
      ),
    );
    await waitFor(() => expect(close).toHaveBeenCalled());
  });
  it('preserves custom composed values and clears a key when provider changes', async () => {
    await setup();
    fireEvent.compositionStart(field('服务名称 *'));
    fireEvent.change(field('服务名称 *'), {
      target: { value: '制造业业务助手' },
    });
    fireEvent.compositionEnd(field('服务名称 *'));
    fireEvent.change(field('服务地址'), {
      target: { value: 'https://gateway.example.test/v1' },
    });
    fireEvent.change(field('API 密钥'), { target: { value: 'fixture-key' } });
    choose('google');
    expect(field('服务名称 *')).toHaveValue('制造业业务助手');
    expect(field('服务地址')).toHaveValue('https://gateway.example.test/v1');
    expect(field('API 密钥')).toHaveValue('');
    expect(field('模型标识 *')).toHaveValue('gemini-3.8-flash');
  });
  it('blocks email autofill in URL and requires a real API key', async () => {
    await setup();
    expect(field('API 密钥')).toHaveAttribute('autocomplete', 'new-password');
    expect(field('服务地址')).toHaveAttribute('autocomplete', 'off');
    fireEvent.change(field('服务地址'), {
      target: { value: 'admin@nocobase.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByText(/不能填写邮箱/)).toBeVisible();
    expect(screen.getByText('请填写所选供应商的 API 密钥。')).toBeVisible();
    expect(request).not.toHaveBeenCalled();
  });
  it('requires custom URL/model for compatible service without inventing them', async () => {
    await setup();
    choose('openai-compatible');
    expect(field('服务地址')).toHaveValue('');
    expect(field('模型标识 *')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(
      await screen.findByText('通用兼容服务需要填写服务地址。'),
    ).toBeVisible();
    expect(request).not.toHaveBeenCalled();
  });
  it('retains saved model and key during edit rather than replacing them with defaults', async () => {
    await setup({
      name: 'existing',
      title: '客户自定义服务',
      provider: 'deepseek',
      baseUrl: 'https://proxy.example.test/v1',
      apiKeySet: true,
      enabled: true,
      models: [
        {
          value: 'custom-model',
          label: 'Custom',
          kind: 'chat',
          dimensions: null,
        },
      ],
    } satisfies ModelServiceView);
    expect(field('供应商 *')).toBeDisabled();
    expect(field('模型标识 *')).toHaveValue('custom-model');
    expect(field('API 密钥')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(request).toHaveBeenCalled());
    const json = request.mock.calls[0][0].json as Record<string, unknown>;
    expect(json).not.toHaveProperty('apiKey');
    expect(json).not.toHaveProperty('provider');
  });
});
