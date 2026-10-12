import { AppCommand } from '@nocobase/app-cli';
import { Flags } from '@oclif/core';
import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication';
import { userRoleScopeRegistryToken } from '@nocobase/app-plugin-users/server/tokens';
import { databaseManagerToken } from '@nocobase/db';
import type { Doc } from '../../shared/operations.js';
import type { CoreView } from '../../shared/srm-core.js';
interface Account {
  id?: string;
  name: string;
  email: string;
  password: string;
}
interface State {
  kind: 'srm-core-demo-v1';
  accounts: Record<string, Account>;
  records: Record<string, string>;
  keys: Record<string, string>;
}
export default class PrepareCoreDemo extends AppCommand {
  static override summary =
    'Prepare owned local SRM core identities and admitted supplier master records, without resetting business data.';
  static override flags = {
    apply: Flags.boolean({
      default: false,
      description: 'Apply the local owned core-case preparation.',
    }),
  };
  async run() {
    const { flags } = await this.parse(PrepareCoreDemo);
    if (!flags.apply) {
      this.setStatus('success-noop');
      return {
        plan: 'Reuse existing owned buyer/approver/warehouse identities; create two limited supplier identities and admitted supplier/material/warehouse records. No password reset or financial posting.',
      };
    }
    return this.withApp(async ({ app }) => {
      await app.start();
      const origin = app.config.get('app.publicOrigin') as string,
        base = (app.config.get('app.internalBasePath') as string) || '';
      if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin))
        throw new Error('Local application only');
      const folder = app.paths.storage('core-demo'),
        file = app.paths.storage('core-demo/state.json');
      await mkdir(folder, { recursive: true });
      let state: State;
      try {
        state = JSON.parse(await readFile(file, 'utf8')) as State;
        if (state.kind !== 'srm-core-demo-v1')
          throw new Error('Unexpected core-case identity');
      } catch (e) {
        if (!(e instanceof Error && 'code' in e && e.code === 'ENOENT'))
          throw e;
        const previous = JSON.parse(
          await readFile(app.paths.storage('customer-demo/state.json'), 'utf8'),
        ) as { kind: string; accounts: Record<string, Account> };
        if (previous.kind !== 'srm-client-demo-v1')
          throw new Error('Existing owned customer accounts required', {
            cause: e,
          });
        state = {
          kind: 'srm-core-demo-v1',
          accounts: Object.fromEntries(
            ['buyer', 'approver', 'warehouse'].map((r) => [
              r,
              previous.accounts[r]!,
            ]),
          ),
          records: {},
          keys: {},
        };
        for (const role of ['supplierA', 'supplierB'])
          state.accounts[role] = {
            name: `核心流程 · ${role}`,
            email: `core-${role.toLowerCase()}@customer-demo.invalid`,
            password: randomBytes(24).toString('base64url'),
          };
      }
      const before = JSON.stringify(state);
      const save = async () => {
        await writeFile(file, JSON.stringify(state, null, 2), { mode: 0o600 });
        await chmod(file, 0o600);
      };
      await save();
      const users = app.container.resolve(userAdministrationServiceToken),
        db = app.container.resolve(databaseManagerToken),
        scope = app.container.resolve(userRoleScopeRegistryToken).get('app');
      if (!scope) throw new Error('Native role scope missing');
      for (const [role, a] of Object.entries(state.accounts)) {
        let user = a.id ? await users.get(a.id) : undefined;
        if (!user) {
          if (!role.startsWith('supplier'))
            throw new Error('Existing owned account missing');
          if (
            (await users.list({ search: a.email })).items.some(
              (u) => u.email === a.email,
            )
          )
            throw new Error('Account collision; no credential reset');
          user = await users.create(a);
          a.id = user.id;
          await save();
        }
        if (user.email !== a.email || user.disabledAt)
          throw new Error('Owned account changed');
        const expected = [
          `operations-${role.startsWith('supplier') ? 'supplier' : role}`,
        ];
        await db.transaction(async (tx) => {
          const assigned = await scope.get(user.id, tx);
          if (JSON.stringify(assigned) === JSON.stringify(expected)) return;
          if (
            (Array.isArray(assigned) ? assigned : [assigned]).filter(Boolean)
              .length
          )
            throw new Error('Owned grants changed');
          await scope.replace(user.id, expected, tx);
        });
      }
      const sessions: Record<string, string> = {};
      const request = async <T>(
        role: string,
        path: string,
        body?: object,
      ): Promise<T> => {
        if (!sessions[role]) {
          const a = state.accounts[role]!;
          const response = await app.fetch(
            new Request(`${origin}${base}/api/auth/sign-in/email`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Origin: origin },
              body: JSON.stringify({ email: a.email, password: a.password }),
            }),
          );
          if (response.status !== 200)
            throw new Error(`Owned sign-in failed: ${role} ${response.status}`);
          sessions[role] = response.headers
            .getSetCookie()
            .map((c) => c.split(';')[0])
            .join('; ');
        }
        const response = await app.fetch(
          new Request(`${origin}${base}/api/${path}`, {
            method: body ? 'POST' : 'GET',
            headers: {
              'Content-Type': 'application/json',
              Origin: origin,
              Cookie: sessions[role],
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
          }),
        );
        if (!response.ok)
          throw new Error(
            `Core preparation API ${path} HTTP ${response.status}: ${(await response.text()).slice(0, 600)}`,
          );
        return ((await response.json()) as { data: T }).data;
      };
      const key = async (name: string) => {
        if (!state.keys[name]) {
          state.keys[name] = randomUUID();
          await save();
        }
        return state.keys[name]!;
      };
      const day = new Date().toISOString().slice(0, 10);
      async function master(
        name: string,
        role: string,
        kind: string,
        values: object,
      ) {
        if (!state.records[name]) {
          const row = await request<Doc>(role, `operations/${kind}`, {
            ...values,
            requestId: await key(name),
          });
          state.records[name] = row.id;
          await save();
        }
        return request<Doc>(role, `operations/${kind}/${state.records[name]}`);
      }
      const warehouse = await master('warehouse', 'warehouse', 'warehouses', {
        name: '核心流程 · 质检原料仓',
        businessDate: day,
        payload: {},
      });
      const material = await master('material', 'buyer', 'materials', {
        name: '核心流程 · 精密轴承',
        businessDate: day,
        payload: {
          unit: '件',
          openingStock: 0,
          reorderPoint: 0,
          warehouseId: warehouse.id,
        },
      });
      for (const [role, label] of [
        ['supplierA', '华东精密'],
        ['supplierB', '华北制造'],
      ]) {
        const supplier = await master(role, 'buyer', 'suppliers', {
          name: `核心流程 · ${label}`,
          businessDate: day,
          payload: { contact: '示例业务联系人', terms: 30 },
        });
        if (!state.records[`${role}Admission`]) {
          const admission = await request<CoreView>(
            'buyer',
            'srmCore/admission',
            {
              name: `核心流程 · ${label}准入`,
              sourceId: supplier.id,
              supplierId: null,
              deadline: '',
              data: {
                qualification: `CORE-${role}-QUALIFICATION`,
                validUntil: '2099-12-31',
                evidence:
                  '本地示例营业和质量资质核验记录，不代表真实供应商认证。',
              },
              requestKey: await key(`${role}Admission`),
            },
          );
          state.records[`${role}Admission`] = admission.id;
          await save();
        }
        let admission = (
          await request<{ record: CoreView }>(
            'buyer',
            `srmCore/admission/${state.records[`${role}Admission`]}`,
          )
        ).record;
        for (const [status, actor, action] of [
          ['draft', 'buyer', 'submit'],
          ['pending', 'approver', 'approve'],
        ])
          if (admission.status === status)
            admission = await request<CoreView>(
              actor,
              `srmCore/admission/${admission.id}/actions/${action}`,
              {
                version: admission.lifecycleVersion,
                requestKey: await key(`${role}Admission-${action}`),
              },
            );
        if (admission.status !== 'approved')
          throw new Error('Owned admission changed; no reset');
        const account = state.accounts[role]!;
        await db.transaction(async (tx) => {
          const repo = tx.repository<{
              id: string;
              userId: string;
              organizationId: string;
              supplierId: string | null;
              enabled: boolean;
              version: number;
            }>('opsMemberships'),
            old = await repo.findOne({ filter: { userId: account.id! } });
          if (old) {
            if (
              old.supplierId !== supplier.id ||
              old.organizationId !== 'main' ||
              !old.enabled
            )
              throw new Error('Owned supplier membership changed');
            return;
          }
          await repo.createOne({
            values: {
              id: account.id!,
              userId: account.id!,
              organizationId: 'main',
              supplierId: supplier.id,
              enabled: true,
              version: 1,
            },
          });
        });
      }
      const result = {
        kind: state.kind,
        changed: JSON.stringify(state) !== before,
        records: state.records,
        accounts: Object.entries(state.accounts).map(([role, a]) => ({
          role,
          email: a.email,
        })),
        credentialsFile: file,
        material: material.number,
      };
      if (!result.changed) this.setStatus('success-noop');
      await writeFile(
        app.paths.storage('core-demo/preparation.json'),
        JSON.stringify(result, null, 2),
      );
      return result;
    });
  }
}
