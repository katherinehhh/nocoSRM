import { AsyncLocalStorage } from 'node:async_hooks';
import type { DatabaseConnection, RepositoryRecord } from '@nocobase/db';
import type { LifecycleStore, LifecycleRecord } from '@nocobase/lifecycle';
import type { CoreActor } from './service.js';
// Native hooks use the initiating request's policies, isolated across concurrent requests.
export const coreContext = new AsyncLocalStorage<CoreActor>();
export function scopedCoreStore(base: LifecycleStore): LifecycleStore {
  return new Proxy(base, {
    get(target, key) {
      if (key === 'transaction') {
        const transaction: LifecycleStore['transaction'] = (work, options) =>
          target.transaction((child) => work(scopedCoreStore(child)), options);
        return transaction;
      }
      const policy = coreContext.getStore()?.policies.srmCoreRecords;
      if (policy && key === 'createRecord') {
        const create: LifecycleStore['createRecord'] = async (
          collection,
          values,
        ) => {
          const connection = target.transactionHandle as DatabaseConnection;
          const result = await connection
            .repository(collection)
            .withPolicy(policy)
            .createOne({ values: values as RepositoryRecord });
          return result.record as LifecycleRecord;
        };
        return create;
      }
      if (policy && key === 'updateRecordIf') {
        const update: LifecycleStore['updateRecordIf'] = async (
          collection,
          id,
          condition,
          values,
        ) => {
          const connection = target.transactionHandle as DatabaseConnection;
          const result = await connection
            .repository(collection)
            .withPolicy(policy)
            .updateMany({
              filter: {
                id,
                [condition.stateField]: condition.state,
                [condition.versionField]: condition.version,
              },
              values: values as RepositoryRecord,
            });
          return result.updatedCount > 0;
        };
        return update;
      }
      const value: unknown = Reflect.get(target, key);
      return typeof value === 'function'
        ? (value.bind(target) as unknown)
        : value;
    },
  });
}
