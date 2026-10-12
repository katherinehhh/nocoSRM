import {
  createLifecycleJobs,
  type LifecycleJobs,
} from '@nocobase/lifecycle/jobs';
import { jobExecutorServiceToken } from '@nocobase/app-server/jobs';
import {
  ApprovalService,
  type Approval,
} from '@nocobase/app-plugin-approval/server';
import { AwardService } from './award-service.js';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import { aiInstructions } from '../srm-ai/service.js';
import type { Application } from '@nocobase/app-server/application';
import {
  ServiceProvider,
  createServiceToken,
} from '@nocobase/service-provider';
import { databaseManagerToken, type DatabaseConnection } from '@nocobase/db';
import {
  LifecycleRuntime,
  createRepositoryLifecycleStore,
} from '@nocobase/lifecycle';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { operationsToken } from '../providers/operations/index.js';
import { coreLifecycle } from './lifecycle.js';
import { CoreService } from './service.js';
import { coreResources, coreTables } from './resources.js';
import { scopedCoreStore } from './policy-context.js';
export const coreToken = createServiceToken<CoreService>('app/srm-core');
export default class CoreProvider extends ServiceProvider<Application> {
  readonly name = 'app/srm-core';
  private jobs?: LifecycleJobs;
  override register() {
    this.app.container.singleton(coreToken, () => {
      const executors = this.app.container.resolve(jobExecutorServiceToken);
      this.jobs = createLifecycleJobs({
        jobs: executors.getJobExecutor('srm-award'),
        schedule: executors.getScheduleExecutor('srm-award'),
        jobName: 'srm-award/effects',
        sweepEveryMs: 30000,
        onSweep: async () => {
          await this.app.container.resolve(coreToken).award!.approvals.sweep();
        },
      });
      const db = this.app.container.resolve(databaseManagerToken),
        runtime = new LifecycleRuntime({
          dispatcher: this.jobs,
          store: scopedCoreStore(
            createRepositoryLifecycleStore(db, {
              collections: {
                transitions: 'srmCoreTransitions',
                effectRuns: 'srmCoreEffects',
              },
            }),
          ),
        }),
        service = new CoreService(
          db,
          runtime,
          this.app.container.resolve(operationsToken),
        );
      runtime.register(coreLifecycle, {
        services: (handle) =>
          service.services(
            (handle as DatabaseConnection | undefined) ?? db.connection(),
          ),
      });
      service.award = new AwardService(
        service,
        new ApprovalService(
          runtime,
          [coreLifecycle.approval as unknown as Approval<never>],
          (handle) =>
            service.services(
              (handle as DatabaseConnection | undefined) ?? db.connection(),
            ),
        ),
        this.app.container,
      );
      return service;
    });
  }
  override async start() {
    await this.jobs!.start(this.app.container.resolve(coreToken).runtime);
  }
  override async shutdown() {
    await this.jobs?.shutdown();
  }
  override async boot() {
    const agents = this.app.container.resolve(agentsToken);
    for (const purpose of ['quoteDecision', 'requestDraft', 'qualityReturn'])
      agents.presets.register({
        key: `srm.${purpose}`,
        name: purpose,
        description: 'Evidence-based SRM business assistance',
        nameText: { key: `srmAi.purposes.${purpose}`, ns: 'app' },
        descriptionText: { key: 'srmAi.hint', ns: 'app' },
        type: 'online',
        instructions: aiInstructions,
        actions: [],
      });
    const authz = this.app.container.resolve(authorizationToken);
    for (const table of coreTables)
      authz.database.collections.add({ name: table, title: table });
    for (const resource of coreResources) {
      const ref = authz.compositeResources.define(resource);
      authz.ui.place(ref, { section: 'operations' });
    }
  }
}
