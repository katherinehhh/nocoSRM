// @vitest-environment node
import { it, expect } from 'vitest';
import { deliveryPdf } from '../../server/providers/showcase/pdf.js';
import { extractPdf } from '../../server/providers/showcase/documents.js';
import { defaultTemplate, type Delivery } from '../../shared/showcase.js';
it('prints the business order number and explicit label count; extracts inert PDF evidence', async () => {
  const record = {
    id: 'test',
    number: 'DP001',
    orderId: 'uuid-id',
    orderNumber: 'CG260401A00001',
    businessDate: '2026-10-11',
    region: 'AU',
    labelCount: 8,
    lines: JSON.stringify([
      {
        sku: '24124.05TP.V2',
        name: '猫砂盆',
        fnsku: '1',
        allocation: 30,
        unitsPerBox: 6,
      },
    ]),
  } as Delivery & { orderNumber: string };
  const bytes = await deliveryPdf(record, defaultTemplate);
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  const result = await extractPdf(bytes.toString('base64'));
  expect(result.pages).toBe(2);
  expect(result.text).toContain('CG260401A00001');
  expect(result.text).not.toContain('uuid-id');
  expect(result.text).toContain('(8/8)');
  expect(result.text).not.toContain('(9/');
  expect(result.truncated).toBe(false);
  await expect(
    extractPdf(Buffer.from('<script>data</script>').toString('base64')),
  ).rejects.toThrow('INVALID_DOCUMENT');
}, 30000);
