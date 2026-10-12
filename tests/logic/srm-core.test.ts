import { coreToken } from '../../server/srm-core/provider.js';
// @vitest-environment node
import { randomBytes, randomUUID } from 'node:crypto';
import { expect, vi } from 'vitest';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { createStandaloneServer } from '../../server/standalone.js';
import { loadOperationsFixture } from '../helpers/operations-fixture.js';
import type { CoreView } from '../../shared/srm-core.js';
import type { Doc } from '../../shared/operations.js';
const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    secrets: {
      keys: [{ version: 1, key: randomBytes(32).toString('base64') }],
    },
    users: { initialAdmin: DEFAULT_ADMIN_CREDENTIALS },
  },
});
test('candidate admission, invited quotes, independent award, inspection and rejected return preserve stock and versions', async ({
  testApp,
  app,
  request,
}) => {
  expect((await request('/srmCore/rfq')).status).toBe(401);
  await loadOperationsFixture(app, 'Srm-Core-Isolated-Only-294!');
  const users = Object.fromEntries(
    await Promise.all(
      ['buyer', 'approver', 'warehouse', 'supplier'].map(async (role) => [
        role,
        await signIn(testApp, {
          email: `${role}@supply.demo.invalid`,
          password: 'Srm-Core-Isolated-Only-294!',
        }),
      ]),
    ),
  );
  const headers = {
    'Content-Type': 'application/json',
    Origin: 'http://localhost',
  };
  async function call(role: string, path: string, body?: object) {
    const response = await users[role]!.fetch(path, {
      method: body ? 'POST' : 'GET',
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: response.status,
      body: (await response.json()) as { data: any; error?: unknown },
    };
  }
  async function post(role: string, path: string, body: object) {
    const r = await call(role, path, body);
    expect(r.status).toBe(200);
    return r.body.data;
  }
  for (const sort of ['updatedAt', 'name', 'number', 'deadline']) {
    const listed = await call(
      'buyer',
      `/srmCore/rfq?sort=${sort}&direction=asc&page=1`,
    );
    expect(listed.status).toBe(200);
    expect(listed.body.data).toEqual([]);
  }
  const awaitOwn = (await call('supplier', '/srmCore/capabilities')).body.data
    .supplierId;
  const lookup = (await call('buyer', '/srmCore/lookups/rfq')).body.data;
  const supplier = lookup.suppliers.find((s: Doc) => s.id === awaitOwn) as Doc,
    material = lookup.materials[0] as Doc;
  const candidate = (await post('buyer', '/operations/suppliers', {
    name: 'Core candidate',
    businessDate: '2026-10-12',
    payload: { contact: 'Applicant', terms: 30 },
    requestId: randomUUID(),
  })) as Doc;
  expect(candidate.status).toBe('candidate');
  expect(
    (
      await call('buyer', '/operations/orders', {
        name: 'Denied order',
        supplierId: candidate.id,
        businessDate: '2026-10-12',
        payload: {
          lines: [
            {
              id: 'line',
              materialId: material.id,
              quantity: 10,
              price: 100,
              taxRate: 13,
            },
          ],
        },
        requestId: randomUUID(),
      })
    ).status,
  ).toBe(409);
  const admission = (await post('buyer', '/srmCore/admission', {
    name: 'Candidate admission',
    sourceId: candidate.id,
    deadline: '',
    supplierId: null,
    data: {
      qualification: 'Registered manufacturer',
      evidence: 'Business registration and quality certificate',
      validUntil: '2099-12-31',
    },
    requestKey: randomUUID(),
  })) as CoreView;
  async function action(
    role: string,
    r: CoreView,
    name: string,
    extra: object = {},
  ) {
    return post(role, `/srmCore/${r.kind}/${r.id}/actions/${name}`, {
      version: r.lifecycleVersion,
      requestKey: randomUUID(),
      ...extra,
    }) as Promise<CoreView>;
  }
  const pending = await action('buyer', admission, 'submit');
  expect(
    (
      await call('buyer', `/srmCore/admission/${pending.id}/actions/approve`, {
        version: pending.lifecycleVersion,
        requestKey: randomUUID(),
      })
    ).status,
  ).toBe(403);
  await action('approver', pending, 'approve');
  expect(
    (await call('buyer', `/operations/suppliers/${candidate.id}`)).body.data
      .status,
  ).toBe('active');
  const rfq = (await post('buyer', '/srmCore/rfq', {
    name: 'Core RFQ',
    sourceId: '',
    supplierId: null,
    deadline: '2099-12-01',
    data: {
      supplierIds: [supplier.id],
      lines: [{ id: 'rfq-line', materialId: material.id, quantity: 10 }],
    },
    requestKey: randomUUID(),
  })) as CoreView;
  const opened = await action('buyer', rfq, 'open');
  const sourceLook = (await call('supplier', '/srmCore/lookups/quote')).body
    .data;
  expect(sourceLook.rfqs.some((r: CoreView) => r.id === opened.id)).toBe(true);
  const quote = (await post('supplier', '/srmCore/quote', {
    name: 'Supplier quotation',
    sourceId: opened.id,
    supplierId: supplier.id,
    deadline: '',
    data: {
      sourceVersion: opened.lifecycleVersion,
      lines: [
        {
          id: 'rfq-line',
          materialId: material.id,
          quantity: 10,
          price: 10000,
          taxRateBps: 1300,
        },
      ],
      deliveryDate: '2099-12-10',
      validUntil: '2099-12-20',
    },
    requestKey: randomUUID(),
  })) as CoreView;
  const submitted = await action('supplier', quote, 'submit');
  const gateway = app.container.resolve(agentsToken).online.gateway;
  const catalog = vi.spyOn(gateway, 'catalog').mockResolvedValue({
    services: [],
    defaultModel: { modelService: 'isolated', model: 'test-double' },
  });
  const suggestion = {
    summary: 'Compare submitted supplier quote',
    reason: 'Price, delivery and qualification meet requirement',
    findings: [
      {
        evidence: submitted.number,
        observation: '10000 cents per unit, 13% tax',
      },
    ],
    uncertainties: [],
    selectedQuoteId: submitted.id,
    lines: [],
  };
  const generate = vi
    .spyOn(gateway, 'generate')
    .mockResolvedValue({ text: JSON.stringify(suggestion) });
  const aiInput = {
    purpose: 'quoteDecision',
    kind: 'rfq',
    id: opened.id,
    version: opened.lifecycleVersion,
    text: 'Compare with evidence; never approve',
    requestKey: randomUUID(),
  };
  expect((await call('supplier', '/srmCore/ai/analyze', aiInput)).status).toBe(
    403,
  );
  let proposal = await post('buyer', '/srmCore/ai/analyze', aiInput);
  expect(proposal.canApply).toBe(true);
  expect(proposal.status).toBe('pending');
  expect((await post('buyer', '/srmCore/ai/analyze', aiInput)).id).toBe(
    proposal.id,
  );
  expect(generate).toHaveBeenCalledTimes(1);
  expect(
    (
      await call('buyer', '/srmCore/ai/analyze', {
        ...aiInput,
        text: 'changed input',
      })
    ).status,
  ).toBe(409);
  const staleProposal = await post('buyer', '/srmCore/ai/analyze', {
    ...aiInput,
    requestKey: randomUUID(),
  });
  const withdrawn = await action('supplier', submitted, 'withdraw');
  expect(
    (
      await call(
        'buyer',
        `/srmCore/ai/quoteDecision/proposals/${staleProposal.id}/confirm`,
        {},
      )
    ).status,
  ).toBe(409);
  await action('supplier', withdrawn, 'submit');
  proposal = await post('buyer', '/srmCore/ai/analyze', {
    ...aiInput,
    requestKey: randomUUID(),
  });
  const aiPath = `/srmCore/ai/quoteDecision/proposals/${proposal.id}/confirm`;
  expect((await call('approver', aiPath, {})).status).toBe(403);
  const core = app.container.resolve(coreToken),
    originalAction = core.action.bind(core);
  const actionFailure = vi
    .spyOn(core, 'action')
    .mockImplementationOnce(async (...args) => {
      await originalAction(...args);
      throw new Error('Isolated post-write failure to prove rollback');
    });
  expect((await call('buyer', aiPath, {})).status).toBe(500);
  actionFailure.mockRestore();
  expect(
    (await call('buyer', `/srmCore/rfq/${opened.id}`)).body.data.record.status,
  ).toBe('open');
  const applied = await post('buyer', aiPath, {});
  expect(applied.status).toBe('applied');
  expect((await post('buyer', aiPath, {})).result.id).toBe(applied.result.id);
  const nominated = (await call('buyer', `/srmCore/rfq/${opened.id}`)).body.data
    .record as CoreView;
  expect(nominated.status).toBe('pending'); // AI cannot independently approve.
  generate.mockRestore();
  catalog.mockRestore();
  const approved = await action('approver', nominated, 'approve');
  expect(approved.status).toBe('awarded');
  expect(approved.data.orderId).toBe(approved.id);
  let order = (
    await call('buyer', `/operations/orders/${approved.data.orderId}`)
  ).body.data as Doc;
  async function op(role: string, r: Doc, kind: string, name: string) {
    return post(role, `/operations/${kind}/${r.id}/actions/${name}`, {
      version: r.version,
      requestId: randomUUID(),
    }) as Promise<Doc>;
  }
  order = await op('buyer', order, 'orders', 'submit');
  order = await op('approver', order, 'orders', 'approve');
  order = await op('supplier', order, 'orders', 'confirm');
  const warehouses = (await call('warehouse', '/operations/warehouses')).body
    .data as Doc[];
  const receipt = (await post('warehouse', '/operations/receipts', {
    name: 'Core receipt',
    businessDate: '2026-10-12',
    supplierId: supplier.id,
    payload: {
      orderId: order.id,
      warehouseId: warehouses[0]!.id,
      lines: [
        {
          id: 'receipt-line',
          sourceLineId: 'rfq-line',
          materialId: material.id,
          quantity: 10,
          price: 100,
          taxRate: 13,
          accepted: 10,
          rejected: 0,
        },
      ],
    },
    requestId: randomUUID(),
  })) as Doc;
  expect(
    (
      await call(
        'warehouse',
        `/operations/receipts/${receipt.id}/actions/post`,
        { version: receipt.version, requestId: randomUUID() },
      )
    ).status,
  ).toBe(409);
  const inspect = (await post('warehouse', '/srmCore/inspection', {
    name: 'Receipt quality',
    sourceId: receipt.id,
    supplierId: null,
    deadline: '',
    data: {
      sourceVersion: receipt.version,
      criteria: 'Dimensional check',
      evidence: 'Inspection results: six accepted, four rejected',
      lines: [
        {
          id: 'receipt-line',
          materialId: material.id,
          quantity: 10,
          accepted: 6,
          rejected: 4,
        },
      ],
    },
    requestKey: randomUUID(),
  })) as CoreView;
  const checked = await action(
    'approver',
    await action('warehouse', inspect, 'submit'),
    'approve',
  );
  const inspected = (
    await call('warehouse', `/operations/receipts/${receipt.id}`)
  ).body.data as Doc;
  await op('warehouse', inspected, 'receipts', 'post');
  expect(
    (await call('buyer', `/operations/orders/${order.id}`)).body.data.status,
  ).toBe('partial');
  const ret = (await post('warehouse', '/srmCore/return', {
    name: 'Rejected return',
    sourceId: checked.id,
    supplierId: null,
    deadline: '',
    data: {
      sourceVersion: checked.lifecycleVersion,
      reason: 'Four fail dimensional specification',
      lines: [{ id: 'receipt-line', materialId: material.id, quantity: 4 }],
    },
    requestKey: randomUUID(),
  })) as CoreView;
  const duplicate = (await post('warehouse', '/srmCore/return', {
    name: 'Duplicate reservation',
    sourceId: checked.id,
    supplierId: null,
    deadline: '',
    data: {
      sourceVersion: checked.lifecycleVersion,
      reason: 'Another requested return',
      lines: [{ id: 'receipt-line', materialId: material.id, quantity: 4 }],
    },
    requestKey: randomUUID(),
  })) as CoreView;
  const duplicatePending = await action('warehouse', duplicate, 'submit');
  const reserved = await action(
    'approver',
    await action('warehouse', ret, 'submit'),
    'approve',
  );
  const refused = await call(
    'approver',
    `/srmCore/return/${duplicatePending.id}/actions/approve`,
    { version: duplicatePending.lifecycleVersion, requestKey: randomUUID() },
  );
  expect(refused.status).toBe(400);
  expect(refused.body.error).toMatchObject({
    reason: 'RETURN_EXCEEDS_REJECTED',
  });
  const shipped = await action('warehouse', reserved, 'ship', {
    tracking: 'RETURN-TEST-1',
  });
  expect((await action('supplier', shipped, 'confirm')).status).toBe(
    'completed',
  );
  const qualityBalance = (
    await call('warehouse', `/srmCore/inspection/${checked.id}`)
  ).body.data.returnBalances;
  expect(qualityBalance['receipt-line']).toEqual({ reserved: 4, available: 0 });
  const remaining = (
    await call('warehouse', '/operations/lookups/receipts')
  ).body.data.orders.find((o: Doc) => o.id === order.id) as Doc;
  expect(remaining.payload.lines![0]!.quantity).toBe(4);
  const replacement = (await post('warehouse', '/operations/receipts', {
    name: 'Replacement receipt',
    businessDate: '2026-10-12',
    supplierId: supplier.id,
    payload: {
      orderId: order.id,
      warehouseId: warehouses[0]!.id,
      lines: [
        {
          id: 'replacement-line',
          sourceLineId: 'rfq-line',
          materialId: material.id,
          quantity: 4,
          price: 100,
          taxRate: 13,
          accepted: 4,
          rejected: 0,
        },
      ],
    },
    requestId: randomUUID(),
  })) as Doc;
  const check2 = (await post('warehouse', '/srmCore/inspection', {
    name: 'Replacement inspection',
    sourceId: replacement.id,
    supplierId: null,
    deadline: '',
    data: {
      sourceVersion: replacement.version,
      criteria: 'Replacement dimensional check',
      evidence: 'All four conform',
      lines: [
        {
          id: 'replacement-line',
          materialId: material.id,
          quantity: 4,
          accepted: 4,
          rejected: 0,
        },
      ],
    },
    requestKey: randomUUID(),
  })) as CoreView;
  await action(
    'approver',
    await action('warehouse', check2, 'submit'),
    'approve',
  );
  const latestReplacement = (
    await call('warehouse', `/operations/receipts/${replacement.id}`)
  ).body.data as Doc;
  const key = randomUUID(),
    body = { version: latestReplacement.version, requestId: key };
  const posted = await post(
    'warehouse',
    `/operations/receipts/${replacement.id}/actions/post`,
    body,
  );
  expect(
    (
      await post(
        'warehouse',
        `/operations/receipts/${replacement.id}/actions/post`,
        body,
      )
    ).id,
  ).toBe(posted.id);
  expect(
    (await call('buyer', `/operations/orders/${order.id}`)).body.data.status,
  ).toBe('received');
  expect(
    (await call('supplier', `/srmCore/admission/${admission.id}`)).status,
  ).toBe(403);
  expect((await call('warehouse', '/srmCore/workbench')).status).toBe(200);
  const completedQuote = (await call('supplier', `/srmCore/quote/${quote.id}`))
    .body.data;
  expect(completedQuote.available).not.toContain('withdraw');
}, 90000);
