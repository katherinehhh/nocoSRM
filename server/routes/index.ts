import {showcaseRoutes,showcaseCallbacks} from './showcase.js';
import { operationsRoutes } from './operations.js';
import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

const routes: readonly AppRouteContribution<Application>[] = [operationsRoutes,showcaseRoutes,showcaseCallbacks];

export default routes;
