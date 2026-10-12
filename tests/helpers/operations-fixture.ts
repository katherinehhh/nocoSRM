import type { Application } from '@nocobase/app-server/application';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication';
import { operationsToken } from '../../server/providers/operations/index.js';
import { createDemo } from '../../server/providers/operations/demo.js';
// Only isolated AppTest databases use this fixture. No production HTTP endpoint enables it.
export function loadOperationsFixture(
  app: Application,
  password = 'Operations-Test-Only-294!',
) {
  return createDemo(
    app.container.resolve(operationsToken),
    app.container.resolve(authorizationToken),
    app.container.resolve(userAdministrationServiceToken),
    password,
  );
}
