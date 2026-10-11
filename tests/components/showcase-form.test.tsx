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
import locales from '../../client/locales/index.js';
import { DeliveryForm } from '../../client/pages/showcase/form.js';
const { request, show } = vi.hoisted(() => ({
  request: vi.fn(),
  show: vi.fn(),
}));
vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => ({ request }),
  useToaster: () => ({ show }),
}));
async function setup() {
  request.mockReset();
  show.mockReset();
  request.mockImplementation(({ method }: { method?: string }) =>
    method
      ? Promise.reject(new Error('network'))
      : Promise.resolve({
          data: [{ id: 'order-1', number: 'PO001', name: '采购单' }],
        }),
  );
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
          <DeliveryForm />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nProvider>,
  );
}
afterEach(cleanup);
describe('delivery form', () => {
  it('retains composed Chinese text and lines on failed save', async () => {
    await setup();
    await screen.findByRole('option', { name: 'PO001 · 采购单' });
    const name = screen.getByRole('textbox', { name: '名称 *', exact: true });
    fireEvent.compositionStart(name);
    fireEvent.change(name, { target: { value: '澳大利亚交货计划' } });
    fireEvent.compositionEnd(name);
    fireEvent.change(screen.getByRole('combobox', { name: '采购订单 *' }), {
      target: { value: 'order-1' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: '商品名称 *' }), {
      target: { value: '猫砂盆' },
    });
    fireEvent.click(screen.getByRole('button', { name: '新建' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('操作失败'),
    );
    expect(name).toHaveValue('澳大利亚交货计划');
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: 'showcase/deliveryPlans',
        json: expect.objectContaining({
          lines: [expect.objectContaining({ allocation: 30, unitsPerBox: 6 })],
        }),
      }),
    );
  });
  it('asks before cancelling a dirty form', async () => {
    await setup();
    fireEvent.change(
      screen.getByRole('textbox', { name: '名称 *', exact: true }),
      {
        target: { value: '未保存交货' },
      },
    );
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(
      '放弃未保存的更改',
    );
    expect(
      request.mock.calls.some(
        ([arg]) => (arg as { method?: string }).method === 'POST',
      ),
    ).toBe(false);
  });
});
