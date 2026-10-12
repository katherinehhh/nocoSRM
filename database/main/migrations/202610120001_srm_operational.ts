import { defineMigration } from '@nocobase/db';
export default defineMigration({
  name: '202610120001_srm_operational',
  async up({ builder }) {
    await builder.addField('opsMemberships', {
      name: 'version',
      type: 'integer',
      nullable: false,
      defaultValue: 1,
    });
    await builder.addField('opsMemberships', {
      name: 'enabled',
      type: 'boolean',
      nullable: false,
      defaultValue: true,
    });
    await builder.addField('showcaseDeliveries', {
      name: 'orderSourceVersion',
      type: 'integer',
      nullable: true,
    });
    await builder.createCollection('srmMembershipAudit', (c) => {
      c.string('id', { length: 64 }).notNull();
      c.primary('id');
      c.string('userId', { length: 64 }).notNull();
      c.string('actorId', { length: 64 }).notNull();
      c.string('requestId', { length: 100 }).notNull();
      c.text('digest').notNull();
      c.text('before').nullable();
      c.text('after').notNull();
      c.text('at').notNull();
      c.unique(['actorId', 'requestId']);
      c.index('userId');
    });
  },
  async down({ builder }) {
    await builder.dropCollection('srmMembershipAudit');
    await builder.alterCollection('showcaseDeliveries', {
      dropFields: ['orderSourceVersion'],
    });
    await builder.alterCollection('opsMemberships', {
      dropFields: ['version', 'enabled'],
    });
  },
});
