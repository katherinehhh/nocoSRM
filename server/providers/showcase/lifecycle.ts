import { defineLifecycle, defineEffect } from '@nocobase/lifecycle';
import type { Delivery } from '../../../shared/showcase.js';
interface Types {
  record: Delivery;
  state:
    'draft' | 'pending' | 'approved' | 'shipped' | 'completed' | 'rejected';
  services: {
    startFlow: (record: Delivery, key: string) => Promise<void>;
    ack: (
      record: Delivery,
      key: string,
    ) => Promise<{ acknowledged: boolean; externalState: string }>;
  };
}
const startWorkflow = defineEffect<Types>({
  name: 'delivery.startWorkflow',
  timeoutMs: 30000,
  retry: { attempts: 3, backoffMs: 1000 },
  async run({ record, services }) {
    await services.startFlow(
      record,
      `delivery-approval:${record.id}:${record.lifecycleVersion}`,
    );
  },
});
const ack = defineEffect<Types>({
  name: 'delivery.externalAck',
  timeoutMs: 30000,
  retry: { attempts: 3, backoffMs: 1000 },
  async run({ record, services, idempotencyKey }) {
    return services.ack(record, idempotencyKey);
  },
});
export const deliveryLifecycle = defineLifecycle<Types>({
  name: 'deliveryPlans',
  collection: 'showcaseDeliveries',
  initial: 'draft',
  states: [
    'draft',
    'pending',
    'approved',
    'shipped',
    { name: 'completed', final: true },
    'rejected',
  ],
  transitions: {
    submit: {
      from: 'draft',
      to: 'pending',
      effects: [startWorkflow],
      set: ({ actor, now }) => ({
        submittedBy: actor.id,
        updatedAt: now.toISOString(),
      }),
    },
    submissionFailed: {
      from: 'pending',
      to: 'draft',
      manual: false,
      guard: ({ actor, record }) =>
        actor.system && !record.workflowRunId
          ? true
          : {
              code: 'INVALID_STATE',
              message: 'Only an unstarted submission can be restored.',
            },
      set: ({ now }) => ({ submittedBy: null, updatedAt: now.toISOString() }),
    },
    approve: {
      from: 'pending',
      to: 'approved',
      manual: false,
      guard: ({ actor, record }) =>
        actor.system &&
        record.decisionBy !== record.submittedBy &&
        !!record.decisionBy
          ? true
          : {
              code: 'SELF_APPROVAL',
              message: 'Approval needs a different authorized person',
            },
      set: ({ now }) => ({ updatedAt: now.toISOString() }),
    },
    reject: {
      from: 'pending',
      to: 'rejected',
      manual: false,
      guard: ({ actor, record }) =>
        actor.system &&
        !!record.decisionBy &&
        record.decisionBy !== record.submittedBy
          ? true
          : {
              code: 'SELF_APPROVAL',
              message: 'A different authorized person must decide',
            },
      set: ({ now }) => ({ updatedAt: now.toISOString() }),
    },
    rework: {
      from: 'rejected',
      to: 'draft',
      set: ({ now }) => ({
        updatedAt: now.toISOString(),
        decisionBy: null,
        resumeRequestId: null,
        workflowRunId: null,
      }),
    },
    ship: {
      from: 'approved',
      to: 'shipped',
      set: ({ now }) => ({ updatedAt: now.toISOString() }),
      effects: [ack],
    },
    receive: {
      from: 'shipped',
      to: 'completed',
      set: ({ now }) => ({ updatedAt: now.toISOString() }),
      effects: [ack],
    },
  },
});
