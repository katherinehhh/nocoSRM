import { AppConfig } from '@nocobase/app-server/config';
import { mailSettingsSource } from '../../server/mail-settings/storage.js';
import { userRoleScopeRegistryToken } from '@nocobase/app-plugin-users/server/tokens';
import { databaseManagerToken } from '@nocobase/db';
// @vitest-environment node
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { expect, vi } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication';
import { createStandaloneServer } from '../../server/standalone.js';
import { MailSettingsService } from '../../server/mail-settings/service.js';
import type { ProviderSettingsView } from '../../shared/mail-settings.js';
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
test('admin mail provider settings use native runtime, hide secrets, preserve blank values, lock conflicts, replay and rollback', async ({
  testApp,
  app,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS),
    password = 'Mail-Settings-Isolated-276!',
    user = await app.container.resolve(userAdministrationServiceToken).create({
      name: 'Unprivileged person',
      email: 'member@mail-test.invalid',
      password,
    }),
    member = await signIn(testApp, { email: user.email, password });
  expect((await member.fetch('/srmMail/providers')).status).toBe(403);
  const get = async () =>
    (
      (await (await admin.fetch('/srmMail/providers')).json()) as {
        data: ProviderSettingsView;
      }
    ).data;
  const post = async (path: string, body: object, expected = 200) => {
    const r = await admin.fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost',
      },
      body: JSON.stringify(body),
    });
    expect(r.status).toBe(expected);
    return r;
  };
  expect(
    (
      await member.fetch('/srmMail/providers', {
        method: 'POST',
        headers: {
          Origin: 'http://localhost',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      })
    ).status,
  ).toBe(403);
  const buyerUser = await app.container
    .resolve(userAdministrationServiceToken)
    .create({
      name: 'Buyer account',
      email: 'buyer@mail-test.invalid',
      password,
    });
  const conn = app.container.resolve(databaseManagerToken).connection();
  await app.container
    .resolve(userRoleScopeRegistryToken)
    .get('app')!
    .replace(buyerUser.id, ['operations-buyer'], conn);
  await conn.repository('opsMemberships').createOne({
    values: {
      id: buyerUser.id,
      userId: buyerUser.id,
      organizationId: 'main',
      supplierId: null,
      enabled: true,
      version: 1,
    },
  });
  const buyer = await signIn(testApp, { email: buyerUser.email, password });
  expect((await buyer.fetch('/srmCore/capabilities')).status).toBe(200);
  expect((await buyer.fetch('/srmMail/providers')).status).toBe(403);
  const initial = await get();
  expect(initial.providers).toHaveLength(3);
  const secret = 'isolated-mail-secret-never-returned',
    gmail = {
      name: 'gmail',
      version: initial.version,
      requestKey: randomUUID(),
      fields: {
        type: 'gmail',
        clientId: 'isolated-client',
        clientSecret: secret,
      },
    };
  await post(
    '/srmMail/providers',
    { ...gmail, fields: { type: 'gmail', clientId: 'first-without-secret' } },
    400,
  );
  await post('/srmMail/providers', gmail);
  const saved = await get();
  expect(saved.providers.find((p) => p.name === 'gmail')).toMatchObject({
    configured: true,
    enabled: true,
    hasSecret: true,
    clientId: 'isolated-client',
  });
  expect(JSON.stringify(saved)).not.toContain(secret);
  // Starting authorization only creates local state and a URL; do not visit it.
  const authorization = await post(
    '/mail/authorizations',
    {
      type: 'gmail',
      name: 'gmail',
      initialSyncReceivedAfter: '2026-10-01T00:00:00.000Z',
    },
    201,
  );
  const authorizationData = (await authorization.json()) as {
    data: { authorizationUrl: string };
  };
  expect(
    new URL(authorizationData.data.authorizationUrl).searchParams.get(
      'redirect_uri',
    ),
  ).toBe(saved.callbackUrl);
  const file = app.paths.storage('mail-provider-settings.json');
  expect((await stat(file)).mode & 0o777).toBe(0o600);
  expect(JSON.stringify(app.config.publicValues?.())).not.toContain(secret);
  await post('/srmMail/providers', gmail);
  await post(
    '/srmMail/providers',
    { ...gmail, fields: { ...gmail.fields, clientId: 'changed-replay' } },
    400,
  );
  expect((await get()).version).toBe(saved.version);
  await post('/srmMail/providers', { ...gmail, requestKey: randomUUID() }, 409);
  const update = {
    name: 'gmail',
    version: saved.version,
    requestKey: randomUUID(),
    fields: { type: 'gmail', clientId: 'updated-client', clientSecret: '' },
  };
  await post('/srmMail/providers', update);
  expect(
    JSON.parse(await readFile(file, 'utf8')).providers.gmail.clientSecret,
  ).toBe(secret);
  let current = await get();
  await post('/srmMail/providers/enabled', {
    name: 'gmail',
    enabled: false,
    version: current.version,
    requestKey: randomUUID(),
  });
  const list = await (await admin.fetch('/mail/providers')).json();
  expect(
    list.data.some(
      (p: { name: string; configured: boolean }) =>
        p.name === 'gmail' && p.configured,
    ),
  ).toBe(false);
  current = await get();
  await post('/srmMail/providers/enabled', {
    name: 'gmail',
    enabled: true,
    version: current.version,
    requestKey: randomUUID(),
  });
  current = await get();
  await post('/srmMail/providers', {
    name: 'microsoft',
    version: current.version,
    requestKey: randomUUID(),
    fields: {
      type: 'microsoft',
      clientId: 'microsoft-test',
      clientSecret: 'isolated-ms-secret',
      tenant: 'common',
    },
  });
  current = await get();
  await post('/srmMail/providers', {
    name: 'company-mail',
    version: current.version,
    requestKey: randomUUID(),
    fields: {
      type: 'imap-smtp',
      imap: { host: 'imap.example.invalid', port: 993, secure: true },
      smtp: { host: 'smtp.example.invalid', port: 465, secure: true },
    },
  });
  const providers = await (await admin.fetch('/mail/providers')).json();
  expect(
    providers.data.filter((p: { configured: boolean }) => p.configured),
  ).toHaveLength(3);
  current = await get();
  await post(
    '/srmMail/providers',
    {
      name: 'company-mail',
      version: current.version,
      requestKey: randomUUID(),
      fields: {
        type: 'gmail',
        clientId: 'wrong-type',
        clientSecret: 'irrelevant',
      },
    },
    400,
  );
  const before = await readFile(file, 'utf8'),
    reload = vi.spyOn(app.config, 'reload');
  reload.mockRejectedValueOnce(new Error('isolated reload refusal'));
  await post(
    '/srmMail/providers',
    {
      name: 'gmail',
      version: current.version,
      requestKey: randomUUID(),
      fields: { type: 'gmail', clientId: 'should-rollback' },
    },
    400,
  );
  expect(await readFile(file, 'utf8')).toBe(before);
  expect(
    (await get()).providers.find((p) => p.name === 'gmail')?.clientId,
  ).toBe('updated-client');
  reload.mockRestore();
  current = await get();
  const concurrent = (clientId: string) =>
    admin.fetch('/srmMail/providers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost',
      },
      body: JSON.stringify({
        name: 'gmail',
        version: current.version,
        requestKey: randomUUID(),
        fields: { type: 'gmail', clientId },
      }),
    });
  const statuses = (
    await Promise.all([concurrent('race-one'), concurrent('race-two')])
  )
    .map((r) => r.status)
    .sort();
  expect(statuses).toEqual([200, 409]);
  await app.config.reload();
  expect((await get()).providers.filter((p) => p.configured)).toHaveLength(3);
  const rehydrated = new AppConfig().load(mailSettingsSource(file));
  await rehydrated.loadAll();
  expect(
    Object.keys(
      rehydrated.get<Record<string, unknown>>('mail.providers') ?? {},
    ),
  ).toHaveLength(3);
  const service = new MailSettingsService(app);
  const previous = await readFile(file, 'utf8');
  await writeFile(file, '{"invalid":true}');
  await expect(service.view('http://localhost')).rejects.toThrow();
  await writeFile(file, previous);
}, 60000);
