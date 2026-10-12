// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { expect } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { createStandaloneServer } from '../../server/standalone.js';
import { loadOperationsFixture } from '../helpers/operations-fixture.js';
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
const headers = {
  'Content-Type': 'application/json',
  Origin: 'http://localhost',
};
test('native users and business membership remain separate, versioned and supplier scoped', async ({
  testApp,
  app,
  request,
}) => {
  await loadOperationsFixture(app);
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS),
    post = (path: string, body: unknown, method = 'POST') =>
      admin.fetch(path, { method, headers, body: JSON.stringify(body) });
  expect((await request('/srm/users/unknown')).status).toBe(401);
  const created = await post('/users', {
    name: 'Supplier operator',
    email: 'supplier-operator@srm.test.invalid',
    password: 'Isolated-Test-Only-294!',
    roleScopes: { app: ['operations-supplier'] },
  });
  expect(created.status).toBe(201);
  const user = (await created.json()).data;
  const detail = await admin.fetch(`/srm/users/${user.id}`);
  expect(detail.status).toBe(200);
  const safe = (await detail.json()).data;
  expect(safe).not.toHaveProperty('password');
  expect(safe).not.toHaveProperty('key');
  expect(safe.roleScopes.app).toContain('operations-supplier');
  const supplier = await signIn(testApp, {
    email: user.email,
    password: 'Isolated-Test-Only-294!',
  });
  expect((await supplier.fetch('/operations/orders')).status).toBe(403);
  expect(
    (await supplier.fetch(`/srm/users/${user.id}/business-profile`)).status,
  ).toBe(403);
  const options = await admin.fetch('/srm/suppliers');
  expect(options.status).toBe(200);
  const chosen = (await options.json()).data[0];
  const input = {
    organizationId: 'main',
    supplierId: chosen.id,
    enabled: true,
    expectedVersion: 0,
    requestId: 'membership-1',
  };
  expect(
    (await post(`/srm/users/${user.id}/business-profile`, input, 'PUT')).status,
  ).toBe(200);
  expect(
    (await post(`/srm/users/${user.id}/business-profile`, input, 'PUT')).status,
  ).toBe(200);
  expect(
    (
      await post(
        `/srm/users/${user.id}/business-profile`,
        { ...input, enabled: false },
        'PUT',
      )
    ).status,
  ).toBe(409);
  const orders = await supplier.fetch('/operations/orders');
  expect(orders.status).toBe(200);
  expect(
    (await orders.json()).data.every(
      (o: { supplierId: string }) => o.supplierId === chosen.id,
    ),
  ).toBe(true);
  const profile = (
    await (await admin.fetch(`/srm/users/${user.id}/business-profile`)).json()
  ).data;
  expect(
    (
      await post(
        `/srm/users/${user.id}/business-profile`,
        {
          ...input,
          enabled: false,
          expectedVersion: profile.version,
          requestId: 'membership-disable',
        },
        'PUT',
      )
    ).status,
  ).toBe(200);
  expect((await supplier.fetch('/operations/orders')).status).toBe(403);
}, 60000);
test('native API keys authenticate their owner and reject revoked keys or disabled owners', async ({
  testApp,
  app,
  request,
}) => {
  await loadOperationsFixture(app);
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS),
    owner = await signIn(testApp, {
      email: 'reader@supply.demo.invalid',
      password: 'Operations-Test-Only-294!',
    });
  const create = async (name: string) => {
    const response = await owner.fetch('/auth/api-key/create', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name, expiresIn: 86400 }),
    });
    expect(response.status).toBe(200);
    return (await response.json()) as { id: string; key: string };
  };
  const key = await create('Isolated API check');
  expect(
    (
      await request('/showcase/deliveryPlans', {
        headers: { 'x-api-key': key.key },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await admin.fetch('/auth/api-key/update', {
        method: 'POST',
        headers,
        body: JSON.stringify({ keyId: key.id, enabled: false }),
      })
    ).status,
  ).toBe(404); // Another owner cannot change this key.
  const removed = await owner.fetch('/auth/api-key/delete', {
    method: 'POST',
    headers,
    body: JSON.stringify({ keyId: key.id }),
  });
  expect(removed.status).toBe(200);
  expect(
    (
      await request('/showcase/deliveryPlans', {
        headers: { 'x-api-key': key.key },
      })
    ).status,
  ).toBe(401);
  const second = await create('Isolated disabled owner');
  const list = (
    await (await admin.fetch('/users?q=reader%40supply.demo.invalid')).json()
  ).data;
  const reader = list.find(
    (u: { email: string }) => u.email === 'reader@supply.demo.invalid',
  );
  expect(
    (
      await admin.fetch(`/users/${reader.id}/disable`, {
        method: 'POST',
        headers,
        body: '{}',
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await request('/showcase/deliveryPlans', {
        headers: { 'x-api-key': second.key },
      })
    ).status,
  ).toBe(401);
}, 60000);
