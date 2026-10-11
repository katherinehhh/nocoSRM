import {
  createNodeExpression,
  type WorkflowNodeSourceInput,
  type NodeExpression,
  type ConfigIssue,
} from '@nocobase/app-plugin-workflow';
import {
  WorkflowInstruction,
  NODE_RUN_STATUS,
  type WorkflowInstructionResult,
} from '@nocobase/app-plugin-workflow/server';
import { z } from 'zod';
import { showcaseToken } from '../providers/showcase/index.js';
type Config = { operation: 'risk' | 'automatic' | 'apply' };
const schema = z
  .object({ operation: z.enum(['risk', 'automatic', 'apply']) })
  .strict();
/** Native durable background instruction bridging workflow decisions to the application's lifecycle service. */
export class DeliveryInstruction extends WorkflowInstruction {
  static readonly type = 'showcase-delivery';
  static readonly branches = null;
  static readonly result = null;
  static create(source: WorkflowNodeSourceInput<Config>): NodeExpression {
    return createNodeExpression(DeliveryInstruction, source);
  }
  static validateConfig(config: unknown): ConfigIssue[] {
    const parsed = schema.safeParse(config);
    return parsed.success
      ? []
      : parsed.error.issues.map((issue) => ({
          path: `config.${issue.path.join('.')}`,
          message: issue.message,
        }));
  }
  async run() {
    this.processor.scheduleBackground(this.nodeRun);
    return null;
  }
  async background(
    context: Parameters<NonNullable<WorkflowInstruction['background']>>[0],
  ): Promise<WorkflowInstructionResult> {
    try {
      context.signal.throwIfAborted();
      const service = this.processor.services!.resolve(showcaseToken),
        handler = this.processor.getHandlerContext(),
        id = z.string().uuid().parse(handler.input.deliveryId),
        config = schema.parse(this.config);
      let result: unknown;
      if (config.operation === 'risk') result = await service.risk(id);
      else if (config.operation === 'automatic')
        result = await service.applyDecision(
          id,
          { decision: 'approve', actorId: 'policy' },
          context.idempotencyKey,
        );
      else {
        const decision = z
          .object({
            decision: z.enum(['approve', 'reject']),
            actorId: z.string(),
            version: z.number().int(),
          })
          .parse(handler.nodeResults.decision);
        result = await service.applyDecision(
          id,
          decision,
          context.idempotencyKey,
        );
      }
      context.signal.throwIfAborted();
      return { status: NODE_RUN_STATUS.RESOLVED, result };
    } catch (e) {
      return {
        status: NODE_RUN_STATUS.ERROR,
        error: e instanceof Error ? e.message : 'DELIVERY_NODE_FAILED',
      };
    }
  }
  async resume(): Promise<WorkflowInstructionResult | null> {
    const request = this.processor.resumeRequest;
    if (
      this.nodeRun.status !== NODE_RUN_STATUS.PENDING ||
      request?.instructionType !== DeliveryInstruction.type ||
      String(request.nodeRunId) !== String(this.nodeRun.id)
    )
      return null;
    const completion = request.payload as {
      startedAt: string;
      status: number;
      result: unknown;
      error: string | null;
    };
    if (
      new Date(completion.startedAt).getTime() !==
      new Date(this.nodeRun.startedAt).getTime()
    ) {
      this.processor.rejectResumeRequest('stale');
      return null;
    }
    return {
      status: completion.status,
      result: completion.result,
      ...(completion.error ? { error: completion.error } : {}),
    };
  }
}
