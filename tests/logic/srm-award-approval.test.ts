// @vitest-environment node
import { randomBytes, randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication';
import { userRoleScopeRegistryToken } from '@nocobase/app-plugin-users/server/tokens';
import { createStandaloneServer } from '../../server/standalone.js';
import { loadOperationsFixture } from '../helpers/operations-fixture.js';
import { coreToken } from '../../server/srm-core/provider.js';
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
test('native two-stage award: distinct actors, task replay, stale refusal, allocation rollback, return and final PO', async ({
  testApp,
  app,
}) => {
  const password = 'Award-Approval-Isolated-294!';
  await loadOperationsFixture(app, password);
  const service = app.container.resolve(coreToken),
    users = app.container.resolve(userAdministrationServiceToken),
    scope = app.container.resolve(userRoleScopeRegistryToken).get('app')!;
  const reviewer = (await users.list({ pageSize: 100 })).items.find(
    (u) => u.email === 'approver@supply.demo.invalid',
  )!;
  const second = await users.create({
    name: 'Department reviewer',
    email: 'department@award.demo.invalid',
    password,
  });
  await scope.replace(
    second.id,
    ['operations-approver'],
    service.db.connection(),
  );
  await service.db.repository('opsMemberships').createOne({
    values: {
      id: randomUUID(),
      userId: second.id,
      organizationId: 'main',
      supplierId: null,
      enabled: true,
      version: 1,
    },
  });
  const actors = {
    admin: await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS),
    buyer: await signIn(testApp, {
      email: 'buyer@supply.demo.invalid',
      password,
    }),
    first: await signIn(testApp, { email: reviewer.email, password }),
    second: await signIn(testApp, { email: second.email, password }),
    supplier: await signIn(testApp, {
      email: 'supplier@supply.demo.invalid',
      password,
    }),
  };
  async function call(role: keyof typeof actors, path: string, body?: object) {
    const r = await actors[role].fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: r.status, data: (await r.json()).data };
  }
  async function ok(role: keyof typeof actors, path: string, body?: object) {
    const r = await call(role, path, body);
    expect(r.status).toBe(200);
    return r.data;
  }
  expect((await call('buyer', '/srmCore/award/settings')).status).toBe(403);
  const configuration = {
    enabled: true,
    purchasing: reviewer.id,
    department: second.id,
    version: 0,
    requestKey: randomUUID(),
  };
  await ok('admin', '/srmCore/award/settings', configuration);
  const again = await ok('admin', '/srmCore/award/settings', configuration);
  expect(again.version).toBe(1);
  expect(
    (
      await call('admin', '/srmCore/award/settings', {
        ...configuration,
        department: reviewer.id,
        version: 1,
        requestKey: randomUUID(),
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await call('admin', '/srmCore/award/settings', {
        ...configuration,
        version: 0,
        requestKey: randomUUID(),
      })
    ).status,
  ).toBe(409);
  const lookup = await ok('buyer', '/srmCore/lookups/rfq'),
    supplierId = (await ok('supplier', '/srmCore/capabilities')).supplierId,
    materialId = lookup.materials[0].id;
  let rfq = await ok('buyer', '/srmCore/rfq', {
    name: 'Native award',
    deadline: '2099-12-01',
    data: {
      supplierIds: [supplierId],
      lines: [{ id: 'line', materialId, quantity: 10 }],
    },
    requestKey: randomUUID(),
  });
  async function action(
    role: keyof typeof actors,
    row: any,
    name: string,
    extra: object = {},
  ) {
    return ok(role, `/srmCore/${row.kind}/${row.id}/actions/${name}`, {
      version: row.lifecycleVersion,
      requestKey: randomUUID(),
      ...extra,
    });
  }
  rfq = await action('buyer', rfq, 'open');
  let quote = await ok('supplier', '/srmCore/quote', {
    name: 'Valid quote',
    sourceId: rfq.id,
    supplierId,
    data: {
      sourceVersion: rfq.data.publishedVersion,
      validUntil: '2099-12-20',
      deliveryDate: '2099-12-10',
      lines: [
        {
          id: 'line',
          materialId,
          quantity: 10,
          price: 10000,
          taxRateBps: 1300,
        },
      ],
    },
    requestKey: randomUUID(),
  });
  quote = await action('supplier', quote, 'submit');
  rfq = await action('buyer', rfq, 'nominate', {
    selectedQuoteId: quote.id,
    reason: 'Quotation reviewed',
  });
  expect(rfq.status).toBe('purchasingReview');
  await expect
    .poll(
      async () =>
        (await ok('first', '/notificationInApp/messages')).filter(
          (m: any) => m.target?.path === `/supply/srm/rfqs/${rfq.id}`,
        ).length,
      { timeout: 5000 },
    )
    .toBe(1);
  expect((await call('supplier', `/srmCore/award/${rfq.id}`)).status).toBe(403);
  expect(
    (
      await call('first', `/srmCore/rfq/${rfq.id}/actions/approve`, {
        version: rfq.lifecycleVersion,
        requestKey: randomUUID(),
      })
    ).status,
  ).not.toBe(200);
  await expect(
    service.runtime.fire('srmCoreRecords', rfq.id, 'purchasingApproved', {
      actor: { id: reviewer.id },
    }),
  ).rejects.toThrow();
  const firstView = await ok('first', `/srmCore/award/${rfq.id}`),
    firstRun =
      firstView.runs.find(
        (r: any) =>
          r.run.status === 'open' || r.run.stage === 'purchasingReview',
      ) ?? firstView.runs[0];
  const firstTask = firstView.actions.find((a: any) =>
    a.actions.some((o: any) => o.name === 'approve'),
  ).task;
  const decision = {
    taskId: firstTask.id,
    action: 'approve',
    contentHash: firstRun.run.contentHash,
    comment: 'Purchase manager approved',
    requestId: randomUUID(),
  };
  expect(
    (
      await call('first', `/srmCore/award/${rfq.id}`, {
        ...decision,
        contentHash: 'stale',
      })
    ).status,
  ).not.toBe(200);
  expect(
    (await call('second', `/srmCore/award/${rfq.id}`, decision)).status,
  ).not.toBe(200);
  // Failed next-stage allocation must roll back both first vote and business state.
  await users.disable(second.id);
  expect(
    (await call('first', `/srmCore/award/${rfq.id}`, decision)).status,
  ).not.toBe(200);
  expect((await ok('buyer', `/srmCore/rfq/${rfq.id}`)).record.status).toBe(
    'purchasingReview',
  );
  await users.enable(second.id);
  actors.second = await signIn(testApp, { email: second.email, password });
  const approved = await ok('first', `/srmCore/award/${rfq.id}`, decision);
  expect(approved.record.status).toBe('departmentReview');
  await ok('first', `/srmCore/award/${rfq.id}`, decision);
  expect(
    await service.db
      .repository('opsOrders')
      .findOne({ filter: { id: rfq.id } }),
  ).toBeUndefined();
  const secondView = await ok('second', `/srmCore/award/${rfq.id}`),
    secondTask = secondView.actions.find((a: any) =>
      a.actions.some((o: any) => o.name === 'return'),
    ).task,
    secondRun = secondView.runs.find((r: any) => r.run.id === secondTask.runId);
  const returned = await ok('second', `/srmCore/award/${rfq.id}`, {
    taskId: secondTask.id,
    action: 'return',
    contentHash: secondRun.run.contentHash,
    comment: 'Review delivery terms again',
    requestId: randomUUID(),
  });
  expect(returned.record.status).toBe('open');
  rfq = await action('buyer', returned.record, 'nominate', {
    selectedQuoteId: quote.id,
    reason: 'Terms checked and resubmitted',
  });
  const reopened = await ok('first', `/srmCore/award/${rfq.id}`),
    freshTask = reopened.actions.find((a: any) =>
      a.actions.some((o: any) => o.name === 'approve'),
    ).task;
  expect(freshTask.id).not.toBe(firstTask.id);
  expect(
    (
      await call('first', `/srmCore/award/${rfq.id}`, {
        ...decision,
        requestId: randomUUID(),
      })
    ).status,
  ).not.toBe(200);
  const freshRun = reopened.runs.find((r: any) => r.run.id === freshTask.runId);
  await ok('first', `/srmCore/award/${rfq.id}`, {
    taskId: freshTask.id,
    action: 'approve',
    contentHash: freshRun.run.contentHash,
    comment: 'Re-reviewed',
    requestId: randomUUID(),
  });
  const finalView = await ok('second', `/srmCore/award/${rfq.id}`),
    finalTask = finalView.actions.find((a: any) =>
      a.actions.some((o: any) => o.name === 'approve'),
    ).task,
    finalRun = finalView.runs.find((r: any) => r.run.id === finalTask.runId),
    finalDecision = {
      taskId: finalTask.id,
      action: 'approve',
      contentHash: finalRun.run.contentHash,
      comment: 'Department approved',
      requestId: randomUUID(),
    };
  const final = await ok('second', `/srmCore/award/${rfq.id}`, finalDecision);
  expect(final.record.status).toBe('awarded');
  await ok('second', `/srmCore/award/${rfq.id}`, finalDecision);
  expect(
    await service.db.repository('opsOrders').count({ filter: { id: rfq.id } }),
  ).toBe(1);
  async function nominated(label: string) {
    let row = await ok('buyer', '/srmCore/rfq', {
      name: label,
      deadline: '2099-12-01',
      data: {
        supplierIds: [supplierId],
        lines: [{ id: 'line', materialId, quantity: 10 }],
      },
      requestKey: randomUUID(),
    });
    row = await action('buyer', row, 'open');
    let q = await ok('supplier', '/srmCore/quote', {
      name: label + ' quote',
      sourceId: row.id,
      supplierId,
      data: {
        sourceVersion: row.data.publishedVersion,
        validUntil: '2099-12-20',
        deliveryDate: '2099-12-10',
        lines: [
          {
            id: 'line',
            materialId,
            quantity: 10,
            price: 10000,
            taxRateBps: 1300,
          },
        ],
      },
      requestKey: randomUUID(),
    });
    q = await action('supplier', q, 'submit');
    return action('buyer', row, 'nominate', {
      selectedQuoteId: q.id,
      reason: 'Two-stage case',
    });
  }
  async function offered(role: 'first' | 'second', row: any, name: string) {
    const view = await ok(role, `/srmCore/award/${row.id}`),
      offer = view.actions.find((a: any) =>
        a.actions.some((o: any) => o.name === name),
      ),
      run = view.runs.find((r: any) => r.run.id === offer.task.runId);
    return {
      taskId: offer.task.id,
      action: name,
      contentHash: run.run.contentHash,
      comment: 'Reviewed isolated test case',
      requestId: randomUUID(),
    };
  }
  const rejected = await nominated('Rejected award'),
    denied = await ok(
      'first',
      `/srmCore/award/${rejected.id}`,
      await offered('first', rejected, 'reject'),
    );
  expect(denied.record.status).toBe('rejected');
  expect(
    await service.db
      .repository('opsOrders')
      .count({ filter: { id: rejected.id } }),
  ).toBe(0);
  const racing = await nominated('Final approval versus withdrawal');
  const stageTwo = (
    await ok(
      'first',
      `/srmCore/award/${racing.id}`,
      await offered('first', racing, 'approve'),
    )
  ).record;
  const outcomes = await Promise.all([
    call(
      'second',
      `/srmCore/award/${racing.id}`,
      await offered('second', stageTwo, 'approve'),
    ),
    call('buyer', `/srmCore/rfq/${racing.id}/actions/cancel`, {
      version: stageTwo.lifecycleVersion,
      reason: 'Applicant withdraws',
      requestKey: randomUUID(),
    }),
  ]);
  expect(outcomes.filter((result) => result.status === 200)).toHaveLength(1);
  const settled = (await ok('buyer', `/srmCore/rfq/${racing.id}`)).record;
  expect(['awarded', 'cancelled']).toContain(settled.status);
  expect(
    await service.db
      .repository('opsOrders')
      .count({ filter: { id: racing.id } }),
  ).toBe(settled.status === 'awarded' ? 1 : 0);
});
