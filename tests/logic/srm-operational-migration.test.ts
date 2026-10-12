// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { expect } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import { databaseManagerToken } from '@nocobase/db';
import { DEFAULT_ADMIN_CREDENTIALS } from '@nocobase/app-plugin-authentication/testing';
import { createStandaloneServer } from '../../server/standalone.js';
import migration from '../../database/main/migrations/202610120001_srm_operational.js';
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
test('operational migration down and up preserve pre-existing membership identity', async ({
  app,
}) => {
  const connection = app.container.resolve(databaseManagerToken).connection();
  await connection.repository('opsMemberships').createOne({
    values: {
      id: 'migration-fixture',
      userId: 'migration-user',
      organizationId: 'main',
      supplierId: null,
      enabled: true,
      version: 1,
    },
  });
  const context = {
    config: {},
    container: app.container,
    builder: connection.builder,
    query: connection.query,
    connection,
    repository: connection.repository.bind(connection),
  };
  await migration.down(context);
  const old = await connection
    .repository('opsMemberships')
    .findOne({ filter: { id: 'migration-fixture' } });
  expect(old).toMatchObject({
    id: 'migration-fixture',
    userId: 'migration-user',
    organizationId: 'main',
    supplierId: null,
  });
  expect(old).not.toHaveProperty('enabled');
  await migration.up(context);
  const restored = await connection
    .repository('opsMemberships')
    .findOne({ filter: { id: 'migration-fixture' } });
  expect(restored).toMatchObject({
    id: 'migration-fixture',
    userId: 'migration-user',
    organizationId: 'main',
    enabled: true,
    version: 1,
  });
  expect(await connection.repository('srmMembershipAudit').count()).toBe(0);
}, 60000);
