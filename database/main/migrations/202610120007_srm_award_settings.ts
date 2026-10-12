import { defineMigration } from '@nocobase/db';
export default defineMigration({
  name: '202610120007_srm_award_settings',
  async up({ builder }) {
    await builder.createCollection('srmAwardSettings', (c) => {
      c.string('id', { length: 64 }).primary();
      c.boolean('enabled').notNull();
      c.string('purchasing', { length: 64 }).notNull();
      c.string('department', { length: 64 }).notNull();
      c.integer('version').notNull();
    });
  },
  async down({ builder }) {
    await builder.dropCollection('srmAwardSettings');
  },
});
