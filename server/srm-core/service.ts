import { awardDirectory } from './approval-directory.js';
import type { ApprovalDirectory } from '@nocobase/app-plugin-approval/server';
import type { AwardService } from './award-service.js';
import { randomUUID, createHash } from 'node:crypto';
import type { DatabaseManager, RepositoryPolicy } from '@nocobase/db';
import type { FilterAst, FilterNode } from '@nocobase/repository-input';
import { ApiError } from '@nocobase/app-server/router';
import type { LifecycleRuntime, JsonObject } from '@nocobase/lifecycle';
import { coreContext } from './policy-context.js';
import {
  CoreInput,
  CoreRowSchema,
  decodeCore,
  type CoreKind,
  type CoreRow,
  type CoreData,
  type CoreView,
} from '../../shared/srm-core.js';
import {
  OperationsService,
  type Actor,
  type Connection,
} from '../providers/operations/service.js';
import type { Doc } from '../../shared/operations.js';
export interface CoreActor extends Actor {
  directory?: ApprovalDirectory;
  awardEnabled?: boolean;
  awardPeople?: { id: string; name: string }[];
  permissions: Record<CoreKind, string[]>;
}
export function coreFail(
  reason: string,
  status:
    | 'FAILED_PRECONDITION'
    | 'PERMISSION_DENIED'
    | 'NOT_FOUND'
    | 'ABORTED' = 'FAILED_PRECONDITION',
  metadata?: Readonly<Record<string, unknown>>,
): never {
  throw new ApiError({
    status,
    reason,
    domain: 'srmCore',
    message: reason,
    metadata,
  });
}
export const appendFilter = (
  base: FilterAst,
  extra: FilterNode[],
): FilterAst => ({
  kind: 'filter',
  version: 1,
  root: { kind: 'group', logic: 'and', items: [base.root, ...extra] },
});
export const statusFilter = (values: string[]): FilterNode => ({
  kind: 'group',
  logic: 'or',
  items: values.map((value) => ({
    kind: 'condition',
    path: ['status'],
    operator: '$eq',
    value,
  })),
});
export const today = () => new Date().toISOString().slice(0, 10);
export function validDate(s: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !Number.isNaN(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s
  );
}
const hash = (v: unknown) =>
  createHash('sha256').update(JSON.stringify(v)).digest('hex');
