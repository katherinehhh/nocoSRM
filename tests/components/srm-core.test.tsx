import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import locales from '../../client/locales/index.js';
import CoreForm from '../../client/pages/srm-core/form.js';
import CoreList from '../../client/pages/srm-core/index.js';
import CoreWorkbench from '../../client/pages/srm-core/workbench.js';
import { sourceValues } from '../../client/pages/srm-core/source-values.js';
import type { Doc } from '../../shared/operations.js';
const mock = vi.hoisted(() => ({ request: vi.fn(), write: vi.fn() }));
vi.mock('../../client/pages/showcase/common.js', async (original) => ({
  ...(await original<typeof import('../../client/pages/showcase/common.js')>()),
  useChildFocus: () => {},
}));
vi.mock('../../client/pages/srm-core/common.js', async (original) => ({
  ...(await original<typeof import('../../client/pages/srm-core/common.js')>()),
  useCoreKind: () => 'inspection',
  useCore: (path: string) => ({
    isPending: false,
    isFetching: false,
    refetch: vi.fn(),
    data: mock.request(path),
  }),
  useCoreWrite: () => mock.write,
}));
const receipt = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Arrival',
  number: 'RC-100',
  supplierId: '22222222-2222-4222-8222-222222222222',
  version: 1,
  payload: {
    lines: [
      {
        id: 'line',
        materialId: 'material',
        quantity: 10,
        price: 100,
        taxRate: 13,
        accepted: 10,
        rejected: 0,
      },
    ],
  },
} as Doc;
async function setup(
  element: React.ReactNode,
  path = '/supply/srm/inspections/new',
) {
  const i18n = new I18nRuntime({
    defaultLocale: 'zh-CN',
    locales: ['zh-CN', 'en-US'],
    applicationNamespace: 'app',
  });
  i18n.registerApplicationNamespace('app', locales);
  await i18n.init('zh-CN');
  const router = createMemoryRouter(
    [
      { path: '/supply/srm/inspections/new', element },
      { path: '/supply/srm/inspections', element },
      { path: '/srm-workbench', element },
    ],
    { initialEntries: [path] },
  );
  render(
    <I18nProvider runtime={i18n}>
      <RouterProvider router={router} />
    </I18nProvider>,
  );
}
afterEach(() => {
  cleanup();
  mock.request.mockReset();
  mock.write.mockReset();
});
describe('core SRM forms and workbench', () => {
  it('fills every inspection source line, rejects inconsistent quantities, focuses missing fields and preserves failures', async () => {
    mock.request.mockImplementation((path) =>
      path.startsWith('lookups/')
        ? {
            data: {
              suppliers: [],
              materials: [{ id: 'material', name: 'Bearing' }],
              rfqs: [],
              receipts: [receipt],
              inspections: [],
              capped: false,
            },
          }
        : undefined,
    );
    mock.write.mockRejectedValue(new Error('isolated failure'));
    await setup(<CoreForm />);
    fireEvent.change(screen.getByLabelText(/来源单据/), {
      target: { value: receipt.id },
    });
    expect(screen.getByLabelText(/^合格数量 1$/)).toHaveValue(10);
    fireEvent.change(screen.getByLabelText(/名称/), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(screen.getByLabelText(/名称/)).toHaveFocus());
    fireEvent.change(screen.getByLabelText(/名称/), {
      target: { value: '质检记录' },
    });
    fireEvent.change(screen.getByLabelText(/检验标准/), {
      target: { value: '规格检查' },
    });
    fireEvent.change(screen.getByLabelText(/核验依据/), {
      target: { value: 'Inspection report' },
    });
    fireEvent.change(screen.getByLabelText(/^合格数量 1$/), {
      target: { value: '6' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(mock.write).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/^不合格数量 1$/), {
      target: { value: '4' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await screen.findByText('连接失败，请检查服务后重试。');
    expect(screen.getByLabelText(/名称/)).toHaveValue('质检记录');
    const body = mock.write.mock.calls[0]![1] as {
      data: {
        sourceVersion: number;
        lines: { accepted: number; rejected: number }[];
      };
    };
    expect(body.data.sourceVersion).toBe(1);
    expect(body.data.lines[0]).toMatchObject({ accepted: 6, rejected: 4 });
  });
  it('puts New only in the empty list and provides a useful empty workbench', async () => {
    mock.request.mockImplementation((path) =>
      path === 'capabilities'
        ? { data: { permissions: { inspection: ['view', 'create'] } } }
        : path === 'workbench'
          ? { data: { tasks: [], blocked: [], capped: false } }
          : { data: [], meta: { total: 0 } },
    );
    await setup(<CoreList />, '/supply/srm/inspections');
    expect(screen.getAllByText('新建收货质检')).toHaveLength(1);
    cleanup();
    await setup(<CoreWorkbench />, '/srm-workbench');
    expect(screen.getByText('暂无可执行待办')).toBeInTheDocument();
  });
  it('prepares rejected-only return lines without accepting stocked quantities', () => {
    const input = sourceValues('return', {
      id: 'inspection',
      kind: 'inspection',
      supplierId: receipt.supplierId,
      lifecycleVersion: 3,
      data: {
        lines: [
          {
            id: 'ok',
            materialId: 'material',
            quantity: 6,
            accepted: 6,
            rejected: 0,
          },
          {
            id: 'bad',
            materialId: 'material',
            quantity: 4,
            accepted: 0,
            rejected: 4,
          },
        ],
      },
    } as any);
    expect(input.data?.lines).toEqual([
      { id: 'bad', materialId: 'material', quantity: 4 },
    ]);
  });
});
