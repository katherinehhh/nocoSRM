// @vitest-environment node
import { randomBytes, randomUUID, createHmac } from 'node:crypto';
import { expect, test, vi } from 'vitest';
import { createTestApp } from '@nocobase/app-testing/server';
import { DEFAULT_ADMIN_CREDENTIALS } from '@nocobase/app-plugin-authentication/testing';
import {
  createTestApp as createFinanceApp,
  signIn as financeSignIn,
  userManagementServiceToken,
} from '../../../app2/tests/helpers/bridge-app.js';
import { createStandaloneServer as createSrm } from '../../server/standalone.js';
import { createStandaloneServer as createFinance } from '../../../app2/server/standalone.js';
import { bridgeToken as srmToken } from '../../server/integration/provider.js';
import { bridgeToken as financeToken } from '../../../app2/server/integration/provider.js';
import { SourceMessage, digest } from '../../server/integration/protocol.js';

test('real two-app invoice registration, 100/95 difference, 19000 approval, retry and immutable audit contract', async () => {
  const secret = randomBytes(32).toString('hex');
  const config = {
    app: { publicOrigin: 'http://localhost' },
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
  const finance = await createFinanceApp({
    createServer: createFinance,
    config,
  });
  const srm = await createTestApp({ createServer: createSrm, config });
  let fail = false;
  vi.stubGlobal(
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(input, init);
      if (req.url.startsWith('http://localhost:13002/'))
        return finance.fetch(req);
      if (req.url.startsWith('http://127.0.0.1:13001/'))
        return fail ? new Response('{}', { status: 503 }) : srm.fetch(req);
      throw new Error('Unexpected external destination');
    },
  );
  try {
    const receiver = finance.application.container.resolve(financeToken),
      sender = srm.application.container.resolve(srmToken);
    const receiptId = randomUUID(),
      line = 'line-01';
    const source = SourceMessage.parse({
      eventId: 'import:' + receiptId,
      organizationId: 'main',
      id: `srm:${receiptId}:${line}`,
      orderId: randomUUID(),
      receiptId,
      receiptLineId: line,
      supplierId: randomUUID(),
      supplier: 'Verified home supplier',
      orderNo: 'PO-INVOICE-100',
      receiptNo: 'GRN-95',
      sku: 'HOME-CHAIR',
      orderedQty: 100,
      receivedQty: 95,
      unitPrice: 20000,
      currency: 'CNY',
      taxRateBps: 0,
      sourceVersion: 1,
    });
    // A signed authoritative SRM source snapshot in an isolated DB, independent of SRM showcase recipes.
    await sender.db.repository('srmFinanceSources').createOne({
      values: {
        id: source.id,
        orderId: source.orderId,
        receiptId,
        supplierId: source.supplierId,
        digest: digest(source),
        state: 'synced',
        billId: '',
        lastError: '',
        sourceVersion: 1,
        snapshot: JSON.stringify(source),
        result: '',
        updatedAt: new Date().toISOString(),
      },
    });
    const financeWebhook = (init: RequestInit) =>
      finance.fetch(
        new Request(
          'http://localhost:13002/main/api/integrations/srm/import',
          init,
        ),
      );
    const raw = JSON.stringify(source),
      time = String(Date.now());
    const signedHeaders = {
      'content-type': 'application/json',
      'x-bridge-time': time,
      'x-bridge-signature': createHmac('sha256', secret)
        .update(`${time}.${raw}`)
        .digest('hex'),
    };
    expect(
      (
        await financeWebhook({
          method: 'POST',
          headers: { ...signedHeaders, 'x-bridge-signature': '0'.repeat(64) },
          body: raw,
        })
      ).status,
    ).toBe(403);
    const imported = await financeWebhook({
      method: 'POST',
      headers: signedHeaders,
      body: raw,
    });
    expect(imported.status).toBe(200);
    const {
      data: { billId },
    } = (await imported.json()) as { data: { billId: string } };
    expect(
      await (
        await financeWebhook({
          method: 'POST',
          headers: signedHeaders,
          body: raw,
        })
      ).json(),
    ).toEqual({ data: { billId } });
    await sender.db
      .repository('srmFinanceSources')
      .updateOne({ filter: { id: source.id }, values: { billId } });
    const users = finance.application.container.resolve(
        userManagementServiceToken,
      ),
      password = 'Isolated-Invoice-Only-2026!';
    for (const role of ['finance', 'procurement', 'approver'])
      await users.create({
        name: role,
        email: `${role}@invoice-test.invalid`,
        password,
        roleScopes: { app: [`finance-${role}`] },
      });
    const financial = await financeSignIn(finance, {
      email: 'finance@invoice-test.invalid',
      password,
    });
    const procurement = await financeSignIn(finance, {
      email: 'procurement@invoice-test.invalid',
      password,
    });
    const approver = await financeSignIn(finance, {
      email: 'approver@invoice-test.invalid',
      password,
    });
    const headers = {
      'content-type': 'application/json',
      origin: 'http://localhost',
    };
    const post = (actor: typeof financial, path: string, data: unknown) =>
      actor.fetch(path, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
      });
    async function act(
      actor: typeof financial,
      name: string,
      extra: object = {},
    ) {
      const row = await receiver.db
        .repository('financeBills')
        .findOne({ filter: { id: billId } });
      return post(actor, `/finance/bills/${billId}/actions/${name}`, {
        requestKey: randomUUID(),
        version: row!.lifecycleVersion,
        ...extra,
      });
    }
    expect((await act(financial, 'reconcile')).status).toBe(400);
    await receiver.sync();
    expect(await sender.db.repository('srmFinanceInbox').count()).toBe(0);
    const invoice = {
      sourceId: source.id,
      requestKey: randomUUID(),
      billNo: 'INV-HOME-100',
      quantity: 100,
      unitPrice: 20000,
      originalText:
        'Supplier original: 100 units at CNY 200 each, total CNY 20000.',
    };
    expect((await post(procurement, '/finance/bills', invoice)).status).toBe(
      403,
    );
    const registered = await post(financial, '/finance/bills', invoice);
    expect(registered.status).toBe(200);
    expect(await registered.json()).toMatchObject({
      data: {
        id: billId,
        invoiceRegistered: true,
        originalAmount: 2000000,
        originalText: invoice.originalText,
      },
    });
    expect((await post(financial, '/finance/bills', invoice)).status).toBe(200);
    expect(
      (await post(financial, '/finance/bills', { ...invoice, quantity: 99 }))
        .status,
    ).toBe(409);
    expect(
      (
        await post(financial, '/finance/bills', {
          ...invoice,
          requestKey: randomUUID(),
          billNo: 'INV-DUPLICATE',
        })
      ).status,
    ).toBe(409);
    const reconciled = await act(financial, 'reconcile');
    expect(reconciled.status).toBe(200);
    expect(await reconciled.json()).toMatchObject({
      data: { differenceAmount: 100000, settlementAmount: 1900000 },
    });
    expect(
      (
        await act(procurement, 'document', {
          reason: 'Short receipt of 5 units',
          evidence:
            'Confirmed receiving note and supplier agreement for 95 units',
        })
      ).status,
    ).toBe(200);
    expect((await act(financial, 'confirm')).status).toBe(200);
    expect((await act(financial, 'submit')).status).toBe(200);
    expect((await act(financial, 'approve', { note: 'self' })).status).toBe(
      403,
    );
    expect(
      (
        await act(approver, 'approve', {
          note: 'Checked 95 units, approve CNY 19000',
        })
      ).status,
    ).toBe(200);
    expect((await act(financial, 'post', { simulateFail: true })).status).toBe(
      400,
    );
    expect((await act(financial, 'post')).status).toBe(200);
    fail = true;
    await receiver.sync();
    expect(
      (await receiver.db
        .repository('financeBills')
        .findOne({ filter: { id: billId } }))!.status,
    ).toBe('approved');
    fail = false;
    const completion = vi
      .spyOn(receiver.runtime, 'fire')
      .mockRejectedValueOnce(new Error('isolated completion interruption'));
    await receiver.sync();
    expect(
      (
        await receiver.db
          .repository('financeBridgeOutbox')
          .findMany({ filter: { billId, complete: true } })
      )[0]!.state,
    ).toBe('acked');
    completion.mockRestore();
    await receiver.sync();
    await receiver.sync();
    const completed = await receiver.db
      .repository('financeBills')
      .findOne({ filter: { id: billId } });
    expect(completed).toMatchObject({
      status: 'posted',
      originalText: invoice.originalText,
      settlementAmount: 1900000,
    });
    expect(String(completed!.receiptDraftText)).toContain('GRN-95');
    const back = await sender.db
      .repository('srmFinanceSources')
      .findOne({ filter: { id: source.id } });
    expect(JSON.parse(String(back!.result))).toMatchObject({
      billId,
      status: 'posted',
      netAmount: 1900000,
      grossAmount: 1900000,
    });
    expect(
      await receiver.db
        .repository('financeExecutions')
        .count({ filter: { billId, target: 'SRM', status: 'success' } }),
    ).toBe(1);
    const ledger = await receiver.db
      .repository('financeExecutions')
      .findOne({ filter: { billId, target: 'SRM', status: 'success' } });
    expect(ledger!.attempt).toBe(2);
    const audit = await (
      await financial.fetch(`/finance/bills/${billId}/audit`)
    ).json();
    expect(audit).toMatchObject({
      data: {
        integrationMode: 'srm',
        paymentExecuted: false,
        bill: { invoiceRegistered: true, originalText: invoice.originalText },
      },
    });
  } finally {
    vi.unstubAllGlobals();
    await srm.close();
    await finance.close();
  }
}, 60000);