const data = (row: CoreRow): CoreData => decodeCore(row).data;
const whole = (n: number) => Number.isInteger(n) && n >= 0;
export class CoreService {
  award?: AwardService;
  constructor(
    readonly db: DatabaseManager,
    readonly runtime: LifecycleRuntime,
    readonly ops: OperationsService,
  ) {}
  repo(c: Connection, a: CoreActor) {
    const p = a.policies.srmCoreRecords;
    if (!p) coreFail('FORBIDDEN', 'PERMISSION_DENIED');
    return c.repository<CoreRow>('srmCoreRecords').withPolicy(p);
  }
  async filter(c: Connection, a: CoreActor, kind: CoreKind) {
    const base: Record<string, string | string[]> = {
      organizationId: a.organizationId,
      kind,
    };
    if (a.supplierId) {
      if (kind === 'rfq') {
        const invites = await c
          .repository<{
            rfqId: string;
            organizationId: string;
            supplierId: string;
          }>('srmCoreInvitations')
          .findMany({
            filter: {
              organizationId: a.organizationId,
              supplierId: a.supplierId,
            },
            limit: 10001,
          });
        if (invites.length > 10000) coreFail('LIMIT');
        base.id = invites.map((r) => r.rfqId);
      } else if (['quote', 'return'].includes(kind))
        base.supplierId = a.supplierId;
      else coreFail('FORBIDDEN', 'PERMISSION_DENIED');
    }
    return {
      kind: 'filter',
      version: 1,
      root: {
        kind: 'group',
        logic: 'and',
        items: Object.entries(base).map(([key, value]) =>
          Array.isArray(value)
            ? {
                kind: 'group',
                logic: 'or',
                items: (value.length ? value : ['__none__']).map((id) => ({
                  kind: 'condition',
                  path: [key],
                  operator: '$eq',
                  value: id,
                })),
              }
            : { kind: 'condition', path: [key], operator: '$eq', value },
        ),
      },
    } satisfies FilterAst;
  }
  async get(c: Connection, a: CoreActor, kind: CoreKind, id: string) {
    const row = await this.repo(c, a).findOne({
      filter: appendFilter(await this.filter(c, a, kind), [
        { kind: 'condition', path: ['id'], operator: '$eq', value: id },
      ]),
    });
    if (!row) coreFail('NOT_FOUND', 'NOT_FOUND');
    // findOne id cannot overwrite the invitation scope above.
    if (a.supplierId && kind === 'rfq') {
      const allowed = await c.repository('srmCoreInvitations').findOne({
        filter: {
          rfqId: id,
          supplierId: a.supplierId,
          organizationId: a.organizationId,
        },
      });
      if (!allowed) coreFail('NOT_FOUND', 'NOT_FOUND');
    }
    return CoreRowSchema.parse(row);
  }
  async parent(c: Connection, kind: CoreKind, id: string, org: string) {
    const caller = coreContext.getStore();
    if (!caller || caller.organizationId !== org)
      coreFail('FORBIDDEN', 'PERMISSION_DENIED');
    const row = await this.repo(c, caller).findOne({
      filter: { id, kind, organizationId: org },
    });
    if (!row) coreFail('SOURCE_CHANGED');
    return CoreRowSchema.parse(row);
  }
  async list(a: CoreActor, kind: CoreKind, q: Record<string, string>) {
    const c = this.db.connection(),
      base = await this.filter(c, a, kind);
    const conditions: FilterNode[] = [base.root];
    if (q.status)
      conditions.push({
        kind: 'condition',
        path: ['status'],
        operator: '$eq',
        value: q.status,
      });
    if (q.q)
      conditions.push({
        kind: 'group',
        logic: 'or',
        items: ['name', 'number'].map((k) => ({
          kind: 'condition',
          path: [k],
          operator: '$includes',
          value: q.q,
        })),
      });
    const filter: FilterAst = {
      kind: 'filter',
      version: 1,
      root: { kind: 'group', logic: 'and', items: conditions },
    };
    const page = Math.max(1, Number(q.page) || 1),
      pageSize = 20,
      sort = ['updatedAt', 'deadline', 'name', 'number'].includes(q.sort)
        ? q.sort
        : 'updatedAt',
      repo = this.repo(c, a);
    const [rows, total] = await Promise.all([
      repo.findMany({
        filter,
        sort: (s) =>
          q.direction === 'asc' ? s.field(sort).asc() : s.field(sort).desc(),
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
      repo.count({ filter }),
    ]);
    return {
      data: await Promise.all(
        rows.map((r) => this.public(c, a, CoreRowSchema.parse(r))),
      ),
      meta: { total, page, pageSize },
    };
  }
  async public(c: Connection, a: CoreActor, row: CoreRow) {
    const result = decodeCore(row);
    if (a.supplierId && row.kind === 'rfq') {
      const own = await c.repository<CoreRow>('srmCoreRecords').findOne({
        filter: {
          kind: 'quote',
          organizationId: a.organizationId,
          supplierId: a.supplierId,
          sourceId: row.id,
        },
      });
      result.data = {
        lines: result.data.lines,
        publishedVersion: result.data.publishedVersion,
        supplierIds: [a.supplierId],
        ...(own && own.id === result.data.selectedQuoteId
          ? { selectedQuoteId: own.id, orderId: result.data.orderId }
          : {}),
      };
    }
    return result;
  }
  async doc(
    c: Connection,
    row: CoreRow,
    kind: 'suppliers' | 'materials' | 'orders' | 'receipts',
    id: string,
  ) {
    const caller = coreContext.getStore();
    if (!caller || caller.organizationId !== row.organizationId)
      coreFail('FORBIDDEN', 'PERMISSION_DENIED');
    const scoped = {
      ...caller,
      supplierId:
        kind === 'suppliers' || kind === 'materials' ? null : caller.supplierId,
    };
    if (caller.supplierId && kind === 'suppliers' && id !== caller.supplierId)
      coreFail('NOT_FOUND', 'NOT_FOUND');
    return this.ops.get(c, scoped, kind, id);
  }
  async supplier(c: Connection, row: CoreRow, id: string) {
    const s = await this.doc(c, row, 'suppliers', id);
    if (s.status !== 'active') coreFail('SUPPLIER_INACTIVE');
    if (s.admissionRequired) {
      const admission = await c.repository<CoreRow>('srmCoreRecords').findOne({
        filter: {
          kind: 'admission',
          sourceId: s.id,
          status: 'approved',
          organizationId: row.organizationId,
        },
      });
      if (
        !admission ||
        !data(admission).validUntil ||
        data(admission).validUntil! < today()
      )
        coreFail('QUALIFICATION_EXPIRED');
    }
    return s;
  }
  async validate(
    c: Connection,
    row: CoreRow,
    action: string,
    input: Record<string, unknown>,
    actorId: string,
  ) {
    const d = data(row);
    if (
      row.kind === 'rfq' &&
      ['purchasingReview', 'departmentReview'].includes(row.status) &&
      ['approve', 'reject'].includes(action)
    ) {
      const current = await awardDirectory(
        c,
        this.award!.services,
        row.organizationId,
      );
      if (!current.directory.isActive(actorId))
        coreFail('FORBIDDEN', 'PERMISSION_DENIED');
    }
    if (
      action === 'cancel' &&
      ['purchasingReview', 'departmentReview'].includes(row.status) &&
      actorId !== row.submittedBy
    )
      coreFail('FORBIDDEN', 'PERMISSION_DENIED');
    if (
      ['approve', 'reject'].includes(action) &&
      (row.createdBy === actorId || row.submittedBy === actorId)
    )
      coreFail('SELF_APPROVAL', 'PERMISSION_DENIED');
    if (
      'requestKey' in input &&
      ['reject', 'cancel', 'nominate'].includes(action) &&
      !(typeof input.reason === 'string' ? input.reason : '').trim()
    )
      coreFail('REASON_REQUIRED');
    if (
      ['edit', 'revise', 'withdraw'].includes(action) &&
      row.kind === 'quote' &&
      row.createdBy !== actorId
    )
      coreFail('FORBIDDEN', 'PERMISSION_DENIED');
    if (['reject', 'cancel', 'revise', 'disable', 'renew'].includes(action))
      return;
    if (action === 'edit') {
      if ('requestKey' in input && !input.values) coreFail('INVALID');
      return;
    }
    if (row.kind === 'admission') {
      await this.doc(c, row, 'suppliers', row.sourceId);
      if (
        !d.evidence?.trim() ||
        !d.qualification?.trim() ||
        !validDate(d.validUntil ?? '') ||
        d.validUntil! < today()
      )
        coreFail('QUALIFICATION_REQUIRED');
    }
    if (row.kind === 'rfq') {
      if (
        !validDate(row.deadline) ||
        (!['nominate', 'approve'].includes(action) && row.deadline < today())
      )
        coreFail('DEADLINE_EXPIRED');
      if (
        !d.lines?.length ||
        !d.supplierIds?.length ||
        new Set(d.supplierIds).size !== d.supplierIds.length
      )
        coreFail('LINES_REQUIRED');
      if (!['nominate', 'approve'].includes(action))
        for (const id of d.supplierIds) await this.supplier(c, row, id);
      if (action === 'nominate' || action === 'approve') {
        if (action === 'nominate' && !input.selectedQuoteId) {
          if ('requestKey' in input) coreFail('QUOTE_REQUIRED');
          return;
        }
        const selected = String(
          action === 'nominate' ? input.selectedQuoteId : d.selectedQuoteId,
        );
        const q = await this.parent(c, 'quote', selected, row.organizationId),
          qd = data(q);
        if (
          q.sourceId !== row.id ||
          q.status !== 'submitted' ||
          !d.supplierIds.includes(q.supplierId!)
        )
          coreFail('QUOTE_CHANGED');
        if (
          action === 'approve' &&
          q.lifecycleVersion !== d.selectedQuoteVersion
        )
          coreFail('QUOTE_CHANGED');
        if (!validDate(qd.validUntil ?? '') || qd.validUntil! < today())
          coreFail('DEADLINE_EXPIRED');
        await this.supplier(c, row, q.supplierId!);
      }
    }
    if (row.kind === 'quote') {
      const rfq = await this.parent(c, 'rfq', row.sourceId, row.organizationId),
        rd = data(rfq);
      if (
        rfq.status !== 'open' ||
        rfq.deadline < today() ||
        !rd.supplierIds?.includes(row.supplierId!)
      )
        coreFail('RFQ_CLOSED');
      if (d.sourceVersion !== (rd.publishedVersion ?? rfq.lifecycleVersion))
        coreFail('SOURCE_CHANGED');
      await this.supplier(c, row, row.supplierId!);
      if (
        !validDate(d.validUntil ?? '') ||
        d.validUntil! < today() ||
        !validDate(d.deliveryDate ?? '') ||
        d.deliveryDate! < today()
      )
        coreFail('INVALID_DATE');
      this.matchLines(d.lines ?? [], rd.lines ?? []);
      if ((d.lines ?? []).some((l) => !l.price || l.taxRateBps === undefined))
        coreFail('PRICE_REQUIRED');
      if (decodeCore(row).total > 2147483647) coreFail('AMOUNT_LIMIT');
    }
    if (row.kind === 'inspection') {
      const receipt = await this.doc(c, row, 'receipts', row.sourceId);
      if (receipt.status !== 'draft' || receipt.version !== d.sourceVersion)
        coreFail('SOURCE_CHANGED');
      if (!d.evidence?.trim() || !d.criteria?.trim())
        coreFail('EVIDENCE_REQUIRED');
      this.matchLines(d.lines ?? [], receipt.payload.lines ?? []);
      for (const l of d.lines ?? [])
        if (
          !whole(l.accepted ?? -1) ||
          !whole(l.rejected ?? -1) ||
          (l.accepted ?? 0) + (l.rejected ?? 0) !== l.quantity
        )
          coreFail('QUALITY_TOTAL');
    }
    if (row.kind === 'return') {
      const inspection = await this.parent(
          c,
          'inspection',
          row.sourceId,
          row.organizationId,
        ),
        id = data(inspection),
        receipt = await this.doc(c, row, 'receipts', inspection.sourceId);
      if (
        inspection.status !== 'approved' ||
        receipt.status !== 'posted' ||
        row.supplierId !== receipt.supplierId
      )
        coreFail('SOURCE_CHANGED');
      if (inspection.lifecycleVersion !== d.sourceVersion)
        coreFail('SOURCE_CHANGED');
      if (!d.reason?.trim() || !d.lines?.length) coreFail('REASON_REQUIRED');
      const other = await c.repository<CoreRow>('srmCoreRecords').findMany({
        filter: {
          kind: 'return',
          sourceId: row.sourceId,
          organizationId: row.organizationId,
        },
        limit: 10001,
      });
      if (other.length > 10000) coreFail('LIMIT');
      for (const line of d.lines) {
        const source = id.lines?.find((l) => l.id === line.id);
        if (!source || source.materialId !== line.materialId)
          coreFail('SOURCE_CHANGED');
        const reserved = other
          .filter(
            (r) =>
              r.id !== row.id &&
              ['approved', 'shipped', 'completed'].includes(r.status),
          )
          .flatMap((r) => data(r).lines ?? [])
          .filter((l) => l.id === line.id)
          .reduce((n, l) => n + l.quantity, 0);
        if (line.quantity + reserved > (source.rejected ?? 0))
          coreFail('RETURN_EXCEEDS_REJECTED');
      }
      if (
        'requestKey' in input &&
        action === 'ship' &&
        !(typeof input.tracking === 'string' ? input.tracking : '').trim()
      )
        coreFail('TRACKING_REQUIRED');
    }
    const ids = new Set<string>();
    for (const line of d.lines ?? []) {
      if (ids.has(line.id)) coreFail('SOURCE_CHANGED');
      ids.add(line.id);
      await this.doc(c, row, 'materials', line.materialId);
    }
  }
  matchLines(
    lines: { id: string; materialId: string; quantity: number }[],
    source: { id: string; materialId: string; quantity: number }[],
  ) {
    if (
      lines.length !== source.length ||
      !source.length ||
      lines.some(
        (l) =>
          !source.some(
            (s) =>
              s.id === l.id &&
              s.materialId === l.materialId &&
              s.quantity === l.quantity,
          ),
      )
    )
      coreFail('SOURCE_CHANGED');
  }
  async prepare(
    c: Connection,
    row: CoreRow,
    action = 'submit',
    actorId = row.createdBy,
  ) {
    if (row.kind === 'admission') {
      const s = await this.doc(c, row, 'suppliers', row.sourceId);
      row.supplierId = s.id;
    }
    if (row.kind === 'inspection') {
      const r = await this.doc(c, row, 'receipts', row.sourceId);
      row.supplierId = r.supplierId;
    }
    if (row.kind === 'return') {
      const i = await this.parent(
        c,
        'inspection',
        row.sourceId,
        row.organizationId,
      );
      row.supplierId = i.supplierId;
    }
    await this.validate(c, row, action, {}, actorId);
    return row;
  }
  async invitations(c: Connection, row: CoreRow) {
    if (row.kind !== 'rfq') return;
    await c.repository('srmCoreInvitations').deleteMany({
      filter: { rfqId: row.id, organizationId: row.organizationId },
    });
    for (const supplierId of data(row).supplierIds ?? [])
      await c.repository('srmCoreInvitations').createOne({
        values: {
          id: `${row.id}:${supplierId}`,
          rfqId: row.id,
          supplierId,
          organizationId: row.organizationId,
        },
      });
  }
  async create(
    a: CoreActor,
    kind: CoreKind,
    input: ReturnType<typeof CoreInput.parse>,
    transaction?: Connection,
  ) {
    return this.once(
      a,
      input.requestKey,
      { kind, input },
      async (c) => {
        const at = new Date().toISOString();
        const row: CoreRow = {
          name: input.name,
          sourceId: input.sourceId,
          supplierId: input.supplierId,
          deadline: input.deadline,
          id: randomUUID(),
          kind,
          organizationId: a.organizationId,
          createdBy: a.id,
          submittedBy: '',
          status: 'draft',
          statusChangedAt: at,
          lifecycleVersion: 0,
          data: JSON.stringify(input.data),
          number: `${kind.toUpperCase()}-${Date.now().toString(36)}-${randomUUID().slice(0, 4)}`,
          createdAt: at,
          updatedAt: at,
        };
        if (kind === 'quote') {
          if (!a.supplierId) coreFail('SUPPLIER_ONLY', 'PERMISSION_DENIED');
          row.supplierId = a.supplierId;
        }
        await this.prepare(c, row);
        if (['admission', 'quote'].includes(kind)) {
          const existing = await c.repository('srmCoreRecords').findOne({
            filter: {
              kind,
              sourceId: row.sourceId,
              organizationId: a.organizationId,
              ...(kind === 'quote' ? { supplierId: row.supplierId } : {}),
            },
          });
          if (existing) coreFail('ALREADY_EXISTS', 'ABORTED');
        }
        // Native create owns state/timestamp/version; only application fields enter it.
        const {
          status: _status,
          statusChangedAt: _time,
          lifecycleVersion: _version,
          ...values
        } = row;
        void _status;
        void _time;
        void _version;
        const created = await this.runtime.create('srmCoreRecords', values, {
          actor: { id: a.id },
          transaction: c,
        });
        const record = CoreRowSchema.parse(created.record);
        await this.invitations(c, record);
        return record;
      },
      transaction,
    );
  }
  async once<T>(
    a: CoreActor,
    key: string,
    body: unknown,
    fn: (c: Connection) => Promise<T>,
    transaction?: Connection,
  ) {
    const run = async (c: Connection) => {
      const repo = c.repository<{
          id: string;
          digest: string;
          result: string;
        }>('srmCoreKeys'),
        id = `${a.id}:${key}`,
        fingerprint = hash(body),
        old = await repo.findOne({ filter: { id } });
      if (old) {
        if (old.digest !== fingerprint) coreFail('REQUEST_REUSED', 'ABORTED');
        return JSON.parse(old.result) as T;
      }
      const result = await fn(c);
      await repo.createOne({
        values: { id, digest: fingerprint, result: JSON.stringify(result) },
      });
      return result;
    };
    return coreContext.run(a, () =>
      transaction ? run(transaction) : this.db.transaction(run),
    );
  }
  async action(
    a: CoreActor,
    kind: CoreKind,
    id: string,
    action: string,
    input: Record<string, unknown>,
    transaction?: Connection,
  ) {
    if (kind === 'rfq' && this.award)
      a = (await this.award.context(a, transaction)).actor;
    return this.once(
      a,
      String(input.requestKey),
      { kind, id, action, input },
      async (c) => {
        await this.get(c, a, kind, id);
        if (kind === 'rfq')
          a.awardEnabled =
            (await this.award?.settings(c, a.organizationId))?.enabled ?? false;
        const fired = await this.runtime.fire('srmCoreRecords', id, action, {
          actor: { id: a.id },
          input: input as JsonObject,
          expect: { version: Number(input.version) },
          requestId: String(input.requestKey),
          transaction: c,
        });
        return CoreRowSchema.parse(fired.record);
      },
      transaction,
    );
  }
  async approve(c: Connection, row: CoreRow, actorId: string): Promise<void> {
    const d = data(row);
    if (row.kind === 'admission') {
      await this.supplierState(c, row, true, actorId);
      return;
    }
    if (row.kind === 'rfq') {
      const quote = await this.parent(
          c,
          'quote',
          d.selectedQuoteId!,
          row.organizationId,
        ),
        qd = data(quote);
      const order = await this.ops.createIn(
        c,
        { ...coreContext.getStore()!, id: row.createdBy },
        'orders',
        {
          name: row.name,
          supplierId: quote.supplierId,
          businessDate: today(),
          notes: `RFQ ${row.number}; quotation ${quote.number}; ${d.decisionReason ?? ''}`,
          payload: {
            sourceId: row.id,
            expectedDeliveryDate: qd.deliveryDate,
            lines: qd.lines!.map((l) => ({
              id: l.id,
              materialId: l.materialId,
              quantity: l.quantity,
              price: l.price! / 100,
              taxRate: l.taxRateBps! / 100,
            })),
          },
        },
        false,
        row.id,
      );
      if (order.id !== row.id) coreFail('ORDER_CHANGED');
      return;
    }
    if (row.kind === 'inspection') {
      const r = await this.doc(c, row, 'receipts', row.sourceId);
      await this.ops.persist(
        c,
        { ...coreContext.getStore()!, id: actorId },
        'receipts',
        r,
        {
          payload: {
            ...r.payload,
            lines: r.payload.lines!.map((l) => {
              const q = d.lines!.find((x) => x.id === l.id)!;
              return { ...l, accepted: q.accepted, rejected: q.rejected };
            }),
          },
        },
        'qualityApprove',
      );
      return;
    }
    return;
  }
  async supplierState(
    c: Connection,
    row: CoreRow,
    active: boolean,
    actorId: string,
  ) {
    const s = await this.doc(c, row, 'suppliers', row.sourceId);
    await this.ops.persist(
      c,
      { ...coreContext.getStore()!, id: actorId },
      'suppliers',
      s,
      { status: active ? 'active' : 'inactive', admissionRequired: true },
      active ? 'admissionApprove' : 'admissionDisable',
    );
  }
  async edit(c: Connection, row: CoreRow, input: Record<string, unknown>) {
    const values = CoreInput.omit({ requestKey: true }).parse(input.values);
    // A quote cannot move to another RFQ; admission/inspection/return source is immutable after creation.
    if (row.kind !== 'rfq' && values.sourceId !== row.sourceId)
      coreFail('SOURCE_CHANGED');
    if (row.kind === 'quote') values.supplierId = row.supplierId;
    const next = { ...row, ...values, data: JSON.stringify(values.data) };
    await this.prepare(c, next);
    return {
      name: next.name,
      deadline: next.deadline,
      supplierId: next.supplierId,
      sourceId: next.sourceId,
      data: next.data,
    };
  }
  services(c: Connection) {
    return {
      notify: (
        taskId: string,
        personId: string,
        recordId: string,
        reason: string,
      ) => this.award!.notify(taskId, personId, recordId, reason),
      awardEnabled: coreContext.getStore()?.awardEnabled ?? false,
      directory: coreContext.getStore()?.directory ?? {
        isActive: () => false,
        managerOf: () => undefined,
        hasRole: () => false,
      },
      select: async (r: CoreRow, input: Record<string, unknown>) => {
        const settings = await this.award?.settings(c, r.organizationId);
        const reviewers = settings?.enabled
          ? { purchasing: settings.purchasing, department: settings.department }
          : undefined;
        if (
          reviewers &&
          (!reviewers.purchasing ||
            !reviewers.department ||
            reviewers.purchasing === reviewers.department ||
            [r.createdBy, coreContext.getStore()?.id].some(
              (id) =>
                id === reviewers.purchasing || id === reviewers.department,
            ) ||
            !coreContext
              .getStore()
              ?.directory?.isActive(reviewers.purchasing) ||
            !coreContext.getStore()?.directory?.isActive(reviewers.department))
        )
          coreFail('APPROVAL_REVIEWERS_REQUIRED');
        return {
          ...data(r),
          reviewers,
          selectedQuoteId: String(input.selectedQuoteId),
          selectedQuoteVersion: (
            await this.parent(
              c,
              'quote',
              String(input.selectedQuoteId),
              r.organizationId,
            )
          ).lifecycleVersion,
          decisionReason: String(input.reason),
        };
      },
      invitations: (r: CoreRow) => this.invitations(c, r),
      validate: (
        r: CoreRow,
        action: string,
        input: Record<string, unknown>,
        id: string,
      ) => this.validate(c, r, action, input, id),
      approve: (r: CoreRow, id: string) => this.approve(c, r, id),
      edit: (r: CoreRow, input: Record<string, unknown>) =>
        this.edit(c, r, input),
      supplierState: (r: CoreRow, active: boolean, id: string) =>
        this.supplierState(c, r, active, id),
    };
  }
  async detail(
    a: CoreActor,
    kind: CoreKind,
    id: string,
    c: Connection = this.db.connection(),
    withActions = true,
  ) {
    return coreContext.run(a, async () => {
      const row = await this.get(c, a, kind, id);
      const view = withActions
        ? await this.runtime.view('srmCoreRecords', id, { id: a.id })
        : { available: [] };
      const available = view.available
        .filter((transition) => transition.allowed)
        .map((t) => t.name)
        .filter((name) => a.permissions[kind].includes(name));
      const history = await c.repository('srmCoreTransitions').findMany({
        filter: { recordId: id },
        sort: (s) => s.field('version').desc(),
        limit: 100,
      });
      const quotes =
        kind === 'rfq' && !a.supplierId
          ? await c
              .repository<CoreRow>('srmCoreRecords')
              .withPolicy(a.policies.srmCoreRecords as RepositoryPolicy)
              .findMany({
                filter: {
                  sourceId: id,
                  kind: 'quote',
                  organizationId: a.organizationId,
                },
                limit: 100,
              })
          : [];
      let source: Doc | CoreView | null = null;
      if (['admission', 'inspection'].includes(kind))
        source = await this.doc(
          c,
          row,
          kind === 'admission' ? 'suppliers' : 'receipts',
          row.sourceId,
        );
      if (['quote', 'return'].includes(kind))
        source = await this.public(
          c,
          a,
          await this.parent(
            c,
            kind === 'quote' ? 'rfq' : 'inspection',
            row.sourceId,
            row.organizationId,
          ),
        );
      const returnBalances: Record<
        string,
        { reserved: number; available: number }
      > = {};
      if (kind === 'inspection' && !a.supplierId) {
        const returns = await this.repo(c, a).findMany({
          filter: {
            kind: 'return',
            sourceId: id,
            organizationId: a.organizationId,
          },
          limit: 10001,
        });
        if (returns.length > 10000) coreFail('LIMIT');
        for (const line of decodeCore(row).data.lines ?? []) {
          const reserved = returns
            .map((r) => CoreRowSchema.parse(r))
            .filter((r) =>
              ['approved', 'shipped', 'completed'].includes(r.status),
            )
            .reduce(
              (sum, r) =>
                sum +
                (decodeCore(CoreRowSchema.parse(r)).data.lines ?? [])
                  .filter((l) => l.id === line.id)
                  .reduce((n, l) => n + l.quantity, 0),
              0,
            );
          returnBalances[line.id] = {
            reserved,
            available: Math.max(0, (line.rejected ?? 0) - reserved),
          };
        }
      }
      return {
        record: await this.public(c, a, row),
        available,
        history,
        quotes: quotes.map((q) => decodeCore(CoreRowSchema.parse(q))),
        source,
        returnBalances,
      };
    });
  }
}
