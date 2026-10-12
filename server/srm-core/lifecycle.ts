import { decodeCore } from '../../shared/srm-core.js';
import {
  defineApproval,
  approvalState,
  stagesFor,
  approve,
  reject,
  returnTo,
  type ApprovalDirectory,
} from '@nocobase/app-plugin-approval/server';
import type { CoreRow, CoreKind, CoreData } from '../../shared/srm-core.js';
interface Types {
  record: CoreRow;
  state:
    | 'draft'
    | 'open'
    | 'pending'
    | 'purchasingReview'
    | 'departmentReview'
    | 'submitted'
    | 'approved'
    | 'rejected'
    | 'inactive'
    | 'shipped'
    | 'completed'
    | 'awarded'
    | 'cancelled';
  services: {
    directory: ApprovalDirectory;
    awardEnabled: boolean;
    notify: (
      taskId: string,
      personId: string,
      recordId: string,
      reason: string,
    ) => Promise<void>;
    validate: (
      row: CoreRow,
      action: string,
      input: Record<string, unknown>,
      actorId: string,
    ) => Promise<void>;
    approve: (row: CoreRow, actorId: string) => Promise<void>;
    select: (row: CoreRow, input: Record<string, unknown>) => Promise<CoreData>;
    invitations: (row: CoreRow) => Promise<void>;
    edit: (
      row: CoreRow,
      input: Record<string, unknown>,
    ) => Promise<Partial<CoreRow>>;
    supplierState: (
      row: CoreRow,
      active: boolean,
      actorId: string,
    ) => Promise<void>;
  };
}
const eligible =
  (kinds: CoreKind[], action: string) =>
  async ({
    record,
    input,
    actor,
    services,
  }: {
    record: CoreRow;
    input: Record<string, unknown>;
    actor: { id: string };
    services: Types['services'];
  }) => {
    if (!kinds.includes(record.kind))
      return {
        code: 'INVALID_STATE',
        message: 'Operation does not apply to this record.',
      };
    try {
      await services.validate(record, action, input, actor.id);
      return true;
    } catch (e) {
      return {
        code: e instanceof Error ? e.message : 'INVALID',
        message: 'Business prerequisites are not met.',
        kind:
          e instanceof Error &&
          ['SELF_APPROVAL', 'FORBIDDEN'].includes(e.message)
            ? ('permission' as const)
            : ('precondition' as const),
      };
    }
  };
