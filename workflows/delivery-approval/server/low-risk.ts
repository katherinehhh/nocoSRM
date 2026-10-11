interface Context {
  input: { deliveryId: string };
  parameters: Record<string, never>;
  nodeResults: {
    check?: { lowRisk: boolean; amount: number };
    decision?: { decision: string; actorId: string; version: number };
  };
}
export async function run(context: Context) {
  return context.nodeResults.check?.lowRisk === true;
}
