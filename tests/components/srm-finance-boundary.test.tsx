import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router';
import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import locales from '../../client/locales/index.js';
import Dashboard from '../../client/pages/operations/dashboard.js';
import Portal from '../../client/pages/operations/portal.js';
import LedgerDetail from '../../client/pages/showcase/ledger-detail.js';
import type { Ledger } from '../../client/pages/showcase/common.js';
const bridgeCase = vi.hoisted(() => ({ value: {} as Partial<Ledger> }));
import { FinanceAppLink } from '../../client/components/finance-app-link.js';

vi.mock('../../client/pages/operations/common.js', async (original) => ({
  ...(await original<
    typeof import('../../client/pages/operations/common.js')
  >()),
  useData: () => ({
    isPending: false,
    data: {
      data: {
        cards: ['orders', 'payments'].map((kind) => ({
          kind,
          count: 1,
          amount: 100,
        })),
        tasks: [],
        recent: [],
        stock: [],
      },
    },
  }),
  useCapabilities: () => ({
    isPending: false,
    data: {
      data: {
        permissions: Object.fromEntries(
          [
            'orders',
            'dispatches',
            'invoices',
            'reconciliations',
            'payments',
          ].map((kind) => [kind, ['view']]),
        ),
      },
    },
  }),
}));
vi.mock('../../client/pages/showcase/common.js', async (original) => ({
  ...(await original<typeof import('../../client/pages/showcase/common.js')>()),
  useChildFocus: () => {},
  useShowcase: (path: string) => ({
    isPending: false,
    data: {
      data:
        path === 'overview'
          ? { actions: [] }
          : {
              id: 'delivery-1',
              name: '演示交货',
              disposition: 'disputed',
              localAmount: 10000,
              externalAmount: 11000,
              difference: 1000,
              invoiceAmount: 9900,
              registeredPayments: 8800,
              version: '1',
              resolution: null,
              ...bridgeCase.value,
            },
    },
  }),
}));
afterEach(() => {
  cleanup();
  bridgeCase.value = {};
});
async function setup(element: React.ReactNode, language = 'zh-CN') {
  const runtime = new I18nRuntime({
    defaultLocale: language,
    locales: ['zh-CN', 'en-US'],
    applicationNamespace: 'app',
  });
  runtime.registerApplicationNamespace('app', locales);
  await runtime.init(language);
  render(
    <I18nProvider runtime={runtime}>
      <MemoryRouter>{element}</MemoryRouter>
    </I18nProvider>,
  );
}
describe('SRM and finance presentation boundary', () => {
  it('keeps procurement entry points and removes finance cards from dashboard and portal', async () => {
    await setup(
      <>
        <Dashboard />
        <Portal />
      </>,
    );
    expect(
      screen
        .getAllByRole('link')
        .some((link) => link.getAttribute('href') === '/supply/orders'),
    ).toBe(true);
    expect(
      screen
        .getAllByRole('link')
        .some((link) => link.getAttribute('href') === '/portal/orders'),
    ).toBe(true);
    const hrefs = screen
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'));
    expect(hrefs).not.toContain('/finance/payments');
    expect(hrefs).not.toContain('/portal/invoices');
    expect(hrefs).not.toContain('/portal/reconciliations');
    expect(hrefs).not.toContain('/portal/payments');
  });
  it('retains delivery evidence and shows the separate-app boundary without finance totals', async () => {
    await setup(<LedgerDetail />);
    expect(screen.getByText('采购金额')).toBeInTheDocument();
    expect(screen.getByText('金额差异')).toBeInTheDocument();
    expect(screen.queryByText('已匹配发票金额')).not.toBeInTheDocument();
    expect(screen.queryByText('已登记付款金额')).not.toBeInTheDocument();
    expect(screen.getByText(/签名 API 双向同步/)).toBeInTheDocument();
    expect(screen.getByText(/两套应用需要分别登录/)).toBeInTheDocument();
  });
  it.each(['zh-CN', 'en-US'])(
    'opens the supplied finance URL in a separate window (%s)',
    async (language) => {
      await setup(<FinanceAppLink />, language);
      const link = screen.getByRole('link', {
        name:
          language === 'zh-CN'
            ? '打开财务工作台（新窗口）'
            : 'Open finance workspace (new window)',
      });
      expect(link).toHaveAttribute(
        'href',
        'http://localhost:13002/main/finance',
      );
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    },
  );
});

it('shows original receipt amounts without presenting a draft zero settlement as reconciled', async () => {
  bridgeCase.value = {
    financeBridgeEnabled: true,
    finance: [
      {
        id: 'source',
        receiptNo: 'RC-123',
        receiptLineId: 'line-1',
        updatedAt: '2026-10-12T00:00:00Z',
        original: { netAmount: 100000, taxAmount: 13000, grossAmount: 113000 },
        state: 'synced',
        error: '',
        stale: false,
        result: { status: 'draft', netAmount: 0, taxAmount: 0, grossAmount: 0 },
        url: 'http://localhost:13002/main/finance/bill-1',
      },
    ],
  };
  await setup(<LedgerDetail />);
  expect(screen.getByText(/原始收货金额/)).toHaveTextContent('1,130');
  expect(screen.getByText('尚未完成财务对账')).toBeInTheDocument();
  expect(screen.queryByText(/财务结算金额:/)).not.toBeInTheDocument();
  expect(screen.getByText(/RC-123/)).toHaveTextContent('line-1');
  expect(screen.getByRole('button', { name: '查看财务单据' })).toHaveAttribute(
    'rel',
    'noopener noreferrer',
  );
});
it('makes an incompatible source actionable and explains waiting and configuration states', async () => {
  await setup(<LedgerDetail />);
  expect(
    screen.getByText('请由管理员配置两边应用的接口地址和同步密钥。'),
  ).toBeInTheDocument();
  cleanup();
  bridgeCase.value = { financeBridgeEnabled: true, finance: [] };
  await setup(<LedgerDetail />);
  expect(
    screen.getByText('正式收货过账后进入财务同步；稍后刷新查看结果。'),
  ).toBeInTheDocument();
  cleanup();
  bridgeCase.value.finance = [
    {
      id: 'source',
      receiptNo: 'RC-123',
      receiptLineId: 'line-1',
      updatedAt: '2026-10-12T00:00:00Z',
      original: null,
      state: 'failed',
      error: 'SOURCE_UNSUPPORTED',
      stale: false,
      result: null,
      url: null,
    },
  ];
  await setup(<LedgerDetail />);
  expect(
    screen.getByText(/此收货行数量或金额格式不受支持/),
  ).toBeInTheDocument();
});
