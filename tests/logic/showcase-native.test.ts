// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { expect } from 'vitest';
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

test('delivery workflow, ledger versions, signed sync and proposal boundaries', async ({
  testApp,
  app,
  request,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const headers = {
    'Content-Type': 'application/json',
    Origin: 'http://localhost',
  };
  const post = async (path: string, body: unknown) =>
    admin.fetch(path, { method: 'POST', headers, body: JSON.stringify(body) });
  expect((await request('/showcase/deliveryPlans')).status).toBe(401);
  const demo = await post('/operations/demo', {
    password: 'Showcase-Test-Only-294!',
  });
  expect(demo.status).toBe(200);
  const created = await post('/showcase/scenarios', {
    requestId: 'integration-scenario',
  });
  expect(await created.clone().text()).not.toContain('INTERNAL_SERVER_ERROR');
  expect(created.status).toBe(200);
  const rows = (await created.json()) as {
    data: { id: string; lifecycleVersion: number }[];
  };
  expect(rows.data).toHaveLength(2);
  const again = await post('/showcase/scenarios', {
    requestId: 'integration-scenario',
  });
  expect((await again.json()).data.map((r: { id: string }) => r.id)).toEqual(
    rows.data.map((r) => r.id),
  );
  const sync = await post('/showcase/integrations/demo/sync', {
    requestId: 'sync-a',
  });
  expect(sync.status).toBe(200);
  const replay = await post('/showcase/integrations/demo/sync', {
    requestId: 'sync-a',
  });
  expect((await replay.json()).data.replayed).toBe(true);
  const list = await admin.fetch('/showcase/businessLedger');
  expect(list.status).toBe(200);
  const ledger = (await list.json()).data as {
    id: string;
    version: string;
    disposition: string;
  }[];
  expect(ledger.map((r) => r.disposition).sort()).toEqual([
    'disputed',
    'matched',
  ]);
  const resolution = await post(
    `/showcase/businessLedger/${ledger[0]!.id}/resolve`,
    {
      expectedVersion: ledger[0]!.version,
      reason: 'Checked source evidence',
      requestId: 'resolve-a',
    },
  );
  expect(resolution.status).toBe(200);
  const stale = await post(
    `/showcase/businessLedger/${ledger[0]!.id}/resolve`,
    {
      expectedVersion: ledger[0]!.version,
      reason: 'Stale evidence',
      requestId: 'resolve-b',
    },
  );
  expect(stale.status).toBe(409);
  const unsupported = await post('/showcase/assistant/prepare', {
    id: rows.data[0]!.id,
    utterance: '付款并批准所有记录',
  });
  expect(unsupported.status).toBe(400);
  const source = await admin.fetch('/workflows');
  const workflows = (await source.json()).data as {
    key: string;
    hash: string | null;
    id: string | null;
  }[];
  const workflow = workflows.find((w) => w.key === 'delivery-approval');
  expect(workflow).toBeDefined();
  expect(
    (await post(`/workflows/${workflow!.id ?? workflow!.hash}/enable`, {}))
      .status,
  ).toBe(200);
  const submitted = await post(
    `/showcase/deliveryPlans/${rows.data[0]!.id}/fire`,
    {
      transition: 'submit',
      expectVersion: rows.data[0]!.lifecycleVersion,
      requestId: 'submit-a',
    },
  );
  expect(await submitted.clone().text()).not.toContain('INTERNAL_SERVER_ERROR');
  expect(submitted.status).toBe(200);
  const { showcaseToken } =
    await import('../../server/providers/showcase/index.js');
  const service = app.container.resolve(showcaseToken);
  await expect
    .poll(
      async () => {
        const r = await service.db
          .repository('showcaseDeliveries')
          .findOne({ filter: { id: rows.data[0]!.id } });
        return r?.workflowRunId;
      },
      { timeout: 15000 },
    )
    .toBeTruthy();
  await expect
    .poll(
      async () => {
        const r = await service.db
          .repository('showcaseDeliveries')
          .findOne({ filter: { id: rows.data[0]!.id } });
        const wait = await app.container
          .resolve(workflowServiceToken)
          .getInstructionApi('wait')
          .getPending({ runId: String(r?.workflowRunId), nodeKey: 'decision' });
        return wait.status;
      },
      { timeout: 15000 },
    )
    .toBe('pending');
  const self = await post(`/showcase/deliveryPlans/${rows.data[0]!.id}/fire`, {
    transition: 'approve',
    expectVersion: rows.data[0]!.lifecycleVersion + 1,
    requestId: 'self-a',
  });
  expect(self.status).toBe(403);
  const approver = await signIn(testApp, {
    email: 'approver@supply.demo.invalid',
    password: 'Showcase-Test-Only-294!',
  });
  const detail = await approver.fetch(
    `/showcase/deliveryPlans/${rows.data[0]!.id}`,
  );
  const detailData = (await detail.json()).data;
  expect(detailData.history).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ transition: 'submit', to: 'pending' }),
    ]),
  );
  expect(detailData.available).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'approve', allowed: true }),
    ]),
  );
  const approved = await approver.fetch(
    `/showcase/deliveryPlans/${rows.data[0]!.id}/fire`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        transition: 'approve',
        expectVersion: rows.data[0]!.lifecycleVersion + 1,
        requestId: 'approve-a',
      }),
    },
  );
  expect(await approved.clone().text()).not.toContain('INTERNAL_SERVER_ERROR');
  expect(approved.status).toBe(200);
  await expect
    .poll(
      async () => {
        const r = await service.db
          .repository('showcaseDeliveries')
          .findOne({ filter: { id: rows.data[0]!.id } });
        return r?.status;
      },
      { timeout: 15000 },
    )
    .toBe('approved');
  const connectorSecret = randomBytes(32).toString('hex'),
    timestamp = Date.now().toString();
  await expect(
    service.ingest('{}', '1', 'bad', connectorSecret),
  ).rejects.toThrow('STALE_SIGNATURE');
  await expect(
    service.ingest('{}', timestamp, '0'.repeat(64), connectorSecret),
  ).rejects.toThrow('INVALID_SIGNATURE');
  const previousOrg = process.env.SHOWCASE_WEBHOOK_ORGANIZATION;
  process.env.SHOWCASE_WEBHOOK_ORGANIZATION = 'main';
  try {
    const body = JSON.stringify({
      eventId: 'signed-contract',
      organizationId: 'main',
      rows: [{ id: rows.data[0]!.id, amount: 10000, quantity: 30 }],
    });
    const signature = service.sign(body, timestamp, connectorSecret);
    await service.ingest(body, timestamp, signature, connectorSecret);
    expect(
      (await service.ingest(body, timestamp, signature, connectorSecret))
        .replayed,
    ).toBe(true);
    const conflict = body.replace('10000', '10001');
    await expect(
      service.ingest(
        conflict,
        timestamp,
        service.sign(conflict, timestamp, connectorSecret),
        connectorSecret,
      ),
    ).rejects.toThrow('KEY_REUSED');
  } finally {
    if (previousOrg === undefined)
      delete process.env.SHOWCASE_WEBHOOK_ORGANIZATION;
    else process.env.SHOWCASE_WEBHOOK_ORGANIZATION = previousOrg;
  }
  const read = async (id: string) =>
    (await (await admin.fetch(`/showcase/deliveryPlans/${id}`)).json()).data
      .record as { id: string; status: string; lifecycleVersion: number };
  let completed = await read(rows.data[0]!.id);
  for (const transition of ['ship', 'receive']) {
    expect(
      (
        await post(`/showcase/deliveryPlans/${completed.id}/fire`, {
          transition,
          expectVersion: completed.lifecycleVersion,
          requestId: `complete-${transition}`,
        })
      ).status,
    ).toBe(200);
    completed = await read(completed.id);
  }
  expect(completed.status).toBe('completed');
  expect(
    (
      await post(`/showcase/deliveryPlans/${completed.id}/fire`, {
        transition: 'approve',
        expectVersion: completed.lifecycleVersion,
        requestId: 'illegal-final',
      })
    ).status,
  ).toBe(403);
  const reader = await signIn(testApp, {
    email: 'reader@supply.demo.invalid',
    password: 'Showcase-Test-Only-294!',
  });
  expect(
    (
      await reader.fetch(`/showcase/deliveryPlans/${completed.id}/fire`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          transition: 'ship',
          expectVersion: completed.lifecycleVersion,
          requestId: 'forbidden',
        }),
      })
    ).status,
  ).toBe(403);
  const supplier = await signIn(testApp, {
    email: 'supplier@supply.demo.invalid',
    password: 'Showcase-Test-Only-294!',
  });
  const supplierList = (
    await (await supplier.fetch('/showcase/deliveryPlans')).json()
  ).data as { id: string }[];
  const hidden = rows.data.find(
    (r) => !supplierList.some((s) => s.id === r.id),
  );
  if (hidden)
    expect(
      (await supplier.fetch(`/showcase/deliveryPlans/${hidden.id}`)).status,
    ).toBe(404);
  const orderList = (await (await admin.fetch('/operations/orders')).json())
    .data as { id: string; supplierId: string }[];
  const materials = (await (await admin.fetch('/operations/materials')).json())
    .data as { id: string }[];
  const smallOrder = await post('/operations/orders', {
    name: 'Low risk demo order',
    requestId: 'small-order',
    supplierId: orderList[0]!.supplierId,
    businessDate: '2026-10-11',
    notes: 'Test only',
    payload: {
      lines: [
        {
          id: 'small-line',
          materialId: materials[0]!.id,
          quantity: 1,
          price: 20,
          taxRate: 13,
        },
      ],
    },
  });
  expect(smallOrder.status).toBe(200);
  const smallId = (await smallOrder.json()).data.id as string;
  const small = await post('/showcase/deliveryPlans', {
    name: 'Automatic workflow test',
    orderId: smallId,
    businessDate: '2026-10-11',
    region: 'AU',
    notes: '',
    lines: [
      {
        sku: '24124.05TP.V2',
        name: '猫砂盆',
        fnsku: '1',
        allocation: 30,
        unitsPerBox: 6,
      },
    ],
    labelCount: 40,
    requestId: 'small',
  });
  expect(small.status).toBe(200);
  let automatic = (await small.json()).data as {
    id: string;
    lifecycleVersion: number;
  };
  const policy = await admin.fetch(
    `/showcase/deliveryPlans/${automatic.id}/policy`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        enabled: true,
        expectVersion: automatic.lifecycleVersion,
      }),
    },
  );
  expect(policy.status).toBe(200);
  automatic = (await policy.json()).data;
  expect(
    (
      await post(`/showcase/deliveryPlans/${automatic.id}/fire`, {
        transition: 'submit',
        expectVersion: automatic.lifecycleVersion,
        requestId: 'auto-submit',
      })
    ).status,
  ).toBe(200);
  await expect
    .poll(async () => (await read(automatic.id)).status, { timeout: 15000 })
    .toBe('approved');
  const proposal = await post('/showcase/assistant/prepare', {
    id: automatic.id,
    utterance: '打印交货计划',
  });
  expect(proposal.status).toBe(200);
  const p = (await proposal.json()).data;
  expect(
    (
      await post('/showcase/assistant/commit', {
        proposalId: p.id,
        requestId: 'commit-print',
      })
    ).status,
  ).toBe(200);
  const pdf = await admin.fetch(`/showcase/deliveryPlans/${automatic.id}/pdf`);
  expect(pdf.status).toBe(200);
  expect(pdf.headers.get('cache-control')).toBe('private, no-store');
  expect((await pdf.arrayBuffer()).byteLength).toBeGreaterThan(1000);
}, 60000);
