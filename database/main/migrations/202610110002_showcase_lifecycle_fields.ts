import { defineMigration } from '@nocobase/db';

// Native lifecycle filters require string field capabilities, including on SQLite.
const fields = {
  lifecycleTransitions: ['id', 'lifecycle', 'recordId', 'transition', 'to', 'actorId', 'requestKey', 'from', 'requestId'],
  lifecycleEffectRuns: ['id', 'transitionId', 'lifecycle', 'recordId', 'effect', 'status'],
};

export default defineMigration({
  name: '202610110002_showcase_lifecycle_fields',
  async up({ builder }) {
    for (const [collection, names] of Object.entries(fields)) {
      await builder.alterCollection(collection, (c) => {
        for (const name of names) c.alterField(name, { type: 'string', length: 255 });
      });
    }
  },
  async down({ builder }) {
    for (const [collection, names] of Object.entries(fields)) {
      await builder.alterCollection(collection, (c) => {
        for (const name of names) c.alterField(name, { type: 'text' });
      });
    }
  },
});
