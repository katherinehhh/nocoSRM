import { z } from 'zod';
export const AwardSettingsInput = z
  .object({
    enabled: z.boolean(),
    purchasing: z.string().max(64),
    department: z.string().max(64),
    version: z.number().int().nonnegative(),
    requestKey: z.string().uuid(),
  })
  .strict();
export const AwardOperationInput = z
  .object({
    taskId: z.string().min(1).max(200),
    action: z.enum(['approve', 'reject', 'return']),
    contentHash: z.string().min(1).max(128),
    comment: z.string().trim().min(1).max(2000),
    requestId: z.string().uuid(),
  })
  .strict();
export interface AwardSettings {
  id: string;
  enabled: boolean;
  purchasing: string;
  department: string;
  version: number;
}
