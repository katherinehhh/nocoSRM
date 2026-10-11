import type { FilterAst, FilterNode } from '@nocobase/repository-input';
import { randomUUID } from 'node:crypto';
import type { DatabaseManager, RepositoryPolicy } from '@nocobase/db';
import {
  tables,
  transitions,
  lineKinds,
  initialStatus,
  lineTotals,
  type Kind,
  type Doc,
  type Payload,
  type RunItem,
} from '../../../shared/operations.js';
export class BusinessError extends Error {
  constructor(
    public code: string,
    public field?: string,
  ) {
    super(code);
  }
}
export type Connection = Parameters<
  Parameters<DatabaseManager['transaction']>[0]
>[0];
export interface Actor {
  id: string;
  organizationId: string;
  supplierId: string | null;
  policies: Record<string, RepositoryPolicy | false>;
  system?: boolean;
}
interface Stored extends Omit<Doc, 'payload'> {
  payload: string;
}
const now = () => new Date().toISOString();
const decode = (input: Partial<Stored>): Doc => {
  const row = input as Stored;
  return {
    ...row,
    amount: Number(row.amount),
    version: Number(row.version),
    demo: Boolean(row.demo),
    payload: JSON.parse(row.payload) as Payload,
  };
};
function fail(code: string, field?: string): never {
  throw new BusinessError(code, field);
}
export function documentFilter(actor: Actor) {
  return {
    ...{ organizationId: actor.organizationId },
    ...(actor.supplierId ? { supplierId: actor.supplierId } : {}),
  };
}
const payloadFields: Record<Kind, string[]> = {
  suppliers: ['contact', 'terms'],
  materials: ['unit', 'reorderPoint', 'openingStock', 'warehouseId'],
  warehouses: [],
  plans: ['lines'],
  orders: ['lines', 'sourceId'],
  dispatches: ['orderId', 'lines', 'tracking'],
  receipts: ['orderId', 'lines', 'warehouseId'],
  invoices: ['orderId', 'lines', 'invoiceNumber'],
  settlements: ['orderId', 'receiptId', 'invoiceId'],
  payments: ['settlementId', 'reference'],
  reconciliations: ['from', 'to'],
  taxScenarios: ['inputTax', 'outputTax', 'deductible'],
  policies: ['template', 'threshold', 'timezone', 'validFrom', 'validTo'],
  runs: [],
  tasks: [],
};
export class OperationsService {
  constructor(public db: DatabaseManager) {}
  repo(conn: Connection, table: string, actor: Actor) {
    const repo = conn.repository<Stored>(table);
    if (actor.system) return repo;
    const p = actor.policies[table];
    if (!p) fail('FORBIDDEN');
    return repo.withPolicy(p);
  }
  async get(
    conn: Connection,
    actor: Actor,
    kind: Kind,
    id: string,
  ): Promise<Doc> {
    const row = await this.repo(conn, tables[kind], actor).findOne({
      filter: { id, ...documentFilter(actor) },
    });
    if (!row) fail('NOT_FOUND');
    return decode(row);
  }
  async list(actor: Actor, kind: Kind, query: Record<string, string> = {}) {
    const conn = this.db.connection();
    const page = Math.max(1, Number(query.page) || 1),
      pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const items: FilterNode[] = Object.entries(documentFilter(actor)).map(
      ([key, value]) => ({
        kind: 'condition',
        path: [key],
        operator: '$eq',
        value,
      }),
    );
    if (query.status)
      items.push({
        kind: 'condition',
        path: ['status'],
        operator: '$eq',
        value: query.status,
      });
    if (query.supplierId && !actor.supplierId)
      items.push({
        kind: 'condition',
        path: ['supplierId'],
        operator: '$eq',
        value: query.supplierId,
      });
    if (query.q)
      items.push({
        kind: 'group',
        logic: 'or',
        items: ['name', 'number'].map((key) => ({
          kind: 'condition',
          path: [key],
          operator: '$includes',
          value: query.q,
        })),
      });
    if (query.from)
      items.push({
        kind: 'condition',
        path: ['businessDate'],
        operator: '$gte',
        value: query.from,
      });
    if (query.to)
      items.push({
        kind: 'condition',
        path: ['businessDate'],
        operator: '$lte',
        value: query.to,
      });
    const filter: FilterAst = {
      kind: 'filter',
      version: 1,
      root: { kind: 'group', logic: 'and', items },
    };
    const repo = this.repo(conn, tables[kind], actor);
    const sort = [
      'number',
      'name',
      'amount',
      'businessDate',
      'updatedAt',
    ].includes(query.sort ?? '')
      ? query.sort
      : 'updatedAt';
    const [rows, total] = await Promise.all([
      repo.findMany({
        filter,
        sort: (s) =>
          query.direction === 'asc'
            ? s.field(sort).asc()
            : s.field(sort).desc(),
        offset: (page - 1) * pageSize,
        limit: pageSize,
      }),
      repo.count({ filter }),
    ]);
    return { data: rows.map(decode), meta: { total, page, pageSize } };
  }
  async all(
    conn: Connection,
    actor: Actor,
    kind: Kind,
    extra: Record<string, unknown> = {},
  ): Promise<Doc[]> {
    const rows = await this.repo(conn, tables[kind], actor).findMany({
      filter: { ...documentFilter(actor), ...extra },
      limit: 10000,
    });
    if (rows.length === 10000) fail('TOO_MANY_RECORDS');
    return rows.map(decode);
  }
  async history(actor: Actor, kind: Kind, id: string) {
    const c = this.db.connection();
    await this.get(c, actor, kind, id);
    return c
      .repository('opsAudit')
      .withPolicy(
        actor.policies.opsAudit || {
          read: false,
          create: false,
          update: false,
          delete: false,
        },
      )
      .findMany({
        filter: { documentId: id, kind },
        sort: (s) => s.field('at').desc(),
        limit: 100,
      });
  }
  async audit(
    c: Connection,
    a: Actor,
    k: Kind,
    d: Doc,
    action: string,
    from = '',
  ) {
    await c.repository('opsAudit').createOne({
      values: {
        id: randomUUID(),
        documentId: d.id,
        kind: k,
        actorId: a.id,
        action,
        fromStatus: from,
        toStatus: d.status,
        at: now(),
      },
    });
  }
  async validate(
    c: Connection,
    a: Actor,
    k: Kind,
    input: Partial<Doc>,
  ): Promise<{
    name: string;
    supplierId: string | null;
    businessDate: string;
    notes: string;
    payload: Payload;
    amount: number;
  }> {
    const name = input.name?.trim();
    if (!name || name.length > 200) fail('REQUIRED', 'name');
    const date = input.businessDate ?? now().slice(0, 10);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      Number.isNaN(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date
    )
      fail('INVALID', 'businessDate');
    let supplierId = a.supplierId ?? input.supplierId ?? null;
    const payload: Payload = {};
    for (const key of payloadFields[k])
      if (input.payload?.[key as keyof Payload] !== undefined)
        Object.assign(payload, { [key]: input.payload[key as keyof Payload] });
    if (supplierId) {
      const supplier = await this.get(
        c,
        { ...a, supplierId: null },
        'suppliers',
        supplierId,
      );
      if (supplier.status !== 'active') fail('SUPPLIER_INACTIVE');
    }
    if (
      [
        'orders',
        'dispatches',
        'invoices',
        'settlements',
        'payments',
        'reconciliations',
      ].includes(k) &&
      !supplierId
    )
      fail('REQUIRED', 'supplierId');
    let amount = 0;
    if (lineKinds.includes(k)) {
      if (!payload.lines?.length || payload.lines.length > 100)
        fail('REQUIRED', 'lines');
      const ids = new Set<string>();
      for (const l of payload.lines) {
        if (!l.id) l.id = randomUUID();
        if (ids.has(l.id)) fail('INVALID', 'lines');
        ids.add(l.id);
        if (
          !Number.isFinite(l.quantity) ||
          l.quantity <= 0 ||
          l.quantity > 1e8 ||
          Math.abs(l.quantity * 1000 - Math.round(l.quantity * 1000)) > 1e-6
        )
          fail('INVALID', 'quantity');
        if (
          !Number.isFinite(l.price) ||
          l.price < 0 ||
          l.price > 1e8 ||
          !Number.isFinite(l.taxRate) ||
          l.taxRate < 0 ||
          l.taxRate > 100
        )
          fail('INVALID', 'price');
        await this.get(
          c,
          { ...a, supplierId: null },
          'materials',
          l.materialId,
        );
      }
      Object.assign(payload, lineTotals(payload.lines));
      amount = lineTotals(payload.lines).amount;
      if (!Number.isSafeInteger(amount)) fail('INVALID', 'amount');
      if (
        payload.orderId &&
        new Set(payload.lines.map((l) => l.sourceLineId)).size !==
          payload.lines.length
      )
        fail('INVALID', 'sourceLineId');
    }
    if (payload.orderId) {
      const order = await this.get(c, a, 'orders', payload.orderId);
      if (k === 'receipts' && !supplierId) supplierId = order.supplierId;
      if (order.supplierId !== supplierId) fail('NOT_FOUND');
      if (!['confirmed', 'partial', 'received'].includes(order.status))
        fail('INVALID_STATE');
      for (const line of payload.lines ?? []) {
        const source = order.payload.lines?.find(
          (x) => x.id === line.sourceLineId,
        );
        if (!source || source.materialId !== line.materialId)
          fail('INVALID', 'sourceLineId');
      }
    }
    if (
      ['dispatches', 'receipts', 'invoices', 'settlements'].includes(k) &&
      !payload.orderId
    )
      fail('REQUIRED', 'orderId');
    if (k === 'invoices') {
      if (!payload.invoiceNumber?.trim()) fail('REQUIRED', 'invoiceNumber');
      const duplicate = (await this.all(c, a, k, { supplierId })).find(
        (d) =>
          d.id !== input.id &&
          d.payload.invoiceNumber === payload.invoiceNumber,
      );
      if (duplicate) fail('DUPLICATE_INVOICE');
    }
    if (k === 'payments') {
      if (!payload.settlementId) fail('REQUIRED', 'settlementId');
      const s = await this.get(c, a, 'settlements', payload.settlementId);
      if (s.status !== 'approved' || s.supplierId !== supplierId)
        fail('INVALID_STATE');
      amount = Math.round(Number(input.amount));
      if (!Number.isSafeInteger(amount) || amount <= 0)
        fail('INVALID', 'amount');
      const others = (await this.all(c, a, k, { supplierId })).filter(
        (p) =>
          p.id !== input.id &&
          p.payload.settlementId === s.id &&
          ['pending', 'approved', 'paid'].includes(p.status),
      );
      if (others.reduce((v, p) => v + p.amount, 0) + amount > s.amount)
        fail('OVER_PAYMENT');
    }
    if (k === 'settlements') {
      for (const [key, kind] of [
        ['receiptId', 'receipts'],
        ['invoiceId', 'invoices'],
      ] as const) {
        const id = payload[key];
        if (!id) fail('REQUIRED', key);
        const doc = await this.get(c, a, kind, id);
        if (doc.supplierId !== supplierId && kind !== 'receipts')
          fail('NOT_FOUND');
        if (doc.payload.orderId !== payload.orderId)
          fail('ALLOCATION_CONFLICT');
        if (kind === 'invoices') amount = doc.amount;
      }
    }
    if (k === 'reconciliations') {
      if (!payload.from || !payload.to || payload.from > payload.to)
        fail('INVALID', 'from');
    }
    if (k === 'taxScenarios') {
      for (const key of ['inputTax', 'outputTax', 'deductible'] as const) {
        if (!Number.isFinite(payload[key]) || payload[key]! < 0)
          fail('INVALID', key);
      }
      if (payload.deductible! > 100) fail('INVALID', 'deductible');
    }
    if (k === 'policies') {
      if (
        !['reorder', 'delivery', 'matching', 'payment'].includes(
          payload.template ?? '',
        )
      )
        fail('INVALID', 'template');
      if (!Number.isFinite(payload.threshold) || payload.threshold! < 0)
        fail('INVALID', 'threshold');
      try {
        new Intl.DateTimeFormat('en', {
          timeZone: payload.timezone ?? 'Asia/Shanghai',
        });
      } catch {
        fail('INVALID', 'timezone');
      }
    }
    if (k === 'materials' && input.id) {
      const previous = await this.get(c, a, k, input.id);
      if (previous.payload.openingStock !== payload.openingStock)
        fail('INVALID', 'openingStock');
    }
    if (k === 'materials') {
      if (!payload.unit) fail('REQUIRED', 'unit');
      if ((payload.reorderPoint ?? 0) < 0 || (payload.openingStock ?? 0) < 0)
        fail('INVALID', 'reorderPoint');
    }
    if (k === 'receipts' && payload.orderId)
      supplierId = (await this.get(c, a, 'orders', payload.orderId)).supplierId;
    if (
      k === 'suppliers' &&
      ((payload.terms ?? 30) < 0 || (payload.terms ?? 30) > 365)
    )
      fail('INVALID', 'terms');
    return {
      name,
      supplierId,
      businessDate: date,
      notes: (input.notes ?? '').slice(0, 4000),
      payload,
      amount,
    };
  }
  async persist(
    c: Connection,
    a: Actor,
    k: Kind,
    d: Doc,
    patch: Partial<Doc>,
    action: string,
  ) {
    const next = { ...d, ...patch, version: d.version + 1, updatedAt: now() };
    await this.repo(c, tables[k], a).updateOne({
      filter: { id: d.id, version: d.version, ...documentFilter(a) },
      values: { ...next, payload: JSON.stringify(next.payload) },
    });
    await this.audit(c, a, k, next, action, d.status);
    return next;
  }
  async createIn(
    c: Connection,
    a: Actor,
    k: Kind,
    input: Partial<Doc>,
    demo = false,
  ) {
    const values = await this.validate(c, a, k, input);
    const d: Doc = {
      ...values,
      id: randomUUID(),
      number: `${k.slice(0, 3).toUpperCase()}-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 4).toUpperCase()}`,
      organizationId: a.organizationId,
      status: initialStatus(k),
      version: 1,
      createdBy: a.id,
      createdAt: now(),
      updatedAt: now(),
      demo,
    };
    await this.repo(c, tables[k], a).createOne({
      values: { ...d, payload: JSON.stringify(d.payload) },
    });
    await this.audit(c, a, k, d, 'create');
    return d;
  }
  async create(a: Actor, k: Kind, input: Partial<Doc>, key: string) {
    return this.once(a, key, (c) => this.createIn(c, a, k, input));
  }
  async edit(a: Actor, k: Kind, id: string, input: Partial<Doc>) {
    return this.db.transaction(async (c) => {
      const d = await this.get(c, a, k, id);
      if (d.version !== input.version) fail('VERSION_CONFLICT');
      if (!['draft', 'active', 'disabled'].includes(d.status))
        fail('INVALID_STATE');
      const v = await this.validate(c, a, k, { ...input, id });
      return this.persist(c, a, k, d, v, 'edit');
    });
  }
  async once<T>(
    a: Actor,
    key: string,
    fn: (c: Connection) => Promise<T>,
  ): Promise<T> {
    if (!key || key.length > 240) fail('INVALID', 'requestId');
    return this.db.transaction(async (c) => {
      const id = `${a.id}:${key}`;
      const row = await c
        .repository<{ id: string; result: string }>('opsKeys')
        .findOne({ filter: { id } });
      if (row) return JSON.parse(row.result) as T;
      const result = await fn(c);
      await c
        .repository('opsKeys')
        .createOne({ values: { id, result: JSON.stringify(result) } });
      return result;
    });
  }
  async match(c: Connection, a: Actor, d: Doc): Promise<string[]> {
    const o = await this.get(c, a, 'orders', d.payload.orderId!);
    const i = d.payload.invoiceId
      ? await this.get(c, a, 'invoices', d.payload.invoiceId)
      : d;
    const receipts = d.payload.receiptId
      ? [await this.get(c, a, 'receipts', d.payload.receiptId)]
      : (await this.all(c, a, 'receipts')).filter(
          (r) => r.payload.orderId === o.id && r.status === 'posted',
        );
    const settings = await c
      .repository<{ id: string; payload: string }>('opsSettings')
      .findOne({ filter: { id: 'finance' } });
    const tolerance = settings
      ? Number(
          (JSON.parse(settings.payload) as { tolerance?: number }).tolerance ??
            0,
        )
      : 0;
    const problems: string[] = [];
    if (receipts.some((r) => r.status !== 'posted'))
      problems.push('RECEIPT_NOT_POSTED');
    for (const l of i.payload.lines ?? []) {
      const ol = o.payload.lines?.find((x) => x.id === l.sourceLineId);
      const received = receipts
        .flatMap((r) => r.payload.lines ?? [])
        .filter((x) => x.sourceLineId === l.sourceLineId)
        .reduce((s, x) => s + (x.accepted ?? x.quantity), 0);
      if (
        !ol ||
        Math.abs(Math.round(ol.price * 100) - Math.round(l.price * 100)) >
          tolerance ||
        ol.taxRate !== l.taxRate
      )
        problems.push('PRICE_MISMATCH');
      if (received < l.quantity) problems.push('QUANTITY_MISMATCH');
    }
    return [...new Set(problems)];
  }
  async action(
    a: Actor,
    k: Kind,
    id: string,
    action: string,
    input: {
      version: number;
      requestId: string;
      reason?: string;
      reference?: string;
      businessDate?: string;
    },
  ) {
    if (k === 'runs' && action === 'retry') {
      const prior = await this.get(this.db.connection(), a, 'runs', id);
      if (prior.version !== input.version) fail('VERSION_CONFLICT');
      if (prior.status !== 'failed' || !prior.payload.policyId)
        fail('INVALID_STATE');
      const result = await this.runPolicy(
        a,
        prior.payload.policyId,
        false,
        `retry:${id}:${input.requestId}`,
      );
      if ('id' in result)
        return this.db.transaction((c) =>
          this.persist(
            c,
            a,
            'runs',
            result,
            { payload: { ...result.payload, parentRunId: id } },
            'retry',
          ),
        );
      return result;
    }
    if (k === 'policies' && ['dryRun', 'run'].includes(action)) {
      const policy = await this.get(this.db.connection(), a, k, id);
      if (policy.version !== input.version) fail('VERSION_CONFLICT');
      return this.runPolicy(a, id, action === 'dryRun', input.requestId);
    }
    return this.once(
      a,
      `${k}:${id}:${action}:${input.requestId}`,
      async (c) => {
        const d = await this.get(c, a, k, id);
        if (d.version !== input.version) fail('VERSION_CONFLICT');
        const rule = transitions[k]?.[action];
        if (!rule || !rule.from.includes(d.status)) fail('INVALID_STATE');
        if (
          ['approve', 'review'].includes(action) &&
          (d.createdBy === a.id || d.payload.submittedBy === a.id)
        )
          fail('SELF_APPROVAL');
        if (['reject', 'dispute'].includes(action) && !input.reason?.trim())
          fail('REQUIRED', 'reason');
        let status = rule.to;
        let payload = { ...d.payload };
        if (action === 'submit') payload.submittedBy = a.id;
        if (['approve', 'review'].includes(action)) payload.approvedBy = a.id;
        if (input.reason) payload.reason = input.reason;
        if (k === 'plans' && action === 'convert') {
          if (!d.supplierId) fail('REQUIRED', 'supplierId');
          const order = await this.createIn(c, a, 'orders', {
            name: d.name,
            supplierId: d.supplierId,
            businessDate: d.businessDate,
            payload: { sourceId: d.id, lines: d.payload.lines },
          });
          payload.sourceId = order.id;
        }
        if (k === 'dispatches' && action === 'ship') {
          const order = await this.get(c, a, 'orders', d.payload.orderId!);
          const shipments = (await this.all(c, a, k)).filter(
            (x) =>
              x.payload.orderId === order.id &&
              ['shipped', 'arrived'].includes(x.status),
          );
          for (const l of d.payload.lines ?? []) {
            const total =
              shipments
                .flatMap((x) => x.payload.lines ?? [])
                .filter((x) => x.sourceLineId === l.sourceLineId)
                .reduce((s, x) => s + x.quantity, 0) + l.quantity;
            const ol = order.payload.lines?.find(
              (x) => x.id === l.sourceLineId,
            );
            if (!ol || total > ol.quantity) fail('OVER_QUANTITY');
          }
        }
        if (k === 'receipts' && action === 'post') {
          const order = await this.get(c, a, 'orders', d.payload.orderId!);
          if (!['confirmed', 'partial'].includes(order.status))
            fail('INVALID_STATE');
          const receipts = (await this.all(c, a, k)).filter(
            (x) => x.payload.orderId === order.id && x.status === 'posted',
          );
          let complete = true;
          for (const ol of order.payload.lines ?? []) {
            const prior = receipts
              .flatMap((x) => x.payload.lines ?? [])
              .filter((x) => x.sourceLineId === ol.id)
              .reduce((s, x) => s + (x.accepted ?? x.quantity), 0);
            const incoming = (d.payload.lines ?? [])
              .filter((l) => l.sourceLineId === ol.id)
              .reduce((s, l) => s + (l.accepted ?? l.quantity), 0);
            if (prior + incoming > ol.quantity) fail('OVER_QUANTITY');
            if (prior + incoming < ol.quantity) complete = false;
          }
          for (const l of d.payload.lines ?? []) {
            const accepted = l.accepted ?? l.quantity,
              rejected = l.rejected ?? 0;
            if (
              accepted < 0 ||
              rejected < 0 ||
              accepted + rejected !== l.quantity
            )
              fail('INVALID', 'accepted');
            const wid = l.warehouseId ?? d.payload.warehouseId;
            if (!wid) fail('REQUIRED', 'warehouseId');
            await this.get(c, { ...a, supplierId: null }, 'warehouses', wid);
            await c.repository('opsStock').createOne({
              values: {
                id: `${d.id}:${l.id}`,
                sourceId: d.id,
                materialId: l.materialId,
                warehouseId: wid,
                quantityMilli: Math.round(accepted * 1000),
                at: now(),
              },
            });
          }
          await this.persist(
            c,
            a,
            'orders',
            order,
            { status: complete ? 'received' : 'partial' },
            'receive',
          );
        }
        if ((k === 'invoices' || k === 'settlements') && action === 'match') {
          const conflicts = await this.match(c, a, d);
          payload = { ...payload, conflicts, matched: !conflicts.length };
          status = conflicts.length ? 'disputed' : 'matched';
        }
        if (k === 'settlements' && action === 'approve') {
          if ((await this.match(c, a, d)).length) fail('ALLOCATION_CONFLICT');
          const other = (await this.all(c, a, k)).find(
            (x) =>
              x.id !== id &&
              x.status === 'approved' &&
              (x.payload.receiptId === d.payload.receiptId ||
                x.payload.invoiceId === d.payload.invoiceId),
          );
          if (other) fail('ALLOCATION_CONFLICT');
        }
        if (
          k === 'payments' &&
          ['submit', 'approve', 'record'].includes(action)
        ) {
          await this.validate(c, a, k, d);
          if (action === 'record') {
            if (!input.reference?.trim() || !input.businessDate)
              fail('REQUIRED', 'reference');
            payload.reference = input.reference;
          }
        }
        if (k === 'reconciliations' && action === 'publish') {
          const settlements = (
            await this.all(c, a, 'settlements', { supplierId: d.supplierId })
          ).filter((s) => s.status === 'approved');
          const payments = (
            await this.all(c, a, 'payments', { supplierId: d.supplierId })
          ).filter((p) => p.status === 'paid');
          const from = payload.from!,
            to = payload.to!;
          const before = (docs: Doc[]) =>
            docs
              .filter((x) => x.businessDate < from)
              .reduce((v, x) => v + x.amount, 0);
          const period = (docs: Doc[]) =>
            docs
              .filter((x) => x.businessDate >= from && x.businessDate <= to)
              .reduce((v, x) => v + x.amount, 0);
          payload = {
            ...payload,
            opening: before(settlements) - before(payments),
            net: period(settlements),
            paid: period(payments),
          };
          payload.closing = payload.opening! + payload.net! - payload.paid!;
        }
        if (k === 'reconciliations' && action === 'revise') {
          const next = await this.createIn(c, a, k, {
            ...d,
            name: `${d.name} · R`,
            payload: { from: payload.from, to: payload.to },
          });
          await this.audit(c, a, k, d, 'revise', d.status);
          return next;
        }
        if (k === 'taxScenarios' && action === 'calculate')
          payload.calculated = Math.round(
            (payload.outputTax ?? 0) * 100 -
              ((payload.inputTax ?? 0) * 100 * (payload.deductible ?? 0)) / 100,
          );
        return this.persist(
          c,
          a,
          k,
          d,
          {
            status,
            payload,
            ...(k === 'payments' && action === 'record'
              ? { businessDate: input.businessDate }
              : {}),
          },
          action,
        );
      },
    );
  }
  async stock(a: Actor) {
    const c = this.db.connection();
    const materials = await this.all(c, a, 'materials');
    const result = [];
    for (const m of materials) {
      const entries = await c
        .repository<{ materialId: string; quantityMilli: number }>('opsStock')
        .withPolicy(
          a.policies.opsStock || {
            read: false,
            create: false,
            update: false,
            delete: false,
          },
        )
        .findMany({ filter: { materialId: m.id }, limit: 10000 });
      result.push({
        ...m,
        stock:
          (m.payload.openingStock ?? 0) +
          entries.reduce((n, e) => n + Number(e.quantityMilli) / 1000, 0),
      });
    }
    return result;
  }
  async preview(c: Connection, a: Actor, policy: Doc): Promise<RunItem[]> {
    const { template, threshold = 3 } = policy.payload;
    let targets: Doc[] = [];
    let kind: Kind = 'orders';
    if (template === 'reorder') {
      kind = 'materials';
      targets = await this.all(c, a, kind);
      const ledger = await c
        .repository<{ materialId: string; quantityMilli: number }>('opsStock')
        .findMany({ limit: 10000 });
      targets = targets.filter(
        (m) =>
          (m.payload.openingStock ?? 0) +
            ledger
              .filter((x) => x.materialId === m.id)
              .reduce((v, x) => v + Number(x.quantityMilli) / 1000, 0) <
          (m.payload.reorderPoint ?? threshold),
      );
    }
    if (template === 'delivery')
      targets = (await this.all(c, a, 'orders')).filter(
        (o) =>
          ['approved', 'confirmed', 'partial'].includes(o.status) &&
          Date.parse(o.businessDate) <= Date.now() + threshold * 86400000,
      );
    if (template === 'matching') {
      kind = 'invoices';
      targets = (await this.all(c, a, kind)).filter(
        (i) => i.status === 'disputed',
      );
    }
    if (template === 'payment') {
      kind = 'settlements';
      targets = (await this.all(c, a, kind)).filter(
        (s) =>
          s.status === 'approved' &&
          Date.parse(s.businessDate) <= Date.now() + threshold * 86400000,
      );
    }
    return targets.map((t) => ({
      targetId: t.id,
      kind,
      action: template ?? 'reorder',
      status: 'preview',
    }));
  }
  async executePolicy(a: Actor, id: string, dry: boolean, key: string) {
    if (dry)
      return this.db.transaction(async (c) => {
        const policy = await this.get(c, a, 'policies', id);
        return { items: await this.preview(c, a, policy), dryRun: true };
      });
    return this.once(a, `policy:${id}:${key}`, async (c) => {
      const policy = await this.get(c, a, 'policies', id);
      if (policy.status !== 'enabled') fail('POLICY_DISABLED');
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: policy.payload.timezone ?? 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(new Date());
      const part = (type: string) => parts.find((p) => p.type === type)!.value;
      const today = `${part('year')}-${part('month')}-${part('day')}`;
      if (
        (policy.payload.validFrom && today < policy.payload.validFrom) ||
        (policy.payload.validTo && today > policy.payload.validTo)
      )
        fail('INVALID_STATE');
      const items = await this.preview(c, a, policy);
      for (const item of items) {
        const effectKey = `effect:${id}:${policy.version}:${item.targetId}:${item.action}`;
        const prior = await c
          .repository('opsKeys')
          .findOne({ filter: { id: effectKey } });
        if (prior) {
          item.status = 'skipped';
          continue;
        }
        const target = await this.get(c, a, item.kind, item.targetId);
        let result: Doc;
        if (item.action === 'payment') {
          const existing = (await this.all(c, a, 'payments')).some(
            (p) => p.payload.settlementId === target.id,
          );
          if (existing) {
            item.status = 'skipped';
            continue;
          }
          result = await this.createIn(c, a, 'payments', {
            name: target.name,
            supplierId: target.supplierId,
            amount: target.amount,
            businessDate: target.businessDate,
            payload: { settlementId: target.id },
          });
        } else {
          result = await this.createIn(c, a, 'tasks', {
            name: target.name,
            supplierId: target.supplierId,
            businessDate: target.businessDate,
            notes: policy.name,
          });
          result = await this.persist(
            c,
            a,
            'tasks',
            result,
            {
              payload: {
                sourceId: target.id,
                template: item.action,
                policyId: id,
              },
            },
            'generate',
          );
        }
        item.resultId = result.id;
        item.status = 'succeeded';
        await c.repository('opsKeys').createOne({
          values: {
            id: effectKey,
            result: JSON.stringify({ id: result.id }),
          },
        });
      }
      let run = await this.createIn(c, a, 'runs', { name: policy.name });
      run = await this.persist(
        c,
        a,
        'runs',
        run,
        {
          status: items.every((i) => i.status === 'skipped')
            ? 'skipped'
            : 'succeeded',
          payload: {
            policyId: id,
            items,
            trigger: a.system ? 'scheduled' : 'manual',
          },
        },
        'finish',
      );
      return run;
    });
  }
  async runPolicy(a: Actor, id: string, dry: boolean, key: string) {
    try {
      return await this.executePolicy(a, id, dry, key);
    } catch (error) {
      if (
        dry ||
        (error instanceof BusinessError &&
          [
            'FORBIDDEN',
            'NOT_FOUND',
            'POLICY_DISABLED',
            'INVALID_STATE',
          ].includes(error.code))
      )
        throw error;
      return this.once(a, `failed:${id}:${key}`, async (c) => {
        const policy = await this.get(c, a, 'policies', id);
        const run = await this.createIn(c, a, 'runs', { name: policy.name });
        return this.persist(
          c,
          a,
          'runs',
          run,
          {
            status: 'failed',
            payload: {
              policyId: id,
              reason:
                error instanceof BusinessError
                  ? error.code
                  : 'EXECUTION_FAILED',
              trigger: a.system ? 'scheduled' : 'manual',
            },
          },
          'fail',
        );
      });
    }
  }
  async scheduled() {
    const a: Actor = {
      id: 'operations-scheduler',
      organizationId: 'main',
      supplierId: null,
      policies: {},
      system: true,
    };
    const settings = await this.db
      .repository<{ id: string; payload: string }>('opsSettings')
      .findOne({ filter: { id: 'automation' } });
    if (settings) {
      const config = JSON.parse(settings.payload) as {
        timezone?: string;
        start?: string;
        end?: string;
      };
      const time = new Intl.DateTimeFormat('en-GB', {
        timeZone: config.timezone ?? 'Asia/Shanghai',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(new Date());
      const start = config.start ?? '00:00',
        end = config.end ?? '23:59';
      if (
        start <= end ? time < start || time > end : time < start && time > end
      )
        return [];
    }
    const list = await this.all(this.db.connection(), a, 'policies', {
      status: 'enabled',
    });
    const results = [];
    for (const p of list) {
      try {
        results.push(
          await this.runPolicy(
            a,
            p.id,
            false,
            `${p.id}:${Math.floor(Date.now() / 300000)}`,
          ),
        );
      } catch (error) {
        await this.db.transaction(async (c) => {
          let run = await this.createIn(c, a, 'runs', { name: p.name });
          run = await this.persist(
            c,
            a,
            'runs',
            run,
            {
              status: 'failed',
              payload: {
                policyId: p.id,
                reason:
                  error instanceof BusinessError
                    ? error.code
                    : 'EXECUTION_FAILED',
                trigger: 'scheduled',
              },
            },
            'fail',
          );
          results.push(run);
        });
      }
    }
    return results;
  }
}
