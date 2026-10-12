import type { Connection } from '../providers/operations/service.js';
import { BusinessError } from '../providers/operations/service.js';
import type { Doc } from '../../shared/operations.js';
import {
  CoreRowSchema,
  decodeCore,
  type CoreRow,
} from '../../shared/srm-core.js';
export async function requireAdmission(c: Connection, supplier: Doc) {
  if (!supplier.admissionRequired) return;
  const rows = await c.repository<CoreRow>('srmCoreRecords').findMany({
    filter: {
      kind: 'admission',
      sourceId: supplier.id,
      organizationId: supplier.organizationId,
      status: 'approved',
    },
    limit: 2,
  });
  const approved = rows[0] && decodeCore(CoreRowSchema.parse(rows[0]));
  if (
    !approved ||
    !approved.data.validUntil ||
    approved.data.validUntil < new Date().toISOString().slice(0, 10)
  )
    throw new BusinessError('SUPPLIER_UNQUALIFIED');
}
export async function requireInspection(c: Connection, receipt: Doc) {
  if (!receipt.qualityRequired) return;
  const rows = await c.repository<CoreRow>('srmCoreRecords').findMany({
    filter: {
      kind: 'inspection',
      sourceId: receipt.id,
      organizationId: receipt.organizationId,
      status: 'approved',
    },
    limit: 100,
  });
  const matched = rows
    .map((r) => decodeCore(CoreRowSchema.parse(r)))
    .some(
      (r) =>
        r.data.decidedReceiptVersion === receipt.version &&
        r.data.lines?.length === receipt.payload.lines?.length &&
        receipt.payload.lines!.every((l) =>
          r.data.lines?.some(
            (q) =>
              q.id === l.id &&
              q.materialId === l.materialId &&
              q.quantity === l.quantity &&
              q.accepted === l.accepted &&
              q.rejected === l.rejected,
          ),
        ),
    );
  if (!matched) throw new BusinessError('INSPECTION_REQUIRED');
}

export async function requireAwardSnapshot(
  c: Connection,
  organizationId: string,
  supplierId: string | null,
  payload: Doc['payload'],
) {
  if (!payload.sourceId) return;
  const source = await c.repository<CoreRow>('srmCoreRecords').findOne({
    filter: {
      id: payload.sourceId,
      kind: 'rfq',
      organizationId,
      status: 'awarded',
    },
  });
  if (!source) return;
  const selected = decodeCore(CoreRowSchema.parse(source)).data.selectedQuoteId;
  const quoted = await c
    .repository<CoreRow>('srmCoreRecords')
    .findOne({ filter: { id: selected, kind: 'quote', organizationId } });
  if (!quoted) throw new BusinessError('SOURCE_CHANGED');
  const q = decodeCore(CoreRowSchema.parse(quoted));
  if (
    q.supplierId !== supplierId ||
    payload.lines?.length !== q.data.lines?.length ||
    payload.lines?.some(
      (l) =>
        !q.data.lines?.some(
          (s) =>
            s.id === l.id &&
            s.materialId === l.materialId &&
            s.quantity === l.quantity &&
            s.price === Math.round(l.price * 100) &&
            s.taxRateBps === Math.round(l.taxRate * 100),
        ),
    )
  )
    throw new BusinessError('SOURCE_CHANGED');
}
