import { loadOperationsFixture } from '../helpers/operations-fixture.js';
// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { expect, vi } from 'vitest';
import { showcaseToken } from '../../server/providers/showcase/index.js';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { workflowServiceToken } from '@nocobase/app-plugin-workflow/server';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import { createStandaloneServer } from '../../server/standalone.js';
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
test('public native workflow and agents server contracts coexist with client3', async ({
  testApp,
  app,
  request,
}) => {
  expect((await request('/workflows')).status).toBe(401);
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const r = await admin.fetch('/workflows');
  expect(r.status).toBe(200);
  expect(
    app.container.resolve(workflowServiceToken).getInstructionApi('wait'),
  ).toBeDefined();
  const agents = app.container.resolve(agentsToken);
  expect(await agents.online.gateway.catalog('chat')).toEqual({
    services: [],
    defaultModel: null,
  });
  const swagger = await admin.fetch('/swagger');
  expect(swagger.status).toBe(200);
  const spec = (await swagger.json()) as { paths: Record<string, unknown> };
  expect(Object.keys(spec.paths).some((p) => p.includes('/agents/'))).toBe(
    true,
  );
}, 60000);

test('operational SRM disables demos, accepts real acknowledgments and preserves lifecycle boundaries', async ({
  testApp,
  app,
  request,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS),
    headers = {
      'Content-Type': 'application/json',
      Origin: 'http://localhost',
    };
  const post = (path: string, body: unknown) =>
    admin.fetch(path, { method: 'POST', headers, body: JSON.stringify(body) });
  await loadOperationsFixture(app, 'Showcase-Test-Only-294!');
  for (const path of [
    '/operations/demo',
    '/showcase/scenarios',
    '/showcase/integrations/demo/sync',
    '/showcase/integrations/demo/callback',
    '/showcase/integrations/demo/failure',
    '/showcase/assistant/prepare',
    '/showcase/assistant/commit',
  ])
    expect((await post(path, {})).status).toBe(410);
  expect((await request('/showcase/businessLedger')).status).toBe(401);
  expect(
    (
      await post('/showcase/assistant/analyze', {
        text: 'Actual text',
        mode: 'rules',
      })
    ).status,
  ).toBe(410);
  const orderResult = await admin.fetch('/showcase/orders');
  expect(orderResult.status).toBe(200);
  const order = (await orderResult.json()).data[0] as {
    id: string;
    version: number;
    sourceLines: { id: string; sku: string; name: string; quantity: number }[];
  };
  const values = {
    name: 'Actual delivery',
    orderId: order.id,
    expectedOrderVersion: order.version,
    region: 'CN',
    businessDate: '2026-10-11',
    notes: '',
    labelCount: 1,
    lines: [
      {
        sourceLineId: order.sourceLines[0].id,
        sku: order.sourceLines[0].sku || 'CONFIRMED-SKU',
        name: order.sourceLines[0].name || 'Confirmed material',
        fnsku: '',
        allocation: 30,
        unitsPerBox: 6,
      },
    ],
    requestId: 'operational-delivery',
  };
  const invalid = await post('/showcase/deliveryPlans', {
    ...values,
    requestId: 'invalid-lines',
    lines: [{ ...values.lines[0], allocation: 100000 }],
  });
  expect(invalid.status).toBe(400);
  const created = await post('/showcase/deliveryPlans', values);
  expect(created.status).toBe(200);
  const delivery = (await created.json()).data as {
    id: string;
    lifecycleVersion: number;
  };
  const read = async () =>
    (
      await (
        await admin.fetch(`/showcase/businessLedger/${delivery.id}`)
      ).json()
    ).data as {
      version: string;
      disposition: string;
      localAmount: number;
      quantityDifference: number;
      provenance: string;
    };
  const initial = await read();
  expect(initial.disposition).toBe('needsReview');
  const ack = {
    amount: initial.localAmount,
    quantity: 32,
    reference: 'SUP-ACK-01',
    reason: 'Checked supplier document',
    expectedVersion: initial.version,
    requestId: 'ack-01',
  };
  const accepted = await post(
    `/showcase/businessLedger/${delivery.id}/acknowledgment`,
    ack,
  );
  expect(accepted.status).toBe(200);
  const current = await read();
  expect(current.provenance).toBe('manual');
  expect(current.quantityDifference).toBe(2);
  expect(current.disposition).toBe('disputed');
  expect(
    (await post(`/showcase/businessLedger/${delivery.id}/acknowledgment`, ack))
      .status,
  ).toBe(200);
  expect(
    (
      await post(`/showcase/businessLedger/${delivery.id}/acknowledgment`, {
        ...ack,
        quantity: 33,
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await post(`/showcase/businessLedger/${delivery.id}/resolve`, {
        expectedVersion: current.version,
        reason: 'Quantity discrepancy checked',
        requestId: 'resolve-01',
      })
    ).status,
  ).toBe(200);
  const resolved = await read();
  expect(resolved.disposition).toBe('resolved');
  expect(
    (
      await post(`/showcase/businessLedger/${delivery.id}/acknowledgment`, {
        ...ack,
        quantity: 30,
        expectedVersion: resolved.version,
        requestId: 'ack-02',
      })
    ).status,
  ).toBe(200);
  expect((await read()).disposition).toBe('matched');
  const disabled = await post(`/showcase/deliveryPlans/${delivery.id}/fire`, {
    transition: 'submit',
    expectVersion: delivery.lifecycleVersion,
    requestId: 'submit-disabled',
  });
  expect(disabled.status).toBe(503);
  const latest = (
    await (await admin.fetch(`/showcase/deliveryPlans/${delivery.id}`)).json()
  ).data;
  expect(latest.record.status).toBe('draft');
  const list = await admin.fetch('/workflows');
  const workflow = (await list.json()).data.find(
    (w: { key: string }) => w.key === 'delivery-approval',
  );
  expect(
    (await post(`/workflows/${workflow.id ?? workflow.hash}/enable`, {}))
      .status,
  ).toBe(200);
  expect(
    (
      await post(`/showcase/deliveryPlans/${delivery.id}/fire`, {
        transition: 'submit',
        expectVersion: latest.record.lifecycleVersion,
        requestId: 'submit-enabled',
      })
    ).status,
  ).toBe(200);
  const approver = await signIn(testApp, {
    email: 'approver@supply.demo.invalid',
    password: 'Showcase-Test-Only-294!',
  });
  await expect
    .poll(
      async () =>
        (
          await (
            await approver.fetch(`/showcase/deliveryPlans/${delivery.id}`)
          ).json()
        ).data.wait?.status,
      { timeout: 10000 },
    )
    .toBe('pending');
  const pending = (
    await (await admin.fetch(`/showcase/deliveryPlans/${delivery.id}`)).json()
  ).data.record;
  expect(
    (
      await post(`/showcase/deliveryPlans/${delivery.id}/fire`, {
        transition: 'approve',
        expectVersion: pending.lifecycleVersion,
        requestId: 'self-approval',
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await approver.fetch(`/showcase/deliveryPlans/${delivery.id}/fire`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          transition: 'approve',
          expectVersion: pending.lifecycleVersion,
          requestId: 'approve-other',
        }),
      })
    ).status,
  ).toBe(200);
  await expect
    .poll(
      async () =>
        (
          await (
            await admin.fetch(`/showcase/deliveryPlans/${delivery.id}`)
          ).json()
        ).data.record.status,
      { timeout: 10000 },
    )
    .toBe('approved');
  const approved = (
    await (await admin.fetch(`/showcase/deliveryPlans/${delivery.id}`)).json()
  ).data.record;
  expect(
    (
      await post(`/showcase/deliveryPlans/${delivery.id}/fire`, {
        transition: 'ship',
        expectVersion: approved.lifecycleVersion,
        requestId: 'ship',
      })
    ).status,
  ).toBe(200);
  await expect
    .poll(
      async () =>
        (
          await (
            await admin.fetch(`/showcase/deliveryPlans/${delivery.id}`)
          ).json()
        ).data.effectRuns.length,
      { timeout: 10000 },
    )
    .toBeGreaterThan(0);
  const events = (
    await (await admin.fetch('/showcase/integrations/events')).json()
  ).data;
  expect(
    events.filter(
      (e: { direction: string; state: string }) =>
        e.direction === 'outbound' && e.state === 'succeeded',
    ),
  ).toHaveLength(0);
}, 60000);

test('low-risk approval requires real evidence and a current confirmed source order', async ({
  testApp,
  app,
}) => {
  await loadOperationsFixture(app, 'Showcase-Test-Only-294!');
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS),
    headers = {
      'Content-Type': 'application/json',
      Origin: 'http://localhost',
    };
  const post = (path: string, body: unknown) =>
    admin.fetch(path, { method: 'POST', headers, body: JSON.stringify(body) });
  const supplier = (await (await admin.fetch('/operations/suppliers')).json())
      .data[0],
    material = (await (await admin.fetch('/operations/materials')).json())
      .data[0];
  const buyer = await signIn(testApp, {
    email: 'buyer@supply.demo.invalid',
    password: 'Showcase-Test-Only-294!',
  });
  const buyerPost = (path: string, body: unknown) =>
    buyer.fetch(path, { method: 'POST', headers, body: JSON.stringify(body) });
  const response = await buyerPost('/operations/orders', {
    name: 'Low risk actual order',
    supplierId: supplier.id,
    businessDate: '2026-10-11',
    notes: '',
    payload: {
      lines: [
        {
          id: 'risk-line',
          materialId: material.id,
          quantity: 1,
          price: 100,
          taxRate: 13,
        },
      ],
    },
    requestId: 'risk-order',
  });
  expect(response.status).toBe(200);
  let order = (await response.json()).data;
  for (const action of ['submit', 'approve', 'confirm']) {
    order = (await (await admin.fetch(`/operations/orders/${order.id}`)).json())
      .data;
    const result = await (action === 'submit' ? buyerPost : post)(
      `/operations/orders/${order.id}/actions/${action}`,
      { version: order.version, requestId: `risk-${action}` },
    );
    expect(result.status).toBe(200);
    order = (await result.json()).data;
  }
  const delivery = await post('/showcase/deliveryPlans', {
    name: 'Evidence-gated approval',
    orderId: order.id,
    expectedOrderVersion: order.version,
    region: 'CN',
    businessDate: '2026-10-11',
    notes: '',
    labelCount: 1,
    lines: [
      {
        sourceLineId: 'risk-line',
        sku: material.number,
        name: material.name,
        fnsku: '',
        allocation: 1,
        unitsPerBox: 1,
      },
    ],
    requestId: 'risk-delivery',
  });
  expect(delivery.status).toBe(200);
  const record = (await delivery.json()).data;
  expect(
    (
      await post(`/showcase/deliveryPlans/${record.id}/policy`, {
        enabled: true,
        expectVersion: record.lifecycleVersion,
      })
    ).status,
  ).toBe(200);
  const { showcaseToken } =
      await import('../../server/providers/showcase/index.js'),
    service = app.container.resolve(showcaseToken);
  expect((await service.risk(record.id)).lowRisk).toBe(false);
  const ledger = (
    await (await admin.fetch(`/showcase/businessLedger/${record.id}`)).json()
  ).data;
  expect(
    (
      await post(`/showcase/businessLedger/${record.id}/acknowledgment`, {
        amount: order.amount,
        quantity: 1,
        reference: 'REAL-RISK-ACK',
        reason: 'Actual supplier evidence',
        expectedVersion: ledger.version,
        requestId: 'risk-evidence',
      })
    ).status,
  ).toBe(200);
  expect((await service.risk(record.id)).lowRisk).toBe(true);
  // Simulate an independent source revision in this isolated database, not in the user's app.
  await service.db.repository('opsOrders').updateOne({
    filter: { id: order.id },
    values: { version: order.version + 1 },
  });
  expect((await service.risk(record.id)).lowRisk).toBe(false);
}, 60000);

