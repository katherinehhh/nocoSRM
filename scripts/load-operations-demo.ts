import { randomBytes } from 'node:crypto';
import { writeFile, access } from 'node:fs/promises';
import { createStandaloneServer } from '../server/standalone.js';
import { operationsToken } from '../server/providers/operations/index.js';
import { createDemo } from '../server/providers/operations/demo.js';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication';
if (process.env.NODE_ENV === 'production')
  throw new Error('Demo provisioning is development-only');
const file = new URL(
  '../storage/operations-demo-accounts.txt',
  import.meta.url,
);
let exists = false;
try {
  await access(file);
  exists = true;
} catch {
  // A missing credentials file is expected on first provisioning.
}
const password = randomBytes(24).toString('base64url');
const server = await createStandaloneServer({ viteDevUrl: false });
try {
  const app = server.application;
  const result = await createDemo(
    app.container.resolve(operationsToken),
    app.container.resolve(authorizationToken),
    app.container.resolve(userAdministrationServiceToken),
    password,
  );
  if (!exists)
    await writeFile(
      file,
      `Local demonstration accounts only. Existing accounts are never reset.\nInitial password for newly provisioned accounts: ${password}\n\n${result.accounts.map((a) => `${a.role}: ${a.email}`).join('\n')}\n`,
      { mode: 0o600, flag: 'wx' },
    );
  console.log(
    JSON.stringify({
      suppliers: result.suppliers,
      materials: result.materials,
      orders: result.orders,
      accounts: result.accounts.length,
      credentialFile: 'storage/operations-demo-accounts.txt',
    }),
  );
} finally {
  await server.close();
}
