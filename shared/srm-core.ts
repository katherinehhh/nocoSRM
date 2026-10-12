import { z } from 'zod';
export const coreKinds = [
  'admission',
  'rfq',
  'quote',
  'inspection',
  'return',
] as const;
export type CoreKind = (typeof coreKinds)[number];
export const coreStates = [
  'draft',
  'open',
  'pending',
  'purchasingReview',
  'departmentReview',
  'submitted',
  'approved',
  'rejected',
  'inactive',
  'shipped',
  'completed',
  'awarded',
  'cancelled',
] as const;
export const coreActions = [
  'view',
  'create',
  'edit',
  'open',
  'submit',
  'nominate',
  'approve',
  'reject',
  'revise',
  'withdraw',
  'renew',
  'disable',
  'enable',
  'ship',
  'confirm',
  'cancel',
] as const;
export type CoreAction = (typeof coreActions)[number];
export const CoreLineSchema = z
  .object({
    id: z.string().min(1).max(64),
    materialId: z.string().min(1).max(64),
    quantity: z.number().int().positive().max(100000),
    price: z.number().int().positive().max(10000000).optional(),
    taxRateBps: z.number().int().min(0).max(10000).optional(),
    accepted: z.number().int().nonnegative().optional(),
    rejected: z.number().int().nonnegative().optional(),
  })
  .strict();
export const CoreDataSchema = z
  .object({
    lines: z.array(CoreLineSchema).max(100).optional(),
    supplierIds: z.array(z.string().uuid()).max(20).optional(),
    evidence: z.string().max(4000).optional(),
    qualification: z.string().max(300).optional(),
    validUntil: z.string().max(10).optional(),
    deliveryDate: z.string().max(10).optional(),
    criteria: z.string().max(1000).optional(),
    reason: z.string().max(2000).optional(),
    tracking: z.string().max(200).optional(),
    sourceVersion: z.number().int().positive().optional(),
  })
  .strict();
export type CoreData = z.infer<typeof CoreDataSchema> & {
  reviewers?: { purchasing: string; department: string };
  publishedVersion?: number;
  selectedQuoteId?: string;
  selectedQuoteVersion?: number;
  orderId?: string;
  decidedReceiptVersion?: number;
  approvedBy?: string;
  decisionReason?: string;
};
export const CoreInput = z
  .object({
    name: z.string().trim().min(1).max(200),
    sourceId: z.string().max(64).default(''),
    supplierId: z.string().uuid().nullable().default(null),
    deadline: z.string().max(10).default(''),
    data: CoreDataSchema,
    requestKey: z.string().uuid(),
  })
  .strict();
export const CoreActionInput = z
  .object({
    version: z.number().int().nonnegative(),
    requestKey: z.string().uuid(),
    reason: z.string().max(2000).optional(),
    selectedQuoteId: z.string().uuid().optional(),
    tracking: z.string().max(200).optional(),
    values: CoreInput.omit({ requestKey: true }).optional(),
  })
  .strict();
export interface CoreRow {
  [field: string]: unknown;
  id: string;
  kind: CoreKind;
  organizationId: string;
  supplierId: string | null;
  sourceId: string;
  name: string;
  number: string;
  deadline: string;
  createdBy: string;
  submittedBy: string;
  status: string;
  statusChangedAt: string;
  lifecycleVersion: number;
  data: string;
  createdAt: string;
  updatedAt: string;
}
export type CoreView = Pick<
  CoreRow,
  | 'id'
  | 'kind'
  | 'organizationId'
  | 'supplierId'
  | 'sourceId'
  | 'name'
  | 'number'
  | 'deadline'
  | 'createdBy'
  | 'submittedBy'
  | 'status'
  | 'statusChangedAt'
  | 'lifecycleVersion'
  | 'createdAt'
  | 'updatedAt'
> & {
  data: CoreData;
  total: number;
};
export function decodeCore(row: CoreRow): CoreView {
  const data =
    typeof row.data === 'string'
      ? (JSON.parse(row.data) as CoreData)
      : (row.data as CoreData);
  const total = coreAmounts(data).gross;
  return { ...row, data, total };
}
export function coreRoleActions(role: string, kind: CoreKind): CoreAction[] {
  const rules: Record<string, Partial<Record<CoreKind, CoreAction[]>>> = {
    buyer: {
      admission: [
        'view',
        'create',
        'edit',
        'submit',
        'revise',
        'renew',
        'disable',
        'enable',
      ],
      rfq: ['view', 'create', 'edit', 'open', 'nominate', 'revise', 'cancel'],
      quote: ['view'],
      inspection: ['view'],
      return: ['view'],
    },
    approver: Object.fromEntries(
      coreKinds.map((k) => [
        k,
        ['view', ...(k === 'quote' ? [] : ['approve', 'reject'])],
      ]),
    ),
    warehouse: {
      inspection: ['view', 'create', 'edit', 'submit', 'revise'],
      return: ['view', 'create', 'edit', 'submit', 'revise', 'ship', 'cancel'],
    },
    supplier: {
      rfq: ['view'],
      quote: ['view', 'create', 'edit', 'submit', 'withdraw'],
      return: ['view', 'confirm'],
    },
    reader: Object.fromEntries(coreKinds.map((k) => [k, ['view']])),
  };
  return role === 'admin' ? [...coreActions] : (rules[role]?.[kind] ?? []);
}
export const corePaths: Record<CoreKind, string> = {
  admission: '/supply/srm/admissions',
  rfq: '/supply/srm/rfqs',
  quote: '/supply/srm/quotes',
  inspection: '/supply/srm/inspections',
  return: '/supply/srm/returns',
};

export const CoreRowSchema = z.object({
  id: z.string(),
  kind: z.enum(coreKinds),
  organizationId: z.string(),
  supplierId: z.string().nullable(),
  sourceId: z.string(),
  name: z.string(),
  number: z.string(),
  deadline: z.string(),
  createdBy: z.string(),
  submittedBy: z.string(),
  status: z.string(),
  statusChangedAt: z.string(),
  lifecycleVersion: z.number(),
  data: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export function coreAmounts(data: CoreData) {
  let net = 0,
    tax = 0;
  for (const line of data.lines ?? []) {
    const amount = line.quantity * (line.price ?? 0);
    net += amount;
    tax += Math.round((amount * (line.taxRateBps ?? 0)) / 10000);
  }
  return { net, tax, gross: net + tax };
}