test('approval startup recovers without duplicate runs and ledger numeric sort covers multiple pages', async ({
  testApp,
  app,
}) => {
  await loadOperationsFixture(app, 'Showcase-Test-Only-294!');
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const post = (path: string, body: unknown) =>
    admin.fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost',
      },
      body: JSON.stringify(body),
    });
  const order = (
    await (await admin.fetch('/showcase/orders')).json()
  ).data.find(
    (o: { sourceLines: { quantity: number }[] }) =>
      o.sourceLines[0].quantity >= 5,
  );
  const workflows = (await (await admin.fetch('/workflows')).json()).data;
  const workflow = workflows.find(
    (w: { key: string }) => w.key === 'delivery-approval',
  );
  expect(
    (await post(`/workflows/${workflow.id ?? workflow.hash}/enable`, {}))
      .status,
  ).toBe(200);
  const created: { id: string; lifecycleVersion: number }[] = [];
  for (let i = 0; i < 23; i++) {
    const response = await post('/showcase/deliveryPlans', {
      name: `Sort and recovery ${i}`,
      orderId: order.id,
      expectedOrderVersion: order.version,
      region: 'CN',
      businessDate: '2026-10-11',
      notes: '',
      labelCount: 1,
      lines: [
        {
          sourceLineId: order.sourceLines[0].id,
          sku: order.sourceLines[0].sku,
          name: order.sourceLines[0].name,
          fnsku: '',
          allocation: (i % 5) + 1,
          unitsPerBox: 1,
        },
      ],
      requestId: `sort-create-${i}`,
    });
    expect(response.status).toBe(200);
    created.push((await response.json()).data);
  }
  const target = created[0];
  const service = app.container.resolve(showcaseToken),
    native = app.container.resolve(workflowServiceToken);
  const trigger = vi
    .spyOn(native, 'trigger')
    .mockRejectedValue(new Error('Isolated transient workflow failure'));
  try {
    expect(
      (
        await post(`/showcase/deliveryPlans/${target.id}/fire`, {
          transition: 'submit',
          expectVersion: target.lifecycleVersion,
          requestId: 'transient-start',
        })
      ).status,
    ).toBe(500);
  } finally {
    trigger.mockRestore();
  }
  let current = (
    await (await admin.fetch(`/showcase/deliveryPlans/${target.id}`)).json()
  ).data.record;
  expect(current.status).toBe('pending');
  expect(
    (
      await post(`/showcase/deliveryPlans/${target.id}/fire`, {
        transition: 'submit',
        expectVersion: current.lifecycleVersion,
        requestId: 'recover-start',
      })
    ).status,
  ).toBe(200);
  current = (
    await (await admin.fetch(`/showcase/deliveryPlans/${target.id}`)).json()
  ).data.record;
  expect(current.workflowRunId).toBeTruthy();
  const runId = current.workflowRunId;
  // Simulate an interrupted association write in the isolated database. Native event receipt is durable.
  await service.db
    .repository('showcaseDeliveries')
    .updateOne({ filter: { id: target.id }, values: { workflowRunId: null } });
  expect(
    (
      await post(`/showcase/deliveryPlans/${target.id}/fire`, {
        transition: 'submit',
        expectVersion: current.lifecycleVersion,
        requestId: 'recover-association',
      })
    ).status,
  ).toBe(200);
  expect(
    (await (await admin.fetch(`/showcase/deliveryPlans/${target.id}`)).json())
      .data.record.workflowRunId,
  ).toBe(runId);
  for (let i = 0; i < created.length; i += 2) {
    const row = (
      await (
        await admin.fetch(`/showcase/businessLedger/${created[i].id}`)
      ).json()
    ).data;
    expect(
      (
        await post(`/showcase/businessLedger/${created[i].id}/acknowledgment`, {
          amount: row.localAmount,
          quantity: i,
          reference: `receipt-${i}`,
          reason: 'Actual test receipt',
          expectedVersion: row.version,
          requestId: `sort-ack-${i}`,
        })
      ).status,
    ).toBe(200);
  }
  const all = (
    await (await admin.fetch('/showcase/businessLedger?pageSize=100')).json()
  ).data as Record<string, string | number | null>[];
  expect(all.length).toBeGreaterThan(20);
  for (const field of [
    'localQuantity',
    'externalQuantity',
    'quantityDifference',
  ])
    for (const direction of ['asc', 'desc']) {
      const expected = [...all].sort((a, b) => {
        if (a[field] == null)
          return b[field] == null
            ? String(a.id).localeCompare(String(b.id))
            : 1;
        if (b[field] == null) return -1;
        const delta = Number(a[field]) - Number(b[field]);
        return delta
          ? delta * (direction === 'asc' ? 1 : -1)
          : String(a.id).localeCompare(String(b.id));
      });
      const pages = [];
      for (let page = 1; page <= Math.ceil(all.length / 20); page++)
        pages.push(
          ...(
            await (
              await admin.fetch(
                `/showcase/businessLedger?page=${page}&sort=${field}&direction=${direction}`,
              )
            ).json()
          ).data,
        );
      expect(pages.map((r) => r.id)).toEqual(expected.map((r) => r.id));
      expect(new Set(pages.map((r) => r.id)).size).toBe(all.length);
    }
}, 60000);
