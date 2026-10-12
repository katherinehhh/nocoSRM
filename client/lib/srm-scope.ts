// This is presentation scope only. Legacy routes keep their original server authorization.
const financeResources = new Set([
  'invoices',
  'settlements',
  'payments',
  'reconciliations',
  'taxScenarios',
]);
export function isSrmResource(kind: string): boolean {
  return !financeResources.has(kind);
}
// Local customer-demo destination supplied by the user. Separate origin/session; no data handoff.
export const financeAppUrl = 'http://localhost:13002/main/finance';