const stamp = ({ now }: { now: Date }) => ({ updatedAt: now.toISOString() });
const stage = stagesFor<Types>();
const reviewActions = [
  approve({ reason: 'required' }),
  reject({ reason: 'required' }),
  returnTo({ targets: ['open'], reason: 'required' }),
];
export const coreLifecycle = defineApproval<Types>({
  collection: 'srmCoreRecords',
  version: 1,
  applicant: (r) => r.submittedBy || r.createdBy,
  directory: (s) => s.directory,
  notify: ({ task, services, reason }) =>
    services.notify(task.id, task.assigneeId, String(task.recordId), reason),
  freeze: ['name', 'data', 'supplierId', 'submittedBy'],
  name: 'srmCoreRecords',
  initial: 'draft',
  create: {
    guard: async ({ values, actor, services }) => {
      if (values.createdBy !== actor.id)
        return {
          code: 'FORBIDDEN',
          message: 'Creator must match the initiating identity.',
        };
      try {
        await services.validate(values as CoreRow, 'submit', {}, actor.id);
        return true;
      } catch (e) {
        return {
          code: e instanceof Error ? e.message : 'INVALID',
          message: 'Invalid source or business values.',
          kind: 'precondition' as const,
        };
      }
    },
  },
  states: [
    'draft',
    'open',
    'pending',
    approvalState(
      'purchasingReview',
      stage.single({
        title: 'Purchasing manager',
        assignee: ({ record }) => decodeCore(record).data.reviewers?.purchasing,
        onEmpty: 'refuse',
        qualification: 'operations-approver',
        actions: reviewActions,
      }),
    ),
    approvalState(
      'departmentReview',
      stage.single({
        title: 'Department manager',
        assignee: ({ record }) => decodeCore(record).data.reviewers?.department,
        onEmpty: 'refuse',
        qualification: 'operations-approver',
        actions: reviewActions,
      }),
    ),
    'submitted',
    'approved',
    'rejected',
    'inactive',
    'shipped',
    { name: 'completed', final: true },
    { name: 'awarded', final: true },
    { name: 'cancelled', final: true },
  ],
  transitions: {
    renew: {
      from: ['approved', 'inactive'],
      to: 'draft',
      guard: eligible(['admission'], 'renew'),
      set: stamp,
      onTransition: ({ record, services, actor }) =>
        services.supplierState(record, false, actor.id),
    },
    edit: {
      from: 'draft',
      to: 'draft',
      guard: eligible(
        ['admission', 'rfq', 'quote', 'inspection', 'return'],
        'edit',
      ),
      set: async ({ record, input, services, now }) => ({
        ...(await services.edit(record, input)),
        updatedAt: now.toISOString(),
      }),
      onTransition: ({ record, services }) => services.invitations(record),
    },
    open: {
      from: 'draft',
      to: 'open',
      guard: eligible(['rfq'], 'open'),
      set: ({ record, now }) => ({
        updatedAt: now.toISOString(),
        data: JSON.stringify({
          ...decodeCore(record).data,
          publishedVersion: record.lifecycleVersion + 1,
        }),
      }),
    },
    submit: {
      from: 'draft',
      to: ['submitted', 'pending'],
      route: ({ record }) =>
        record.kind === 'quote' ? 'submitted' : 'pending',
      guard: eligible(['admission', 'quote', 'inspection', 'return'], 'submit'),
      onTransition: async ({ record, services, actor }) => {
        if (record.kind === 'admission')
          await services.supplierState(record, false, actor.id);
      },
      set: ({ actor, now }) => ({
        submittedBy: actor.id,
        updatedAt: now.toISOString(),
      }),
    },
    nominate: {
      from: 'open',
      to: ['pending', 'purchasingReview'],
      route: ({ services }) =>
        services.awardEnabled ? 'purchasingReview' : 'pending',
      guard: eligible(['rfq'], 'nominate'),
      set: async ({ record, input, actor, services, now }) => ({
        submittedBy: actor.id,
        data: JSON.stringify(await services.select(record, input)),
        updatedAt: now.toISOString(),
      }),
    },
    purchasingApproved: {
      from: 'purchasingReview',
      to: 'departmentReview',
      approvalOutcome: 'approved',
      guard: eligible(['rfq'], 'approve'),
      set: stamp,
    },
    departmentApproved: {
      from: 'departmentReview',
      to: 'awarded',
      approvalOutcome: 'approved',
      guard: eligible(['rfq'], 'approve'),
      set: ({ record, actor, now }) => ({
        data: JSON.stringify({
          ...decodeCore(record).data,
          approvedBy: actor.id,
          orderId: record.id,
        }),
        updatedAt: now.toISOString(),
      }),
      onTransition: ({ record, actor, services }) =>
        services.approve(record, actor.id),
    },
    awardRejected: {
      from: ['purchasingReview', 'departmentReview'],
      to: 'rejected',
      approvalOutcome: 'rejected',
      guard: eligible(['rfq'], 'reject'),
      set: stamp,
    },
    awardReturned: {
      from: ['purchasingReview', 'departmentReview'],
      to: 'open',
      approvalOutcome: 'returned',
      guard: eligible(['rfq'], 'reject'),
      set: stamp,
    },
    approve: {
      from: 'pending',
      to: ['awarded', 'approved'],
      route: ({ record }) => (record.kind === 'rfq' ? 'awarded' : 'approved'),
      guard: eligible(['admission', 'rfq', 'inspection', 'return'], 'approve'),
      set: ({ record, actor, now }) => ({
        data: JSON.stringify({
          ...decodeCore(record).data,
          approvedBy: actor.id,
          ...(record.kind === 'rfq'
            ? { orderId: record.id }
            : record.kind === 'inspection'
              ? {
                  decidedReceiptVersion:
                    (decodeCore(record).data.sourceVersion ?? 0) + 1,
                }
              : {}),
        }),
        updatedAt: now.toISOString(),
      }),
      onTransition: ({ record, actor, services }) =>
        services.approve(record, actor.id),
    },
    reject: {
      from: 'pending',
      to: 'rejected',
      guard: eligible(['admission', 'rfq', 'inspection', 'return'], 'reject'),
      set: ({ record, input, now }) => ({
        data: JSON.stringify({
          ...decodeCore(record).data,
          decisionReason: input.reason,
        }),
        updatedAt: now.toISOString(),
      }),
    },
    revise: {
      from: 'rejected',
      to: ['draft', 'open'],
      route: ({ record }) => (record.kind === 'rfq' ? 'open' : 'draft'),
      guard: eligible(['admission', 'rfq', 'inspection', 'return'], 'revise'),
      set: ({ record, now }) => ({
        submittedBy: '',
        data: JSON.stringify({
          ...decodeCore(record).data,
          selectedQuoteId: undefined,
          decisionReason: undefined,
        }),
        updatedAt: now.toISOString(),
      }),
    },
    withdraw: {
      from: 'submitted',
      to: 'draft',
      guard: eligible(['quote'], 'withdraw'),
      set: stamp,
    },
    disable: {
      from: 'approved',
      to: 'inactive',
      guard: eligible(['admission'], 'disable'),
      onTransition: ({ record, services, actor }) =>
        services.supplierState(record, false, actor.id),
      set: stamp,
    },
    enable: {
      from: 'inactive',
      to: 'approved',
      guard: eligible(['admission'], 'enable'),
      onTransition: ({ record, services, actor }) =>
        services.supplierState(record, true, actor.id),
      set: stamp,
    },
    ship: {
      from: 'approved',
      to: 'shipped',
      guard: eligible(['return'], 'ship'),
      set: ({ record, input, now }) => ({
        data: JSON.stringify({
          ...decodeCore(record).data,
          tracking: input.tracking,
        }),
        updatedAt: now.toISOString(),
      }),
    },
    confirm: {
      from: 'shipped',
      to: 'completed',
      guard: eligible(['return'], 'confirm'),
      set: stamp,
    },
    cancel: {
      from: [
        'draft',
        'open',
        'approved',
        'purchasingReview',
        'departmentReview',
      ],
      to: 'cancelled',
      guard: eligible(['rfq', 'return'], 'cancel'),
      set: ({ record, input, now }) => ({
        data: JSON.stringify({
          ...decodeCore(record).data,
          decisionReason: input.reason,
        }),
        updatedAt: now.toISOString(),
      }),
    },
  },
});
