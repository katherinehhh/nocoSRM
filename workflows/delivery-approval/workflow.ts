import { createNode } from '@nocobase/app-plugin-workflow/dsl';
import {
  Type,
  workflow,
  defineHandler,
  createConditionInstruction,
  createWaitInstruction,
} from '@nocobase/app-plugin-workflow/server';
import type { run as lowRisk } from './server/low-risk.js';
const checked = createNode<
  { lowRisk: boolean; amount: number },
  unknown,
  'check'
>(
  'showcase-delivery',
  {
    key: 'check',
    title: 'Check delivery evidence',
    description:
      'Evaluate persisted delivery amount and explicitly enabled low-risk policy.',
  },
  { operation: 'risk' },
);
const auto = createNode<{ applied: boolean }, unknown, 'automatic'>(
  'showcase-delivery',
  {
    key: 'automatic',
    title: 'Apply low-risk policy',
    description:
      'Apply native lifecycle approval only after policy and amount checks.',
  },
  { operation: 'automatic' },
);
const wait = createWaitInstruction<
  { decision: string; actorId: string; version: number },
  'decision'
>(
  {
    key: 'decision',
    title: 'Human approval',
    description:
      'Wait for a different authorized approver. Resume acceptance is not applied approval.',
  },
  {
    type: 'object',
    properties: {
      decision: { type: 'string' },
      actorId: { type: 'string' },
      version: { type: 'integer' },
    },
    required: ['decision', 'actorId', 'version'],
  },
);
const decided = createNode<{ applied: boolean }, unknown, 'apply'>(
  'showcase-delivery',
  {
    key: 'apply',
    title: 'Apply human decision',
    description:
      'Verify decision provenance and expected version, then fire native lifecycle transition.',
  },
  { operation: 'apply' },
);
const branch = createConditionInstruction({
  key: 'lowRisk',
  title: 'Low-risk policy',
  description:
    'Only explicitly enabled records under the approval threshold may use automation.',
})
  .check(defineHandler<typeof lowRisk>('./server/low-risk'))
  .yes([auto])
  .no([wait, decided]);
export default workflow({
  key: 'delivery-approval',
  title: 'Delivery approval',
  description:
    'Native durable run/condition/wait combined with authoritative delivery lifecycle.',
  inputSchema: Type.Object(
    { deliveryId: Type.String() },
    { additionalProperties: false },
  ),
})
  .addNode(checked)
  .addNode(branch)
  .finalize();
