// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { createAppTest } from '@nocobase/app-testing/server';
import { DEFAULT_ADMIN_CREDENTIALS } from '@nocobase/app-plugin-authentication/testing';
import { expect } from 'vitest';
import { createStandaloneServer } from '../../server/standalone.js';
import { runCustomerDemo } from '../../cli/commands/lib/customer-demo.js';
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
test('customer flow uses scoped identities, real workflow/receipt/ledger APIs and converges on rerun', async ({
  app,
}) => {
  const result = await runCustomerDemo(app);
  expect(result.delivery).toBe('completed');
  expect(result.receipt).toBe('posted');
  expect(result.stock).toBe(10);
  expect(result.ledger).toEqual({
    status: 'matched',
    localQuantity: 10,
    externalQuantity: 10,
    quantityDifference: 0,
  });
  expect(result.steps).toContain('customer-demo:ack-eight');
  expect(result.steps).toContain('customer-demo:ack-ten');
  expect(result.accounts.map((a) => a.role)).not.toContain('admin');
  expect(JSON.stringify(result)).not.toContain('password');
  const repeated = await runCustomerDemo(app);
  expect(repeated.changed).toBe(false);
  expect(repeated.records).toEqual(result.records);
  expect(repeated.steps).toEqual(result.steps);
}, 60000);
