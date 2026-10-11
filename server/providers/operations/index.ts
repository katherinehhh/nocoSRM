import {
  ServiceProvider,
  createServiceToken,
} from '@nocobase/service-provider';
import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { schedulerServiceToken } from '@nocobase/app-plugin-scheduler/server/tokens';
import { OperationsService } from './service.js';
import { resources, allTables } from './resources.js';
export const operationsToken =
  createServiceToken<OperationsService>('app/operations');
export default class OperationsProvider extends ServiceProvider<Application> {
  public readonly name = 'app/operations';
  override register(): void {
    this.app.container.singleton(
      operationsToken,
      () =>
        new OperationsService(this.app.container.resolve(databaseManagerToken)),
    );
  }
  override async boot(): Promise<void> {
    const authz = this.app.container.resolve(authorizationToken);
    authz.ui.sections.add({
      name: 'operations',
      title: 'Operations',
      parent: 'business',
    });
    for (const table of allTables)
      authz.database.collections.add({ name: table, title: table });
    for (const resource of resources) {
      const ref = authz.compositeResources.define(resource);
      authz.ui.place(ref, { section: 'operations' });
    }
    authz.settings.add({
      id: 'operations.admin',
      title: 'Operations administration',
      actions: [{ name: 'read' }, { name: 'update' }],
    });
    authz.ui.sections.add({
      name: 'operationsAdmin',
      title: 'Operations',
      parent: 'administration',
    });
    authz.ui.place(
      { type: 'settings', id: 'operations.admin' },
      { section: 'operationsAdmin' },
    );
    const scheduler = this.app.container.resolve(schedulerServiceToken);
    scheduler.registerTarget({
      type: 'operations.scan',
      title: 'Operations policy scan',
      validate: () => ({ valid: true }),
      start: async () => {
        const runs = await this.app.container
          .resolve(operationsToken)
          .scheduled();
        if (runs.some((r) => 'status' in r && r.status === 'failed'))
          return { state: 'failed', reason: 'POLICY_EXECUTION_FAILED' };
        return {
          state: 'completed',
          outcome: 'succeeded',
          result: { runs: runs.length },
        };
      },
    });
    scheduler.defineSchedule({
      key: 'operations.policy-scan',
      title: 'Operations policy scan',
      schedule: { cron: '*/5 * * * *', timezone: 'Asia/Shanghai' },
      target: { type: 'operations.scan', config: {} },
    });
  }
}
