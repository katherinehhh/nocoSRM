import { AppCommand, CommandError } from '@nocobase/app-cli';
import { Flags } from '@oclif/core';
export default class CustomerDemo extends AppCommand {
  static override summary =
    'Prepare or verify the customer SRM flow through native authenticated APIs.';
  static override flags = {
    apply: Flags.boolean({
      description:
        'Explicitly prepare and execute the named local customer-demo records.',
      default: false,
    }),
  };
  async run() {
    const { flags } = await this.parse(CustomerDemo);
    if (!flags.apply) {
      this.setStatus('success-noop');
      return {
        plan: 'Create five limited business-role accounts, owned supplier/material/warehouse records, run procurement/delivery/receipt/ledger APIs, and leave a new draft. Never reset existing records or passwords.',
      };
    }
    return this.withApp(async ({ app }) => {
      const { runCustomerDemo } = await import('./lib/customer-demo.js');
      await app.start();
      try {
        const result = await runCustomerDemo(app);
        if (!result.changed) this.setStatus('success-noop');
        return result;
      } catch (cause) {
        throw new CommandError(
          'Customer flow did not complete. Owned progress is retained; rerun safely after resolving the reported step.',
          {
            code: 'CUSTOMER_FLOW_FAILED',
            details: {
              step: cause instanceof Error ? cause.message : 'unknown',
            },
          },
        );
      }
    });
  }
}
