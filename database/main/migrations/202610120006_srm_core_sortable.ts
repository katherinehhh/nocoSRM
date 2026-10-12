import { defineMigration } from '@nocobase/db';

// Bounded business values must use sortable scalar fields, not long text.
export default defineMigration({
  name: '202610120006_srm_core_sortable',
  async up({ builder }) {
    for (const [field, length] of [
      ['name', 200],
      ['number', 255],
      ['deadline', 10],
      ['updatedAt', 32],
    ] as const)
      await builder.alterField('srmCoreRecords', field, {
        type: 'string',
        length,
      });
  },
  async down({ builder }) {
    for (const field of ['name', 'number', 'deadline', 'updatedAt'])
      await builder.alterField('srmCoreRecords', field, { type: 'text' });
  },
});
