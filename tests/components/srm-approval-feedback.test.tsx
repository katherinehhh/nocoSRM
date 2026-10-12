import { useState } from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import locales from '../../client/locales/index.js';
import { ApprovalActionBar } from '../../client/extensions/nocobase-approval-ui/approval-action-bar.js';

afterEach(cleanup);
function RefusedDecision() {
  const [error, setError] = useState('');
  return (
    <ApprovalActionBar
      actions={[
        {
          key: 'task:approve',
          label: '通过',
          primary: true,
          form: {
            initialValues: { comment: '' },
            submitLabel: '提交审批',
            render: ({ values, setValues }) => (
              <>
                {error && <p role='alert'>{error}</p>}
                <label>
                  意见
                  <input
                    value={
                      typeof values.comment === 'string' ? values.comment : ''
                    }
                    onChange={(e) => setValues({ comment: e.target.value })}
                  />
                </label>
              </>
            ),
          },
          run: async () => {
            await new Promise((resolve) => setTimeout(resolve, 30));
            setError('审批内容已变更，请刷新后核对');
            return false;
          },
        },
      ]}
    />
  );
}

describe('Native approval form failure feedback', () => {
  it('shows fresh server refusal, retains opinion and blocks cancel while submitting', async () => {
    const i18n = new I18nRuntime({
      defaultLocale: 'zh-CN',
      locales: ['zh-CN', 'en-US'],
      applicationNamespace: 'app',
    });
    i18n.registerApplicationNamespace('app', locales);
    await i18n.init('zh-CN');
    render(
      <I18nProvider runtime={i18n}>
        <RefusedDecision />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: '通过' }));
    fireEvent.change(screen.getByLabelText('意见'), {
      target: { value: '已核对数量与交期' },
    });
    const submit = screen.getByRole('button', { name: '提交审批' });
    fireEvent.click(submit);
    expect(screen.getByRole('button', { name: '取消' })).toBeDisabled();
    expect(submit).toBeDisabled();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        '审批内容已变更，请刷新后核对',
      ),
    );
    expect(screen.getByLabelText('意见')).toHaveValue('已核对数量与交期');
    expect(screen.getByRole('button', { name: '取消' })).toBeEnabled();
  });
});
