import { z } from 'zod';
export const deliveryStates = [
  'draft',
  'pending',
  'approved',
  'shipped',
  'completed',
  'rejected',
] as const;
export const LineSchema = z
  .object({
    sourceLineId: z.string().max(64).optional(),
    sku: z.string().min(1).max(80),
    name: z.string().min(1).max(200),
    fnsku: z.string().regex(/^[A-Za-z0-9._-]{0,80}$/),
    allocation: z.number().int().min(1).max(100000),
    unitsPerBox: z.number().int().min(1).max(10000),
  })
  .strict();
export const DeliveryInput = z
  .object({
    name: z.string().trim().min(1).max(200),
    orderId: z.string().min(1).max(64),
    region: z.enum(['AU', 'EU', 'US', 'CN']),
    businessDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(
        (v) =>
          !Number.isNaN(Date.parse(v)) &&
          new Date(v).toISOString().slice(0, 10) === v,
      ),
    notes: z.string().max(4000),
    lines: z.array(LineSchema).min(1).max(100),
    labelCount: z.number().int().min(1).max(400),
    requestId: z.string().min(1).max(100),
    expectedOrderVersion: z.number().int().positive().optional(),
    expectedVersion: z.number().int().nonnegative().optional(),
  })
  .strict();
export const TemplateSchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    locale: z.enum(['zh-CN', 'en-US']),
    columns: z
      .array(
        z.enum([
          'sku',
          'name',
          'orderId',
          'fnsku',
          'region',
          'allocation',
          'unitsPerBox',
          'boxes',
        ]),
      )
      .min(1)
      .max(8),
    labelColumns: z.number().int().min(1).max(6),
    labelRows: z.number().int().min(1).max(10),
    labelCount: z.number().int().min(1).max(400),
  })
  .strict();
export type DeliveryValues = z.infer<typeof DeliveryInput>;
export type DeliveryLine = z.infer<typeof LineSchema>;
export interface Delivery {
  [key: string]: unknown;
  id: string;
  number: string;
  name: string;
  organizationId: string;
  supplierId: string;
  orderId: string;
  orderSourceVersion?: number | null;
  orderNumber?: string;
  supplierName?: string;
  region: string;
  businessDate: string;
  notes: string;
  lines: string;
  labelCount: number;
  amount: number;
  status: string;
  statusChangedAt: string;
  lifecycleVersion: number;
  createdBy: string;
  submittedBy: string | null;
  decisionBy: string | null;
  updatedAt: string;
  workflowRunId: string | null;
  resumeRequestId: string | null;
  autoApprove: boolean;
}
export const defaultTemplate: z.infer<typeof TemplateSchema> = {
  title: '交货计划',
  locale: 'zh-CN',
  columns: [
    'sku',
    'name',
    'orderId',
    'fnsku',
    'region',
    'allocation',
    'unitsPerBox',
    'boxes',
  ],
  labelColumns: 4,
  labelRows: 10,
  labelCount: 40,
};
