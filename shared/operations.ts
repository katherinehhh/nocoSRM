export const kinds = [
  'suppliers',
  'materials',
  'warehouses',
  'plans',
  'orders',
  'dispatches',
  'receipts',
  'invoices',
  'settlements',
  'payments',
  'reconciliations',
  'taxScenarios',
  'policies',
  'runs',
  'tasks',
] as const;
export type Kind = (typeof kinds)[number];
export const tables: Record<Kind, string> = Object.fromEntries(
  kinds.map((k) => [k, `ops${k[0].toUpperCase()}${k.slice(1)}`]),
) as Record<Kind, string>;
export interface Line {
  id: string;
  materialId: string;
  sourceLineId?: string;
  quantity: number;
  price: number;
  taxRate: number;
  accepted?: number;
  rejected?: number;
  warehouseId?: string;
}
export interface Payload {
  lines?: Line[];
  sourceId?: string;
  orderId?: string;
  expectedDeliveryDate?: string;
  receiptId?: string;
  invoiceId?: string;
  settlementId?: string;
  warehouseId?: string;
  contact?: string;
  terms?: number;
  unit?: string;
  reorderPoint?: number;
  openingStock?: number;
  tracking?: string;
  reference?: string;
  invoiceNumber?: string;
  reason?: string;
  from?: string;
  to?: string;
  inputTax?: number;
  outputTax?: number;
  deductible?: number;
  template?: string;
  threshold?: number;
  timezone?: string;
  validFrom?: string;
  validTo?: string;
  items?: RunItem[];
  parentRunId?: string;
  policyId?: string;
  net?: number;
  tax?: number;
  paid?: number;
  opening?: number;
  closing?: number;
  requesterId?: string;
  submittedBy?: string;
  approvedBy?: string;
  calculated?: number;
  matched?: boolean;
  conflicts?: string[];
  trigger?: string;
  lastRunAt?: string;
}
export interface RunItem {
  targetId: string;
  kind: Kind;
  action: string;
  status: string;
  reason?: string;
  resultId?: string;
}
export interface Doc {
  id: string;
  number: string;
  name: string;
  organizationId: string;
  supplierId: string | null;
  status: string;
  version: number;
  amount: number;
  businessDate: string;
  notes: string;
  payload: Payload;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  demo: boolean;
  admissionRequired?: boolean;
  qualityRequired?: boolean;
}
export interface Transition {
  from: string[];
  to: string;
  roles: string[];
}
const transition = (
  from: string[],
  to: string,
  roles: string[],
): Transition => ({ from, to, roles });
export const transitions: Partial<Record<Kind, Record<string, Transition>>> = {
  plans: {
    submit: transition(['draft'], 'pending', ['planner']),
    approve: transition(['pending'], 'approved', ['buyer']),
    reject: transition(['pending'], 'draft', ['buyer']),
    convert: transition(['approved'], 'completed', ['buyer']),
  },
  orders: {
    submit: transition(['draft'], 'pending', ['buyer']),
    approve: transition(['pending'], 'approved', ['admin', 'approver']),
    reject: transition(['pending'], 'draft', ['admin', 'approver']),
    confirm: transition(['approved'], 'confirmed', ['supplier']),
    close: transition(['received'], 'closed', ['buyer']),
  },
  dispatches: {
    ship: transition(['draft'], 'shipped', ['supplier']),
    arrive: transition(['shipped'], 'arrived', ['warehouse']),
  },
  receipts: { post: transition(['draft'], 'posted', ['warehouse']) },
  invoices: {
    submit: transition(['draft'], 'pending', ['supplier', 'finance']),
    match: transition(['pending', 'disputed'], 'matched', ['finance']),
    reject: transition(['pending', 'disputed'], 'draft', ['finance']),
  },
  settlements: {
    match: transition(['draft', 'disputed'], 'matched', ['finance']),
    submit: transition(['matched'], 'pending', ['finance']),
    approve: transition(['pending'], 'approved', ['approver']),
    reject: transition(['pending'], 'draft', ['approver']),
  },
  payments: {
    submit: transition(['draft'], 'pending', ['finance']),
    approve: transition(['pending'], 'approved', ['approver']),
    reject: transition(['pending'], 'draft', ['approver']),
    record: transition(['approved'], 'paid', ['finance']),
  },
  reconciliations: {
    publish: transition(['draft'], 'pending', ['finance']),
    confirm: transition(['pending'], 'confirmed', ['supplier']),
    dispute: transition(['pending'], 'disputed', ['supplier']),
    revise: transition(['disputed'], 'draft', ['finance']),
  },
  taxScenarios: {
    calculate: transition(['draft', 'calculated'], 'calculated', ['finance']),
    submit: transition(['calculated'], 'pending', ['finance']),
    review: transition(['pending'], 'reviewed', ['approver']),
    reject: transition(['pending'], 'draft', ['approver']),
  },
  policies: {
    enable: transition(['disabled'], 'enabled', ['policy']),
    disable: transition(['enabled'], 'disabled', ['policy']),
    run: transition(['enabled'], 'enabled', ['policy']),
    dryRun: transition(['disabled', 'enabled'], 'disabled', ['policy']),
  },
  runs: { retry: transition(['failed'], 'failed', ['policy']) },
  tasks: {
    complete: transition(['open'], 'completed', [
      'planner',
      'buyer',
      'warehouse',
      'finance',
      'approver',
      'policy',
    ]),
  },
  suppliers: {
    disable: transition(['active'], 'inactive', ['buyer']),
    enable: transition(['inactive'], 'active', ['buyer']),
  },
  materials: {
    disable: transition(['active'], 'inactive', ['buyer']),
    enable: transition(['inactive'], 'active', ['buyer']),
  },
  warehouses: {
    disable: transition(['active'], 'inactive', ['warehouse']),
    enable: transition(['inactive'], 'active', ['warehouse']),
  },
};
export const writers: Record<Kind, string[]> = {
  suppliers: ['buyer'],
  materials: ['buyer'],
  warehouses: ['warehouse'],
  plans: ['planner'],
  orders: ['buyer'],
  dispatches: ['supplier'],
  receipts: ['warehouse'],
  invoices: ['supplier', 'finance'],
  settlements: ['finance'],
  payments: ['finance'],
  reconciliations: ['finance'],
  taxScenarios: ['finance'],
  policies: ['policy'],
  runs: [],
  tasks: [],
};
export const portalKinds: Kind[] = [
  'orders',
  'dispatches',
  'invoices',
  'reconciliations',
  'payments',
];
export const lineKinds: Kind[] = [
  'plans',
  'orders',
  'dispatches',
  'receipts',
  'invoices',
];
export const captions: Record<Kind, [string, string]> = {
  suppliers: ['供应商', 'Suppliers'],
  materials: ['物料', 'Materials'],
  warehouses: ['仓库', 'Warehouses'],
  plans: ['需求计划', 'Demand plans'],
  orders: ['采购订单', 'Purchase orders'],
  dispatches: ['交付调度', 'Delivery dispatches'],
  receipts: ['收货与库存', 'Receipts and inventory'],
  invoices: ['发票管理', 'Invoices'],
  settlements: ['结算中心', 'Settlements'],
  payments: ['付款管理', 'Payments'],
  reconciliations: ['对账中心', 'Reconciliations'],
  taxScenarios: ['税务测算', 'Tax scenarios'],
  policies: ['策略配置', 'Policies'],
  runs: ['自动运行工作台', 'Automation workbench'],
  tasks: ['业务待办', 'Business tasks'],
};
export const initialStatus = (kind: Kind): string =>
  ['suppliers', 'materials', 'warehouses'].includes(kind)
    ? 'active'
    : kind === 'policies'
      ? 'disabled'
      : kind === 'tasks'
        ? 'open'
        : 'draft';
export function lineTotals(lines: Line[]): {
  net: number;
  tax: number;
  amount: number;
} {
  let net = 0,
    tax = 0;
  for (const l of lines) {
    const n = Math.round(
      (Math.round(l.quantity * 1000) * Math.round(l.price * 100)) / 1000,
    );
    net += n;
    tax += Math.round((n * Math.round(l.taxRate * 100)) / 10000);
  }
  return { net, tax, amount: net + tax };
}
export const roleNames: Record<string, [string, string]> = {
  reader: ['运营查看', 'Operations reader'],
  planner: ['计划员', 'Planner'],
  buyer: ['采购员', 'Buyer'],
  warehouse: ['仓储员', 'Warehouse operator'],
  finance: ['财务经办', 'Finance clerk'],
  approver: ['财务审批', 'Finance approver'],
  policy: ['策略管理员', 'Policy administrator'],
  supplier: ['供应商成员', 'Supplier member'],
  admin: ['运营管理员', 'Operations administrator'],
};
