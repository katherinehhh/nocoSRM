import { defineMigration } from '@nocobase/db';
export default defineMigration({
  name: '202610120003_finance_bridge',
  async up({ builder }) {
    await builder.createCollection('srmFinanceSources', (c) => {
      c.string('id').primary();
      for (const f of [
        'orderId',
        'receiptId',
        'supplierId',
        'digest',
        'state',
        'billId',
        'lastError',
      ])
        c.string(f).notNull().defaultTo('');
      c.integer('sourceVersion').notNull();
      c.text('snapshot').notNull();
      c.text('result').notNull().defaultTo('');
      c.datetimeTz('updatedAt').notNull();
    });
    await builder.createCollection('srmFinanceInbox', (c) => {
      c.string('id').primary();
      c.string('digest').notNull();
      c.datetimeTz('createdAt').notNull();
    });
  },
  async down({ builder }) {
    await builder.dropCollection('srmFinanceInbox');
    await builder.dropCollection('srmFinanceSources');
  },
});
