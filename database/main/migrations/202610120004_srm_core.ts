import { defineMigration } from '@nocobase/db';
export default defineMigration({
  name: '202610120004_srm_core',
  async up({ builder }) {
    for (const [table, field] of [
      ['opsSuppliers', 'admissionRequired'],
      ['opsReceipts', 'qualityRequired'],
    ])
      await builder.addField(table, {
        name: field,
        type: 'boolean',
        nullable: false,
        defaultValue: false,
      });
    await builder.createCollection('srmCoreRecords', (c) => {
      c.string('id', { length: 64 }).primary();
      c.string('kind', { length: 32 }).notNull();
      c.string('organizationId', { length: 64 }).notNull();
      c.string('supplierId', { length: 64 }).nullable();
      for (const f of [
        'sourceId',
        'name',
        'number',
        'deadline',
        'createdBy',
        'submittedBy',
        'data',
        'createdAt',
        'updatedAt',
      ])
        c.text(f).notNull();
      c.string('status', { length: 32 }).notNull();
      c.datetimeTz('statusChangedAt').notNull();
      c.integer('lifecycleVersion').notNull().defaultTo(0);
      c.unique('number');
      c.index(['organizationId', 'kind', 'status']);
      c.index(['kind', 'sourceId', 'supplierId']);
    });
    await builder.createCollection('srmCoreInvitations', (c) => {
      c.string('id').primary();
      c.string('rfqId').notNull();
      c.string('supplierId').notNull();
      c.string('organizationId').notNull();
      c.index(['organizationId', 'supplierId']);
    });
    await builder.createCollection('srmCoreKeys', (c) => {
      c.string('id').primary();
      c.string('digest').notNull();
      c.text('result').notNull();
    });
    await builder.createCollection('srmCoreTransitions', (c) => {
      c.increments('id');
      for (const f of [
        'lifecycle',
        'recordId',
        'transition',
        'to',
        'actorId',
        'requestKey',
      ])
        c.string(f, { length: 255 }).notNull();
      c.string('from').nullable();
      c.string('requestId').nullable();
      c.json('input').notNull();
      c.datetimeTz('at').notNull();
      c.integer('version').notNull();
      c.unique(['lifecycle', 'recordId', 'version']);
      c.unique(['lifecycle', 'recordId', 'requestKey']);
      c.index(['lifecycle', 'recordId', 'id']);
    });
    await builder.createCollection('srmCoreEffects', (c) => {
      c.increments('id');
      c.integer('transitionId').notNull();
      for (const f of ['lifecycle', 'recordId', 'effect', 'status'])
        c.string(f, { length: 255 }).notNull();
      c.boolean('stayBound').notNull();
      c.integer('attempts').notNull().defaultTo(0);
      c.integer('maxAttempts').notNull().defaultTo(1);
      c.json('result').nullable();
      c.text('error').nullable();
      for (const f of ['createdAt', 'updatedAt']) c.datetimeTz(f).notNull();
      for (const f of [
        'claimedAt',
        'runAfter',
        'continuationDueAt',
        'continuationAbandonedAt',
      ])
        c.datetimeTz(f).nullable();
      c.json('continuation').nullable();
      c.index(['status', 'id']);
      c.index(['lifecycle', 'recordId', 'id']);
      c.index('continuationDueAt');
      c.index('continuationAbandonedAt');
    });
  },
  async down({ builder }) {
    for (const table of [
      'srmCoreEffects',
      'srmCoreTransitions',
      'srmCoreKeys',
      'srmCoreInvitations',
      'srmCoreRecords',
    ])
      await builder.dropCollection(table);
    await builder.dropField('opsReceipts', 'qualityRequired');
    await builder.dropField('opsSuppliers', 'admissionRequired');
  },
});
