import { mailSettingsRoutes } from './mail-settings.js';
import { coreRoutes } from './srm-core.js';
import { financeBridgeRoutes } from './finance-bridge.js';
import { srmUsersRoutes } from './srm-users.js';
import { showcaseRoutes, showcaseCallbacks } from './showcase.js';
import { operationsRoutes } from './operations.js';
import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

const routes: readonly AppRouteContribution<Application>[] = [
  // Signed machine callbacks own their authentication and must precede broad UI-session middleware.
  financeBridgeRoutes,
  mailSettingsRoutes,
  coreRoutes,
  srmUsersRoutes,
  operationsRoutes,
  showcaseRoutes,
  showcaseCallbacks,
];

export default routes;
