import type {
  RunView,
  TaskActions,
} from '@nocobase/app-plugin-approval/client';
import {
  createTestApp as createFinanceTestApp,
  signIn as financeSignIn,
} from '../../../app2/tests/helpers/bridge-app.js';
// @vitest-environment node
import { randomBytes, createHmac, randomUUID } from 'node:crypto';
import { expect, test, vi } from 'vitest';
import { createTestApp } from '@nocobase/app-testing/server';
import { DEFAULT_ADMIN_CREDENTIALS } from '@nocobase/app-plugin-authentication/testing';
import { createStandaloneServer as createSrm } from '../../server/standalone.js';
import { createStandaloneServer as createFinance } from '../../../app2/server/standalone.js';
import { bridgeToken as srmToken } from '../../server/integration/provider.js';
import { bridgeToken as financeToken } from '../../../app2/server/integration/provider.js';
import { runCustomerDemo } from '../../cli/commands/lib/customer-demo.js';
import { SourceMessage } from '../../server/integration/protocol.js';
test('two apps synchronize tax snapshots, enforce native approval, recover real writeback and reject replays', async () => {
  const secret = randomBytes(32).toString('hex');
  const config = {
    app: { publicOrigin: 'http://localhost' },
    financeFixtures: { enabled: true },
    financeBridge: {
      enabled: true,
      secret,
      srmBaseUrl: 'http://127.0.0.1:13001/main',
      financeBaseUrl: 'http://localhost:13002/main',
    },
    secrets: {
      keys: [{ version: 1, key: randomBytes(32).toString('base64') }],
    },
    users: { initialAdmin: DEFAULT_ADMIN_CREDENTIALS },
  };
  const finance = await createFinanceTestApp({
    createServer: createFinance,
    config,
  });
  const srm = await createTestApp({ createServer: createSrm, config });
  let failResult = false;
  vi.stubGlobal(
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      if (request.url.startsWith('http://localhost:13002/'))
        return finance.fetch(request);
      if (request.url.startsWith('http://127.0.0.1:13001/')) {
        if (failResult) return new Response('{}', { status: 503 });
        return srm.fetch(request);
      }
      throw new Error('Unexpected external request');
    },
  );
  try {
    const sender = srm.application.container.resolve(srmToken),
      receiver = finance.application.container.resolve(financeToken);
    sender.config.enabled = false; // Keep the real scheduler from importing during test preparation.
    const demo = await runCustomerDemo(srm.application);
    const receiptRepo = sender.db.repository('opsReceipts');
    const receipt = await receiptRepo.findOne({
      filter: { id: demo.records.receipt },
    });
    expect(receipt).toBeTruthy();
    const originalPayload =
      typeof receipt!.payload === 'string'
        ? JSON.parse(receipt!.payload)
        : receipt!.payload;
    for (const accepted of [0.5, 0]) {
      await receiptRepo.updateOne({
        filter: { id: receipt!.id },
        values: {
          payload: JSON.stringify({
            ...originalPayload,
            lines: originalPayload.lines.map((line: object) => ({
              ...line,
              accepted,
            })),
          }),
        },
      });
      sender.config.enabled = true;
      await sender.sync();
      const rejected = await sender.db
        .repository('srmFinanceSources')
        .findOne({ filter: { receiptId: receipt!.id } });
      expect(rejected!.state).toBe('failed');
      expect(rejected!.lastError).toBe('SOURCE_UNSUPPORTED');
      await sender.sync();
      expect(
        (await sender.db
          .repository('srmFinanceSources')
          .findOne({ filter: { id: rejected!.id } }))!.sourceVersion,
      ).toBe(rejected!.sourceVersion);
      expect(
        await receiver.db
          .repository('financeBills')
          .count({ filter: { sourceId: rejected!.id } }),
      ).toBe(0);
    }
    await receiptRepo.updateOne({
      filter: { id: receipt!.id },
      values: { payload: JSON.stringify(originalPayload) },
    });
    await sender.sync();
    const source = await receiver.db
      .repository('financeSources')
      .findOne({ filter: { srmOrderId: demo.records.verifiedOrder } });
    expect(source).toBeTruthy();
    const bill = await receiver.db
      .repository('financeBills')
      .findOne({ filter: { sourceId: source!.id } });
    expect(bill!.originalAmount).toBe(100000);
    expect(bill!.originalTaxAmount).toBe(13000);
    expect(bill!.originalGrossAmount).toBe(113000);
    expect(bill!.status).toBe('draft');
    expect(bill!.demo).toBe(false);
    const count = await receiver.db.repository('financeBills').count();
    await sender.sync();
    expect(await receiver.db.repository('financeBills').count()).toBe(count);
    const exported = await sender.db
      .repository('srmFinanceSources')
      .findOne({ filter: { orderId: demo.records.verifiedOrder } });
    const message = SourceMessage.parse(JSON.parse(String(exported!.snapshot)));
    async function signed(body: unknown, key = secret) {
      const raw = JSON.stringify(body),
        time = String(Date.now());
      return finance.request('/integrations/srm/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-bridge-time': time,
          'x-bridge-signature': createHmac('sha256', key)
            .update(`${time}.${raw}`)
            .digest('hex'),
        },
        body: raw,
      });
    }
    expect((await signed(message)).status).toBe(200);
    expect(
      (await signed(message, 'wrong-secret-key-that-is-long-enough')).status,
    ).toBe(403);
    expect((await signed({ ...message, receivedQty: 9 })).status).toBe(409);
    const admin = await financeSignIn(finance, DEFAULT_ADMIN_CREDENTIALS),
      headers = {
        'Content-Type': 'application/json',
        Origin: 'http://localhost',
      },
      password = 'Finance-Bridge-Isolated-Only-294!';
    expect(
      (
        await admin.fetch('/finance/demo', {
          method: 'POST',
          headers,
          body: JSON.stringify({ password }),
        })
      ).status,
    ).toBe(200);
    const user = await financeSignIn(finance, {
        email: 'finance@finance.demo.invalid',
        password,
      }),
      procurement = await financeSignIn(finance, {
        email: 'procurement@finance.demo.invalid',
        password,
      }),
      approver = await financeSignIn(finance, {
        email: 'approver@finance.demo.invalid',
        password,
      });
    async function action(
      actor: typeof user,
      name: string,
      extra: object = {},
    ) {
      const b = await receiver.db
        .repository('financeBills')
        .findOne({ filter: { id: bill!.id } });
      return actor.fetch(`/finance/bills/${bill!.id}/actions/${name}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          version: b!.lifecycleVersion,
          requestKey: randomUUID(),
          ...extra,
        }),
      });
    }
    const registered = await user.fetch('/finance/bills', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        sourceId: source!.id,
        requestKey: randomUUID(),
        billNo: 'INV-BRIDGE-10',
        quantity: 10,
        unitPrice: 10000,
        originalText:
          'Isolated supplier invoice: ten units at CNY100; supporting evidence registered separately from SRM receipt.',
      }),
    });
    expect(registered.status).toBe(200);
    expect((await action(user, 'reconcile')).status).toBe(200);
    expect(
      (
        await action(procurement, 'document', {
          reason: '真实SRM收货核对',
          evidence: '采购及收货单来源快照',
        })
      ).status,
    ).toBe(200);
    expect((await action(user, 'confirm')).status).toBe(200);
    expect((await action(user, 'submit')).status).toBe(200);
    expect(
      (await action(user, 'approve', { note: 'self approval' })).status,
    ).toBe(403);
    // Finance now requires its native claimed approval task; legacy direct approval must refuse.
    expect(
      (await action(approver, 'approve', { note: 'legacy bypass' })).status,
    ).toBe(400);
    async function nativeView() {
      return (await (
        await approver.fetch(`/finance/bills/${bill!.id}/approval`)
      ).json()) as { data: { runs: RunView[]; actions: TaskActions[] } };
    }
    let approvalView = await nativeView();
    const claim = approvalView.data.actions.find((item) =>
      item.actions.some((action) => action.name === 'claim'),
    );
    if (claim) {
      expect(
        (
          await approver.fetch(`/finance/bills/${bill!.id}/approval/actions`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              taskId: claim.task.id,
              action: 'claim',
              requestKey: randomUUID(),
            }),
          })
        ).status,
      ).toBe(200);
      approvalView = await nativeView();
    }
    const approve = approvalView.data.actions.find((item) =>
      item.actions.some((action) => action.name === 'approve'),
    )!;
    expect(approve).toBeDefined();
    const approvalRun = approvalView.data.runs.find(
      (run) => run.run.id === approve.task.runId,
    )!;
    expect(
      (
        await approver.fetch(`/finance/bills/${bill!.id}/approval/actions`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            taskId: approve.task.id,
            action: 'approve',
            contentHash: approvalRun.run.contentHash,
            comment: '独立审核收货、税额与含税结算金额',
            requestKey: randomUUID(),
          }),
        })
      ).status,
    ).toBe(200);
    await receiver.sync(); // Approved scanner event precedes the separately versioned post event.
    expect((await action(user, 'post', { simulateFail: true })).status).toBe(
      400,
    );
    expect((await action(user, 'post')).status).toBe(200);
    failResult = true;
    await receiver.sync();
    expect(
      (await receiver.db
        .repository('financeBills')
        .findOne({ filter: { id: bill!.id } }))!.status,
    ).toBe('approved');
    const completion = vi
      .spyOn(receiver.runtime, 'fire')
      .mockRejectedValueOnce(new Error('isolated completion interruption'));
    failResult = false;
    await receiver.sync();
    expect(
      (await receiver.db
        .repository('financeBills')
        .findOne({ filter: { id: bill!.id } }))!.status,
    ).toBe('approved');
    expect(
      (
        await receiver.db
          .repository('financeBridgeOutbox')
          .findMany({ filter: { billId: bill!.id, complete: true } })
      )[0]!.state,
    ).toBe('acked');
    completion.mockRestore();
    await receiver.sync();
    const pendingRows = await receiver.db
      .repository('financeBridgeOutbox')
      .findMany({ filter: { billId: bill!.id } });
    expect(
      pendingRows
        .filter((r) => r.complete)
        .map((r) => ({ state: r.state, error: r.error })),
    ).toEqual([{ state: 'sent', error: '' }]);
    expect(
      (await receiver.db
        .repository('financeBills')
        .findOne({ filter: { id: bill!.id } }))!.status,
    ).toBe('posted');
    await receiver.sync();
    const results = await sender.db
      .repository('srmFinanceSources')
      .findOne({ filter: { id: exported!.id } });
    const outcome = JSON.parse(String(results!.result));
    expect(outcome.status).toBe('posted');
    expect(outcome.grossAmount).toBe(113000);
    expect(outcome.taxAmount).toBe(13000);
    expect(
      await receiver.db.repository('financeExecutions').count({
        filter: { billId: bill!.id, target: 'SRM', status: 'success' },
      }),
    ).toBe(1);
    expect(
      (
        await signed({
          ...message,
          eventId: `${message.id}:2`,
          sourceVersion: 2,
          receivedQty: 9,
        })
      ).status,
    ).toBe(409);
  } finally {
    vi.unstubAllGlobals();
    await srm.close();
    await finance.close();
  }
}, 90000);
