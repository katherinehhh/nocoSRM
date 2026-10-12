import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import { i18nToken } from '@nocobase/app-server/i18n';
import type { ApprovalService } from '@nocobase/app-plugin-approval/server';
import type { ServiceResolver } from '@nocobase/service-provider';
import type { DatabaseConnection } from '@nocobase/db';
import { coreContext } from './policy-context.js';
import { awardDirectory } from './approval-directory.js';
import { CoreRowSchema, decodeCore } from '../../shared/srm-core.js';
import {
  AwardOperationInput,
  AwardSettingsInput,
  type AwardSettings,
} from '../../shared/srm-approval.js';
import { coreFail, type CoreActor, type CoreService } from './service.js';

export class AwardService {
  constructor(
    readonly core: CoreService,
    readonly approvals: ApprovalService,
    readonly services: ServiceResolver,
  ) {}
  async notify(
    taskId: string,
    personId: string,
    recordId: string,
    reason: string,
  ) {
    const runtime = this.services.resolve(i18nToken);
    // The identity service exposes no user language preference; use the app's
    // recipient fallback explicitly, never the initiating request's language.
    const t = runtime.getFixedT('app', runtime.getDefaultLocale());
    await this.services.resolve(notificationServiceToken).send({
      idempotencyKey: `srm-award:${taskId}:${reason}`,
      source: { type: 'srmAward', referenceId: recordId },
      messages: {
        rfqApprovalInbox: {
          to: personId,
          title: t('srmApproval.noticeTitle'),
          body: t('srmApproval.noticeBody'),
          target: { type: 'route', path: `/supply/srm/rfqs/${recordId}` },
        },
      },
    });
  }
  async settings(
    c: DatabaseConnection = this.core.db.connection(),
    org = 'main',
  ): Promise<AwardSettings> {
    const row = await c
      .repository('srmAwardSettings')
      .findOne({ filter: { id: org } });
    return (
      (row as unknown as AwardSettings) ?? {
        id: org,
        enabled: false,
        purchasing: '',
        department: '',
        version: 0,
      }
    );
  }
  async configure(
    actor: CoreActor,
    input: ReturnType<typeof AwardSettingsInput.parse>,
  ) {
    return this.core.once(
      actor,
      input.requestKey,
      { awardSettings: input },
      async (c) => {
        const current = await this.settings(c, actor.organizationId);
        if (current.version !== input.version) coreFail('CONFLICT', 'ABORTED');
        if (input.enabled) {
          const { directory } = await awardDirectory(
            c,
            this.services,
            actor.organizationId,
          );
          if (
            !input.purchasing ||
            !input.department ||
            input.purchasing === input.department ||
            !directory.isActive(input.purchasing) ||
            !directory.isActive(input.department)
          )
            coreFail('APPROVAL_REVIEWERS_REQUIRED');
        }
        const { requestKey: _, ...values } = input;
        void _;
        const repo = c.repository('srmAwardSettings'),
          saved = {
            ...values,
            id: actor.organizationId,
            version: current.version + 1,
          };
        if (current.version) {
          const changed = await repo.updateMany({
            filter: { id: actor.organizationId, version: input.version },
            values: saved,
          });
          if (changed.updatedCount !== 1) coreFail('CONFLICT', 'ABORTED');
        } else await repo.createOne({ values: saved });
        return saved;
      },
    );
  }
  async context(actor: CoreActor, connection?: DatabaseConnection) {
    if (!connection && actor.directory && actor.awardPeople)
      return { actor, people: actor.awardPeople };
    const { directory, people } = await awardDirectory(
      connection ?? this.core.db.connection(),
      this.services,
      actor.organizationId,
    );
    return { actor: { ...actor, directory, awardPeople: people }, people };
  }
  async read(actor: CoreActor, id: string) {
    if (actor.supplierId) coreFail('FORBIDDEN', 'PERMISSION_DENIED');
    const { actor: a, people } = await this.context(actor);
    return coreContext.run(a, async () => {
      await this.core.get(this.core.db.connection(), a, 'rfq', id);
      return {
        runs: await this.approvals.runViewsFor('srmCoreRecords', id),
        upcoming: await this.approvals.upcomingStagesFor('srmCoreRecords', id, {
          id: a.id,
        }),
        actions: await this.approvals.actionsFor('srmCoreRecords', id, {
          id: a.id,
        }),
        people,
      };
    });
  }
  async perform(
    actor: CoreActor,
    id: string,
    input: ReturnType<typeof AwardOperationInput.parse>,
  ) {
    const { actor: a } = await this.context(actor);
    return coreContext.run(a, async () => {
      const row = await this.core.get(this.core.db.connection(), a, 'rfq', id);
      // Native target identity must belong to the URL's authorized record.
      const runs = await this.approvals.runViewsFor('srmCoreRecords', id);
      if (
        !runs.some((run) => run.tasks.some((task) => task.id === input.taskId))
      )
        coreFail('NOT_FOUND', 'NOT_FOUND');
      if (a.supplierId || row.createdBy === a.id || row.submittedBy === a.id)
        coreFail('SELF_APPROVAL', 'PERMISSION_DENIED');
      const result = await this.approvals.perform({
        action: input.action,
        target: { taskId: input.taskId },
        actor: { id: a.id },
        comment: input.comment,
        contentHash: input.contentHash,
        requestId: input.requestId,
        ...(input.action === 'return' ? { input: { to: 'open' } } : {}),
      });
      return {
        result,
        record: decodeCore(
          CoreRowSchema.parse(
            await this.core.get(this.core.db.connection(), a, 'rfq', id),
          ),
        ),
      };
    });
  }
}
