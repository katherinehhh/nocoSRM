import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { ApiError } from '@nocobase/app-server/router';
const amount = z.number().int().nonnegative().max(2147483647);
export const SourceMessage = z
  .strictObject({
    eventId: z.string().min(1).max(240),
    organizationId: z.literal('main'),
    id: z.string().min(1).max(128),
    orderId: z.string().uuid(),
    receiptId: z.string().uuid(),
    receiptLineId: z.string().min(1).max(64),
    supplierId: z.string().uuid(),
    supplier: z.string().min(1).max(200),
    orderNo: z.string().min(1).max(100),
    receiptNo: z.string().min(1).max(100),
    sku: z.string().min(1).max(100),
    orderedQty: z.number().int().positive().max(100000),
    receivedQty: z.number().int().positive().max(100000),
    unitPrice: amount.refine((v) => v > 0),
    currency: z.literal('CNY'),
    taxRateBps: z.number().int().min(0).max(10000),
    sourceVersion: z.number().int().positive(),
  })
  .refine(
    (s) =>
      s.receivedQty <= s.orderedQty &&
      s.id === `srm:${s.receiptId}:${s.receiptLineId}` &&
      gross(s.orderedQty * s.unitPrice, s.taxRateBps) <= 2147483647,
  );
export const ResultMessage = z
  .strictObject({
    eventId: z.string().min(1).max(240),
    organizationId: z.literal('main'),
    sourceId: z.string().min(1).max(128),
    sourceVersion: z.number().int().positive(),
    billId: z.string().uuid(),
    billNo: z.string().min(1).max(255),
    financeVersion: z.number().int().positive(),
    status: z.enum([
      'draft',
      'reconciled',
      'documented',
      'resolved',
      'pending',
      'approved',
      'posted',
    ]),
    netAmount: amount,
    taxAmount: amount,
    grossAmount: amount,
  })
  .refine((s) => s.netAmount + s.taxAmount === s.grossAmount);
export function tax(net: number, rate: number) {
  return Math.round((net * rate) / 10000);
}
export function gross(net: number, rate: number) {
  return net + tax(net, rate);
}
export function digest(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
export function reject(
  reason: string,
  status:
    | 'ABORTED'
    | 'PERMISSION_DENIED'
    | 'UNAVAILABLE'
    | 'INVALID_ARGUMENT' = 'ABORTED',
): never {
  throw new ApiError({
    status,
    reason,
    domain: 'financeBridge',
    message: reason,
  });
}
export function verify(
  raw: string,
  timestamp: string,
  signature: string,
  secret: string,
) {
  if (!secret) reject('INTEGRATION_NOT_CONFIGURED', 'UNAVAILABLE');
  if (
    secret.length < 32 ||
    !/^\d{13}$/.test(timestamp) ||
    Math.abs(Date.now() - Number(timestamp)) > 300000 ||
    !/^[a-f0-9]{64}$/.test(signature)
  )
    reject('INVALID_SIGNATURE', 'PERMISSION_DENIED');
  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${raw}`)
    .digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, 'hex')))
    reject('INVALID_SIGNATURE', 'PERMISSION_DENIED');
}
export interface BridgeConfig {
  secret: string;
  srmBaseUrl: string;
  financeBaseUrl: string;
  enabled: boolean;
}
export async function send(
  base: string,
  path: string,
  body: unknown,
  secret: string,
) {
  const text = JSON.stringify(body),
    timestamp = String(Date.now());
  const response = await fetch(`${base}/api/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-bridge-time': timestamp,
      'x-bridge-signature': createHmac('sha256', secret)
        .update(`${timestamp}.${text}`)
        .digest('hex'),
    },
    body: text,
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`BRIDGE_HTTP_${response.status}`);
  return (await response.json()) as {
    data: { billId?: string; acknowledged?: boolean };
  };
}
