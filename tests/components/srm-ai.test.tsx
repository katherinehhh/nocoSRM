vi.mock('@nocobase/app-plugin-authorization/client', async (original) => ({
  ...(await original<
    typeof import('@nocobase/app-plugin-authorization/client')
  >()),
  useCan: () => ({ can: true }),
}));
import {
  render,
  screen,
  fireEvent,
  cleanup,
  within,
} from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import locales from '../../client/locales/index.js';
import BusinessAi from '../../client/pages/srm-core/ai.js';
const mock = vi.hoisted(() => ({
  call: vi.fn(),
  configured: true,
  toast: vi.fn(),
}));
vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => ({ request: mock.call }),
  useToaster: () => ({ show: mock.toast }),
}));
vi.mock('../../client/pages/showcase/common.js', async (original) => ({
  ...(await original<typeof import('../../client/pages/showcase/common.js')>()),
  useChildFocus: () => {},
}));
vi.mock('../../client/pages/srm-core/common.js', async (original) => ({
  ...(await original<typeof import('../../client/pages/srm-core/common.js')>()),
  useCoreKind: () => 'rfq',
  useCore: (path: string) => ({
    isPending: false,
    isFetching: false,
    refetch: vi.fn(),
    data:
      path === 'ai/status'
        ? {
            data: {
              configured: mock.configured,
              model: mock.configured ? { model: 'isolated-test-model' } : null,
            },
          }
        : path.startsWith('lookups/')
          ? {
              data: {
                suppliers: [],
                materials: [{ id: 'material', name: '轴承' }],
              },
            }
          : path.startsWith('rfq/')
            ? {
                data: {
                  record: {
                    id: '11111111-1111-4111-8111-111111111111',
                    name: '采购需求',
                    number: 'RFQ-TEST',
                    status: 'draft',
                    lifecycleVersion: 1,
                    data: { lines: [] },
                  },
                  available: ['edit'],
                  quotes: [],
                },
              }
            : undefined,
  }),
}));
async function setup() {
  const i18n = new I18nRuntime({
    defaultLocale: 'zh-CN',
    locales: ['zh-CN', 'en-US'],
    applicationNamespace: 'app',
  });
  i18n.registerApplicationNamespace('app', locales);
  await i18n.init('zh-CN');
  const router = createMemoryRouter(
    [{ path: '/supply/srm/rfqs/:id/ai', element: <BusinessAi /> }],
    {
      initialEntries: [
        '/supply/srm/rfqs/11111111-1111-4111-8111-111111111111/ai',
      ],
    },
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider runtime={i18n}>
        <RouterProvider router={router} />
      </I18nProvider>
    </QueryClientProvider>,
  );
}
afterEach(() => {
  cleanup();
  mock.call.mockReset();
  mock.configured = true;
  mock.toast.mockReset();
});
describe('SRM AI business proposals', () => {
  it('does not offer inference without a configured model', async () => {
    mock.configured = false;
    await setup();
    expect(
      screen.getByRole('button', { name: '分析并生成建议' }),
    ).toBeDisabled();
    expect(mock.call).not.toHaveBeenCalled();
  });
  it('requires source text and retains it on model failure', async () => {
    mock.call.mockRejectedValue(new Error('isolated network failure'));
    await setup();
    fireEvent.click(screen.getByRole('button', { name: '分析并生成建议' }));
    expect(screen.getByLabelText(/补充需求或文件文本/)).toHaveFocus();
    fireEvent.change(screen.getByLabelText(/补充需求或文件文本/), {
      target: { value: '轴承12件' },
    });
    expect(screen.getByLabelText(/补充需求或文件文本/)).not.toHaveAttribute(
      'aria-invalid',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: '分析并生成建议' }));
    await screen.findByText('连接失败，请检查服务后重试。');
    expect(screen.getByLabelText(/补充需求或文件文本/)).toHaveValue('轴承12件');
  });
  it('shows structured evidence then writes only after explicit confirmation', async () => {
    const p = {
      id: '22222222-2222-4222-8222-222222222222',
      purpose: 'requestDraft',
      kind: 'rfq',
      recordId: '11111111-1111-4111-8111-111111111111',
      recordName: '采购需求',
      version: 1,
      createdAt: '2026-10-12T00:00:00Z',
      expiresAt: '2099-12-31T00:00:00Z',
      model: { model: 'test-double' },
      suggestion: {
        summary: '识别到轴承12件',
        reason: '来自原始需求',
        findings: [{ evidence: '轴承12件', observation: '数量为12' }],
        uncertainties: [],
        selectedQuoteId: null,
        lines: [{ id: 'line', materialId: 'material', quantity: 12 }],
      },
      canApply: true,
      status: 'pending',
    };
    mock.call
      .mockResolvedValueOnce({ data: p })
      .mockRejectedValueOnce(new Error('transient confirmation failure'))
      .mockResolvedValueOnce({
        data: {
          ...p,
          status: 'applied',
          result: {
            id: p.recordId,
            kind: 'rfq',
            path: '/supply/srm/rfqs/' + p.recordId,
          },
        },
      });
    await setup();
    fireEvent.change(screen.getByLabelText(/补充需求或文件文本/), {
      target: { value: '轴承12件' },
    });
    fireEvent.click(screen.getByRole('button', { name: '分析并生成建议' }));
    await screen.findByText('识别到轴承12件');
    expect(mock.call).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '确认更新询价明细' }));
    expect(mock.call).toHaveBeenCalledTimes(1);
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: '确认更新询价明细',
      }),
    );
    await screen.findByText('连接失败，请检查服务后重试。');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByText('识别到轴承12件')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '确认更新询价明细' }));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: '确认更新询价明细',
      }),
    );
    await screen.findByText('已对“采购需求”执行确认的业务操作');
    expect(
      screen.getByRole('button', { name: '打开结果单据' }),
    ).toHaveAttribute('href', '/supply/srm/rfqs/' + p.recordId);
    expect(mock.call).toHaveBeenCalledTimes(3);
    expect(mock.call.mock.calls[1]![0].json).toEqual({});
  });
});
