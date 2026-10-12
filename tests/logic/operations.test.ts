import { loadOperationsFixture } from '../helpers/operations-fixture.js';
// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { expect } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { createStandaloneServer } from '../../server/standalone.js';
import { type Doc } from '../../shared/operations.js';
const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    secrets: {
      keys: [{ version: 1, key: randomBytes(32).toString('base64') }],
    },
    users: { initialAdmin: { ...DEFAULT_ADMIN_CREDENTIALS } },
  },
});
test('manufacturing demo, scoped supplier access and payment segregation', async ({
  testApp,
  app,
  request,
}) => {
  expect((await request('/operations/orders')).status).toBe(401);
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const password = 'Operations-Test-Only-294!';
  await loadOperationsFixture(app, password);
  await loadOperationsFixture(app, password);
  expect(
    (
      await admin.fetch('/operations/demo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost',
        },
        body: JSON.stringify({ password }),
      })
    ).status,
  ).toBe(410);
  const orders = await admin.fetch('/operations/orders');
  expect(orders.status).toBe(200);
  const list = (await orders.json()) as { data: Doc[] };
  expect(list.data).toHaveLength(6);
  const search = await admin.fetch('/operations/orders?q=精工');
  expect(search.status).toBe(200);
  expect(((await search.json()) as { data: Doc[] }).data).toHaveLength(2);
  const supplier = await signIn(testApp, {
    email: 'supplier@supply.demo.invalid',
    password,
  });
  const scoped = await supplier.fetch('/operations/orders');
  expect(scoped.status).toBe(200);
  const own = (await scoped.json()) as { data: Doc[] };
  expect(own.data).toHaveLength(2);
  const forbidden = list.data.find(
    (d) => d.supplierId !== own.data[0]!.supplierId,
  )!;
  expect(
    (await supplier.fetch(`/operations/orders/${forbidden.id}`)).status,
  ).toBe(404);
  expect((await supplier.fetch('/operations/taxScenarios')).status).toBe(403);
  const finance = await signIn(testApp, {
    email: 'finance@supply.demo.invalid',
    password,
  });
  const approver = await signIn(testApp, {
    email: 'approver@supply.demo.invalid',
    password,
  });
  const payments = await finance.fetch('/operations/payments');
  const payment = ((await payments.json()) as { data: Doc[] }).data[0]!;
  const action = async (client: typeof admin, d: Doc, name: string) => {
    const r = await client.fetch(
      `/operations/payments/${d.id}/actions/${name}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost',
        },
        body: JSON.stringify({
          version: d.version,
          requestId: crypto.randomUUID(),
          reference: 'TEST-REF',
          businessDate: '2026-10-10',
        }),
      },
    );
    return { status: r.status, body: (await r.json()) as { data: Doc } };
  };
  const submitted = await action(finance, payment, 'submit');
  expect(submitted.status).toBe(200);
  expect((await action(finance, submitted.body.data, 'approve')).status).toBe(
    403,
  );
  const approved = await action(approver, submitted.body.data, 'approve');
  expect(approved.status).toBe(200);
  const paid = await action(finance, approved.body.data, 'record');
  expect(paid.status).toBe(200);
  expect(paid.body.data.status).toBe('paid');
  const second = await finance.fetch('/operations/payments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
    body: JSON.stringify({
      name: 'over payment',
      supplierId: paid.body.data.supplierId,
      businessDate: '2026-10-10',
      payload: { settlementId: paid.body.data.payload.settlementId },
      amount: 1,
      requestId: crypto.randomUUID(),
    }),
  });
  expect(second.status).toBe(409);
}, 60000);

test('purchase-to-settlement flow, optimistic locking, dry runs and idempotent automation', async ({
  app,
  testApp,
}) => {
  const password = 'Operations-Test-Only-294!';
  await loadOperationsFixture(app, password);
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const planner = await signIn(testApp, {
    email: 'planner@supply.demo.invalid',
    password,
  });
  const buyer = await signIn(testApp, {
    email: 'buyer@supply.demo.invalid',
    password,
  });
  const supplier = await signIn(testApp, {
    email: 'supplier@supply.demo.invalid',
    password,
  });
  const warehouse = await signIn(testApp, {
    email: 'warehouse@supply.demo.invalid',
    password,
  });
  const finance = await signIn(testApp, {
    email: 'finance@supply.demo.invalid',
    password,
  });
  const approver = await signIn(testApp, {
    email: 'approver@supply.demo.invalid',
    password,
  });
  const policyAdmin = await signIn(testApp, {
    email: 'policy@supply.demo.invalid',
    password,
  });
  const headers = {
    'Content-Type': 'application/json',
    Origin: 'http://localhost',
  };
  async function list(client: typeof admin, kind: string) {
    const r = await client.fetch(`/operations/${kind}`);
    expect(r.status).toBe(200);
    return ((await r.json()) as { data: Doc[] }).data;
  }
  async function create(client: typeof admin, kind: string, input: object) {
    const r = await client.fetch(`/operations/${kind}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...input, requestId: crypto.randomUUID() }),
    });
    expect(r.status).toBe(200);
    return ((await r.json()) as { data: Doc }).data;
  }
  async function act(
    client: typeof admin,
    kind: string,
    d: Doc,
    action: string,
    key = crypto.randomUUID(),
  ) {
    if (
      kind === 'receipts' &&
      action === 'post' &&
      d.qualityRequired &&
      d.status === 'draft'
    ) {
      const input = {
        name: 'Test inspection',
        sourceId: d.id,
        supplierId: null,
        deadline: '',
        data: {
          sourceVersion: d.version,
          criteria: 'Test specifications',
          evidence: 'Inspected receipt quantities',
          lines: d.payload.lines!.map((l) => ({
            id: l.id,
            materialId: l.materialId,
            quantity: l.quantity,
            accepted: l.accepted ?? l.quantity,
            rejected: l.rejected ?? 0,
          })),
        },
        requestKey: crypto.randomUUID(),
      };
      const created = await admin.fetch('/srmCore/inspection', {
        method: 'POST',
        headers,
        body: JSON.stringify(input),
      });
      expect(created.status).toBe(200);
      let quality = (
        (await created.json()) as {
          data: { id: string; lifecycleVersion: number };
        }
      ).data;
      for (const [actor, action] of [
        [admin, 'submit'],
        [approver, 'approve'],
      ] as const) {
        const result = await actor.fetch(
          `/srmCore/inspection/${quality.id}/actions/${action}`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              version: quality.lifecycleVersion,
              requestKey: crypto.randomUUID(),
            }),
          },
        );
        expect(result.status).toBe(200);
        quality = ((await result.json()) as { data: typeof quality }).data;
      }
      const current = await client.fetch(`/operations/receipts/${d.id}`);
      d = ((await current.json()) as { data: Doc }).data;
    }
    const r = await client.fetch(
      `/operations/${kind}/${d.id}/actions/${action}`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ version: d.version, requestId: key }),
      },
    );
    expect(r.status).toBe(200);
    return ((await r.json()) as { data: Doc }).data;
  }
  const own = (await list(supplier, 'orders'))[0]!;
  const material = (await list(admin, 'materials'))[0]!,
    store = (await list(admin, 'warehouses'))[0]!;
  let plan = await create(planner, 'plans', {
    name: 'TEST end-to-end plan',
    supplierId: own.supplierId,
    businessDate: '2026-10-10',
    payload: {
      lines: [
        {
          id: 'plan-line',
          materialId: material.id,
          quantity: 10,
          price: 20,
          taxRate: 13,
        },
      ],
    },
  });
  plan = await act(planner, 'plans', plan, 'submit');
  plan = await act(buyer, 'plans', plan, 'approve');
  const key = crypto.randomUUID();
  const converted = await act(buyer, 'plans', plan, 'convert', key);
  expect(
    (await act(buyer, 'plans', plan, 'convert', key)).payload.sourceId,
  ).toBe(converted.payload.sourceId);
  let order = (await list(admin, 'orders')).find(
    (o) => o.id === converted.payload.sourceId,
  )!;
  order = await act(buyer, 'orders', order, 'submit');
  order = await act(admin, 'orders', order, 'approve');
  order = await act(supplier, 'orders', order, 'confirm');
  const line = {
    ...order.payload.lines![0]!,
    id: 'receipt-line',
    sourceLineId: order.payload.lines![0]!.id,
    accepted: 10,
    rejected: 0,
  };
  let receipt = await create(warehouse, 'receipts', {
    name: 'TEST receipt',
    supplierId: own.supplierId,
    businessDate: '2026-10-10',
    payload: { orderId: order.id, warehouseId: store.id, lines: [line] },
  });
  receipt = await act(warehouse, 'receipts', receipt, 'post');
  expect(receipt.status).toBe('posted');
  let invoice = await create(supplier, 'invoices', {
    name: 'TEST invoice',
    businessDate: '2026-10-10',
    payload: {
      orderId: order.id,
      invoiceNumber: 'TEST-INV-CHAIN',
      lines: [{ ...line, id: 'invoice-line' }],
    },
  });
  invoice = await act(supplier, 'invoices', invoice, 'submit');
  invoice = await act(finance, 'invoices', invoice, 'match');
  expect(invoice.status).toBe('matched');
  let settlement = await create(finance, 'settlements', {
    name: 'TEST settlement',
    supplierId: own.supplierId,
    businessDate: '2026-10-10',
    payload: {
      orderId: order.id,
      receiptId: receipt.id,
      invoiceId: invoice.id,
    },
  });
  settlement = await act(finance, 'settlements', settlement, 'match');
  settlement = await act(finance, 'settlements', settlement, 'submit');
  settlement = await act(approver, 'settlements', settlement, 'approve');
  expect(settlement.amount).toBe(22600);
  const policy = (await list(policyAdmin, 'policies')).find(
    (d) => d.payload.template === 'delivery',
  )!;
  const before = (await list(admin, 'tasks')).length;
  const preview = await policyAdmin.fetch(
    `/operations/policies/${policy.id}/actions/dryRun`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        version: policy.version,
        requestId: crypto.randomUUID(),
      }),
    },
  );
  expect(preview.status).toBe(200);
  expect((await list(admin, 'tasks')).length).toBe(before);
  const enabled = await act(policyAdmin, 'policies', policy, 'enable');
  const first = await act(policyAdmin, 'policies', enabled, 'run');
  expect(first.status).toBe('succeeded');
  const count = (await list(admin, 'tasks')).length;
  expect(count).toBeGreaterThan(before);
  const second = await act(policyAdmin, 'policies', enabled, 'run');
  expect(second.status).toBe('skipped');
  expect((await list(admin, 'tasks')).length).toBe(count);
  const stale = await policyAdmin.fetch(
    `/operations/policies/${policy.id}/actions/disable`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        version: policy.version,
        requestId: crypto.randomUUID(),
      }),
    },
  );
  expect(stale.status).toBe(409);
}, 60000);
