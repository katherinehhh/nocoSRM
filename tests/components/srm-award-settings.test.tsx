import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import locales from '../../client/locales/index.js';
import AwardSettings from '../../client/pages/operations/award-settings.js';
const mock = vi.hoisted(() => ({
  can: true,
  request: vi.fn(),
  toast: vi.fn(),
  refetch: vi.fn(),
  data: {
    settings: {
      id: 'main',
      enabled: false,
      purchasing: '',
      department: '',
      version: 0,
    },
    people: [
      { id: 'a', name: '采购人员A' },
      { id: 'b', name: '部门人员B' },
    ],
  },
}));
vi.mock('@nocobase/app-plugin-authorization/client', async (original) => ({
  ...(await original<
    typeof import('@nocobase/app-plugin-authorization/client')
  >()),
  useCan: () => ({ can: mock.can }),
}));
vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => ({ request: mock.request }),
  useToaster: () => ({ show: mock.toast }),
}));
vi.mock('../../client/pages/srm-core/common.js', async (original) => ({
  ...(await original<typeof import('../../client/pages/srm-core/common.js')>()),
  useCore: () => ({
    data: { data: mock.data },
    isPending: false,
    isFetching: false,
    refetch: mock.refetch,
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
  render(
    <I18nProvider runtime={i18n}>
      <AwardSettings />
    </I18nProvider>,
  );
}
afterEach(() => {
  cleanup();
  mock.can = true;
  mock.request.mockReset();
  mock.toast.mockReset();
});
describe('Native award settings', () => {
  it('does not show editable controls to unauthorized users', async () => {
    mock.can = false;
    await setup();
    expect(screen.getByText('您没有处理此审批的权限。')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(mock.request).not.toHaveBeenCalled();
  });
  it('requires distinct reviewers and preserves configuration on failed save', async () => {
    await setup();
    fireEvent.click(screen.getByRole('checkbox', { name: '启用原生两级审批' }));
    fireEvent.change(screen.getByLabelText(/采购负责人/), {
      target: { value: 'a' },
    });
    fireEvent.change(screen.getByLabelText(/部门负责人/), {
      target: { value: 'a' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存审批配置' }));
    expect(mock.request).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/部门负责人/)).toHaveFocus();
    fireEvent.change(screen.getByLabelText(/采购负责人/), {
      target: { value: 'a' },
    });
    expect(
      screen.getAllByText(
        '请选择两名不同的有效内部审批人员，且均不能是申请人。',
      ).length,
    ).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText(/部门负责人/), {
      target: { value: 'b' },
    });
    mock.request
      .mockRejectedValueOnce(new Error('isolated failure'))
      .mockResolvedValueOnce({
        data: {
          id: 'main',
          enabled: true,
          purchasing: 'a',
          department: 'b',
          version: 1,
        },
      });
    fireEvent.click(screen.getByRole('button', { name: '保存审批配置' }));
    await screen.findByText('操作失败，已保留填写内容。');
    expect(screen.getByLabelText(/部门负责人/)).toHaveValue('b');
    fireEvent.click(screen.getByRole('button', { name: '保存审批配置' }));
    await screen.findByText('服务端配置已变化，请保留未保存内容后刷新。');
    expect(mock.request.mock.calls[0][0].json).toEqual(
      mock.request.mock.calls[1][0].json,
    );
    expect(mock.toast).toHaveBeenCalledWith({
      type: 'success',
      title: '审批配置已保存',
    });
  });
});
