import type { CoreKind, CoreView, CoreData } from '../../../shared/srm-core.js';
import type { Doc } from '../../../shared/operations.js';
type Values = {
  name: string;
  sourceId: string;
  supplierId: string | null;
  deadline: string;
  data: CoreData;
};
type Source = Doc | CoreView;
export function sourceValues(kind: CoreKind, source: Source): Partial<Values> {
  if (kind === 'admission')
    return { sourceId: source.id, supplierId: source.id };
  if (kind === 'inspection') {
    const r = source as Doc;
    return {
      sourceId: r.id,
      supplierId: r.supplierId,
      data: {
        sourceVersion: r.version,
        lines: r.payload.lines?.map((l) => ({
          id: l.id,
          materialId: l.materialId,
          quantity: l.quantity,
          accepted: l.accepted ?? l.quantity,
          rejected: l.rejected ?? 0,
        })),
      },
    };
  }
  const r = source as CoreView;
  return {
    sourceId: r.id,
    supplierId: kind === 'return' ? r.supplierId : null,
    data: {
      sourceVersion:
        kind === 'quote'
          ? (r.data.publishedVersion ?? r.lifecycleVersion)
          : r.lifecycleVersion,
      lines:
        kind === 'return'
          ? r.data.lines
              ?.filter((l) => (l.rejected ?? 0) > 0)
              .map((l) => ({
                id: l.id,
                materialId: l.materialId,
                quantity: l.rejected!,
              }))
          : r.data.lines?.map((l) => ({
              id: l.id,
              materialId: l.materialId,
              quantity: l.quantity,
              taxRateBps: 1300,
            })),
    },
  };
}
