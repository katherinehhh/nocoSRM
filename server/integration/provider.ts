import {
  CoreRowSchema,
  decodeCore,
  type CoreRow,
} from '../../shared/srm-core.js';
import type { Application } from '@nocobase/app-server/application';
import {
  ServiceProvider,
  createServiceToken,
} from '@nocobase/service-provider';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import { jobExecutorServiceToken } from '@nocobase/app-server/jobs';
import type { ScheduleExecutor } from '@nocobase/jobs';
import {
  digest,
  SourceMessage,
  ResultMessage,
  tax,
  send,
  reject,
  type BridgeConfig,
} from './protocol.js';
import type { Doc } from '../../shared/operations.js';
import type { z } from 'zod';
export interface ExportRow {
  id: string;
  orderId: string;
  receiptId: string;
  supplierId: string;
  digest: string;
  state: string;
  billId: string;
  lastError: string;
  sourceVersion: number;
  snapshot: string;
  result: string;
  updatedAt: string;
}
export const bridgeToken = createServiceToken<SrmBridge>(
  'app/srm-finance-bridge',
);
export class SrmBridge {
  constructor(
    readonly db: DatabaseManager,
    readonly config: BridgeConfig,
  ) {}
  private running = false;
  async sync() {
    if (this.running) return;
    this.running = true;
    try {
      await this.performSync();
    } finally {
      this.running = false;
    }
  }
  private async performSync() {
    if (!this.config.enabled) return;
    const receipts: Doc[] = [];
    for (let offset = 0; ; offset += 1000) {
      const rows = await this.db.repository<Doc>('opsReceipts').findMany({
        filter: { organizationId: 'main', status: 'posted', demo: false },
        sort: (s) => s.field('id').asc(),
        limit: 1000,
        offset,
      });
      receipts.push(...rows);
      if (rows.length < 1000) break;
    }
    for (const receipt of receipts) {
      const payload =
        typeof receipt.payload === 'string'
          ? (JSON.parse(receipt.payload) as Doc['payload'])
          : receipt.payload;
      const order = await this.db
        .repository<Doc>('opsOrders')
        .findOne({ filter: { id: payload.orderId, organizationId: 'main' } });
      if (!order) continue;
      const op =
        typeof order.payload === 'string'
          ? (JSON.parse(order.payload) as Doc['payload'])
          : order.payload;
      const supplier = await this.db
        .repository<Doc>('opsSuppliers')
        .findOne({ filter: { id: order.supplierId, organizationId: 'main' } });
      if (!supplier) continue;
      for (const line of payload.lines ?? []) {
        const ol = op.lines?.find((l) => l.id === line.sourceLineId);
        if (!ol) continue;
        const material = await this.db
          .repository<Doc>('opsMaterials')
          .findOne({ filter: { id: ol.materialId, organizationId: 'main' } });
        if (!material) continue;
        const id = `srm:${receipt.id}:${line.id}`;
        try {
          const data = {
            organizationId: 'main' as const,
            id,
            orderId: order.id,
            receiptId: receipt.id,
            receiptLineId: line.id,
            supplierId: supplier.id,
            supplier: supplier.name,
            orderNo: order.number,
            receiptNo: receipt.number,
            sku: material.number,
            orderedQty: ol.quantity,
            receivedQty: line.accepted ?? line.quantity,
            unitPrice: Math.round(ol.price * 100),
            currency: 'CNY' as const,
            taxRateBps: Math.round(ol.taxRate * 100),
          };
          let excluded = false;
          if (receipt.qualityRequired && data.receivedQty === 0) {
            const checks = await this.db
              .repository<CoreRow>('srmCoreRecords')
              .findMany({
                filter: {
                  kind: 'inspection',
                  sourceId: receipt.id,
                  organizationId: 'main',
                  status: 'approved',
                },
                limit: 100,
              });
            excluded = checks.some((raw) =>
              decodeCore(CoreRowSchema.parse(raw)).data.lines?.some(
                (q) =>
                  q.id === line.id &&
                  q.quantity === line.quantity &&
                  q.accepted === 0 &&
                  q.rejected === line.rejected,
              ),
            );
          }
          const hash = excluded
            ? digest({ ...data, exportability: 'nonBillable' })
            : digest(data);
          const row = await this.db.transaction(async (tx) => {
            const repo = tx.repository<ExportRow>('srmFinanceSources'),
              old = await repo.findOne({ filter: { id } });
            if (old?.digest === hash) return old;
            const version = (old?.sourceVersion ?? 0) + 1;
            const candidate = {
              ...data,
              sourceVersion: version,
              eventId: `${id}:${version}`,
            };
            const validated = SourceMessage.safeParse(candidate);
            const values = {
              id,
              orderId: order.id,
              receiptId: receipt.id,
              supplierId: supplier.id,
              digest: hash,
              state: excluded
                ? 'excluded'
                : validated.success
                  ? 'pending'
                  : 'failed',
              billId: old?.billId ?? '',
              lastError:
                excluded || validated.success ? '' : 'SOURCE_UNSUPPORTED',
              sourceVersion: version,
              snapshot: JSON.stringify(candidate),
              result: old?.result ?? '',
              updatedAt: new Date().toISOString(),
            };
            if (old)
              await repo.updateOne({
                filter: { id, sourceVersion: old.sourceVersion },
                values,
              });
            else await repo.createOne({ values });
            return values;
          });
          if (
            row.state === 'synced' ||
            row.state === 'excluded' ||
            row.lastError === 'SOURCE_UNSUPPORTED'
          )
            continue;
          const answer = await send(
            this.config.financeBaseUrl,
            'integrations/srm/import',
            JSON.parse(row.snapshot),
            this.config.secret,
          );
          if (!answer.data.billId) throw new Error('IMPORT_ACK_MISSING');
          await this.db.repository<ExportRow>('srmFinanceSources').updateOne({
            filter: { id, sourceVersion: row.sourceVersion },
            values: {
              state: 'synced',
              billId: answer.data.billId,
              lastError: '',
              updatedAt: new Date().toISOString(),
            },
          });
        } catch (e) {
          await this.db.repository<ExportRow>('srmFinanceSources').updateOne({
            filter: { id },
            values: {
              state: 'failed',
              lastError: e instanceof Error ? e.message : 'SYNC_FAILED',
              updatedAt: new Date().toISOString(),
            },
          });
        }
      }
    }
  }
  async result(message: z.infer<typeof ResultMessage>) {
    return this.db.transaction(async (tx) => {
      const hash = digest(message),
        inbox = tx.repository<{
          id: string;
          digest: string;
          createdAt: string;
        }>('srmFinanceInbox'),
        prior = await inbox.findOne({ filter: { id: message.eventId } });
      if (prior) {
        if (prior.digest !== hash) reject('EVENT_REUSED');
        return { acknowledged: true };
      }
      const repo = tx.repository<ExportRow>('srmFinanceSources'),
        row = await repo.findOne({ filter: { id: message.sourceId } });
      if (!row) reject('SOURCE_NOT_FOUND');
      if (row.sourceVersion !== message.sourceVersion) reject('SOURCE_CHANGED');
      if (row.billId && row.billId !== message.billId) reject('BILL_MISMATCH');
      const source = SourceMessage.parse(JSON.parse(row.snapshot));
      if (
        message.netAmount > source.receivedQty * source.unitPrice ||
        message.taxAmount !== tax(message.netAmount, source.taxRateBps)
      )
        reject('AMOUNT_MISMATCH');
      if (row.result) {
        const old = ResultMessage.parse(JSON.parse(row.result));
        if (message.financeVersion < old.financeVersion) reject('STALE_RESULT');
        if (
          message.financeVersion === old.financeVersion &&
          digest(old) !== hash
        )
          reject('VERSION_REUSED');
      }
      await repo.updateOne({
        filter: { id: row.id, sourceVersion: row.sourceVersion },
        values: {
          result: JSON.stringify(message),
          billId: message.billId,
          updatedAt: new Date().toISOString(),
        },
      });
      await inbox.createOne({
        values: {
          id: message.eventId,
          digest: hash,
          createdAt: new Date().toISOString(),
        },
      });
      return { acknowledged: true };
    });
  }
}
export default class BridgeProvider extends ServiceProvider<Application> {
  readonly name = 'app/srm-finance-bridge';
  private executor: ScheduleExecutor | undefined;
  override register() {
    this.app.container.singleton(
      bridgeToken,
      () =>
        new SrmBridge(
          this.app.container.resolve(databaseManagerToken),
          this.app.config.get<BridgeConfig>('financeBridge') ?? {
            enabled: false,
            secret: '',
            srmBaseUrl: '',
            financeBaseUrl: '',
          },
        ),
    );
  }
  override async start() {
    const service = this.app.container.resolve(bridgeToken);
    if (!service.config.enabled) return;
    this.executor = this.app.container
      .resolve(jobExecutorServiceToken)
      .getScheduleExecutor('srm-finance-bridge');
    await this.executor.addJob({
      name: 'srm-finance-sync',
      options: { every: 15000 },
      payload: {},
      execute: async () => service.sync(),
    });
    await this.executor.setup();
  }
  override async shutdown() {
    await this.executor?.shutdown();
  }
}
