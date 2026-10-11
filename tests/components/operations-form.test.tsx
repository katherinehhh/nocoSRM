import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import locales from '../../client/locales/index.js';
import { DocumentForm } from '../../client/pages/operations/form.js';
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
  const runtime = new I18nRuntime({
    defaultLocale: 'zh-CN',
    locales: ['zh-CN', 'en-US'],
    applicationNamespace: 'app',
  });
  runtime.registerApplicationNamespace('app', locales);
  await runtime.init('zh-CN');
  render(
    <I18nProvider runtime={runtime}>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <DocumentForm kind='suppliers' lookups={{}} />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nProvider>,
  );
}
describe('operations form', () => {
  it('preserves Chinese input on request failure and reports a localized inline error', async () => {
    request.mockRejectedValueOnce(new Error('network'));
    await setup();
    const name = screen.getByRole('textbox', { name: '名称' });
    fireEvent.change(name, { target: { value: '苏州新供应商' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('网络连接失败'),
    );
    expect(name).toHaveValue('苏州新供应商');
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'operations/suppliers',
        method: 'POST',
        json: expect.objectContaining({ name: '苏州新供应商' }),
      }),
    );
    expect(show).not.toHaveBeenCalled();
  });
});
