import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Application } from '@nocobase/app-server/application';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication';
import { userRoleScopeRegistryToken } from '@nocobase/app-plugin-users/server/tokens';
import { databaseManagerToken } from '@nocobase/db';
import { operationsToken } from '../../../server/providers/operations/index.js';
import type { Actor } from '../../../server/providers/operations/service.js';
import type { Doc } from '../../../shared/operations.js';
import type { Delivery } from '../../../shared/showcase.js';
interface DeliveryView {
  record: Delivery;
  wait: { status: string } | null;
}
interface Account {
  id?: string;
  email: string;
  password: string;
  role: string;
  name: string;
}
interface DemoState {
  kind: 'srm-client-demo-v1';
  accounts: Record<string, Account>;
  master?: { supplier: Doc; material: Doc; warehouse: Doc };
  records: Record<string, string>;
  steps: string[];
}
interface Ledger {
  id: string;
  version: string;
  disposition: string;
  localAmount: number;
  localQuantity: number;
  externalQuantity: number | null;
  quantityDifference: number | null;
  provenance: string;
}
const roles = ['buyer', 'approver', 'warehouse', 'supplier', 'policy'] as const;
const labels = ['采购员', '审批员', '仓储员', '供应商', '业务配置员'];
async function loadState(file: string): Promise<DemoState> {
  try {
    const value = JSON.parse(await readFile(file, 'utf8')) as DemoState;
    if (value.kind !== 'srm-client-demo-v1')
      throw new Error('Unexpected demo manifest');
    return value;
  } catch (e) {
    if (!(e instanceof Error && 'code' in e && e.code === 'ENOENT')) throw e;
    return {
      kind: 'srm-client-demo-v1',
      accounts: Object.fromEntries(
        roles.map((role, i) => [
          role,
          {
            email: `srm-demo-${role}@customer-demo.invalid`,
            password: randomBytes(24).toString('base64url'),
            role: `operations-${role}`,
            name: `客户演示 · ${labels[i]}`,
          },
        ]),
      ),
      records: {},
      steps: [],
    };
  }
}
export async function runCustomerDemo(app: Application) {
  const origin = app.config.get('app.publicOrigin') as string;
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin))
    throw new Error('Customer demo command requires a configured local origin');
  const file = app.paths.storage('customer-demo/state.json');
  const state = await loadState(file);
  const before = JSON.stringify(state);
  async function save() {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(state, null, 2), { mode: 0o600 });
    await chmod(file, 0o600);
  }
  await save();
  const users = app.container.resolve(userAdministrationServiceToken),
    db = app.container.resolve(databaseManagerToken),
    scope = app.container.resolve(userRoleScopeRegistryToken).get('app'),
    operations = app.container.resolve(operationsToken);
  if (!scope) throw new Error('Native role scope unavailable');
  const owner: Actor = {
    id: 'srm-client-demo-v1',
    organizationId: 'main',
    supplierId: null,
    policies: {},
    system: true,
  };
  // Explicit local CLI provisioning only. No production HTTP demo endpoint or startup seed.
  if (!state.master) {
    const supplier = await operations.create(
      owner,
      'suppliers',
      {
        name: '客户演示 · 华东精密供应商',
        payload: { contact: '客户演示联系人', terms: 30 },
        notes: '客户演示专用，不关联实际供应商',
      },
      'customer-demo-supplier-v1',
    );
    const material = await operations.create(
      owner,
      'materials',
      {
        name: '客户演示 · 精密轴承6205',
        payload: { unit: '件', openingStock: 0, reorderPoint: 5 },
        notes: '客户演示专用',
      },
      'customer-demo-material-v1',
    );
    const warehouse = await operations.create(
      owner,
      'warehouses',
      { name: '客户演示 · 原料仓', payload: {}, notes: '客户演示专用' },
      'customer-demo-warehouse-v1',
    );
    state.master = { supplier, material, warehouse };
    await save();
  }
  for (const role of roles) {
    const account = state.accounts[role];
    let user = account.id ? await users.get(account.id) : undefined;
    if (!user) {
      const existing = (await users.list({ search: account.email })).items.find(
        (u) => u.email === account.email,
      );
      if (existing)
        throw new Error(
          `Account identity collision: ${role}; no password reset was performed`,
        );
      user = await users.create(account);
      account.id = user.id;
      await save();
    }
    if (user.email !== account.email || user.disabledAt)
      throw new Error(`Account changed or disabled: ${role}`);
    await db.transaction(async (tx) => {
      const current = await scope.get(user.id, tx),
        expected = [account.role];
      if (JSON.stringify(current) !== JSON.stringify(expected)) {
        if (
          (Array.isArray(current) ? current : [current]).filter(Boolean).length
        )
          throw new Error(`Unexpected existing grants: ${role}`);
        await scope.replace(user.id, expected, tx);
      }
      const repo = tx.repository<{
        id: string;
        userId: string;
        organizationId: string;
        supplierId: string | null;
        enabled: boolean;
        version: number;
      }>('opsMemberships');
      const supplierId = role === 'supplier' ? state.master!.supplier.id : null;
      const old = await repo.findOne({ filter: { userId: user.id } });
      if (old) {
        if (
          old.organizationId !== 'main' ||
          old.supplierId !== supplierId ||
          !old.enabled
        )
          throw new Error(`Business membership changed: ${role}`);
      } else
        await repo.createOne({
          values: {
            id: `customer-demo:${user.id}`,
            userId: user.id,
            organizationId: 'main',
            supplierId,
            enabled: true,
            version: 1,
          },
        });
    });
  }
  const sessions: Record<string, string> = {};
  async function request<T>(
    role: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const r = await app.fetch(
      new Request(`${origin}/api/${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
          ...(sessions[role] ? { Cookie: sessions[role] } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
    if (!r.ok) {
      let reason = 'request failed';
      try {
        const payload = (await r.json()) as {
          error?: { reason?: string };
          code?: string;
        };
        reason = payload.error?.reason ?? payload.code ?? reason;
      } catch {
        /* Never log request bodies, passwords or response secrets. */
      }
      throw new Error(`${role}:${path}:${r.status}:${reason}`);
    }
    return (await r.json()) as T;
  }
  for (const role of roles) {
    const account = state.accounts[role];
    const signIn = () =>
      app.fetch(
        new Request(`${origin}/api/auth/sign-in/email`, {
          method: 'POST',
          headers: { Origin: origin, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: account.email,
            password: account.password,
          }),
        }),
      );
    let r = await signIn();
    for (let retry = 0; r.status === 429 && retry < 3; retry++) {
      // Honor native production throttling; never rotate IPs or disable it.
      const seconds = Number(r.headers.get('Retry-After'));
      await new Promise((done) =>
        setTimeout(
          done,
          Number.isFinite(seconds) && seconds > 0
            ? Math.min(seconds * 1000, 60000)
            : 10000,
        ),
      );
      r = await signIn();
    }
    if (!r.ok) throw new Error(`Native sign-in failed: ${role}:${r.status}`);
    sessions[role] = r.headers
      .getSetCookie()
      .map((v) => v.split(';')[0])
      .join('; ');
    if (!sessions[role])
      throw new Error(`Native sign-in did not establish a session: ${role}`);
  }
  // The runtime schema is the authority. Read swagger through the native authenticated route.
  await request('buyer', 'swagger');
  const workflow = (
    await request<{
      data: {
        key: string;
        id: string | null;
        hash: string;
        enabled: boolean;
      }[];
    }>('policy', 'workflows')
  ).data.find((w) => w.key === 'delivery-approval');
  if (!workflow) throw new Error('Delivery approval workflow unavailable');
  if (!workflow.enabled)
    await request(
      'policy',
      `workflows/${workflow.id ?? workflow.hash}/enable`,
      {},
    );
  const master = state.master;
  const scopedOrders = (
    await request<{ data: Doc[] }>('supplier', 'operations/orders')
  ).data;
  if (scopedOrders.some((o) => o.supplierId !== master.supplier.id))
    throw new Error('Supplier scope readback failed');

  const date = new Date().toISOString().slice(0, 10);
  async function order(key: string, name: string) {
    if (!state.records[key]) {
      const result = await request<{ data: Doc }>(
        'buyer',
        'operations/orders',
        {
          name,
          supplierId: master.supplier.id,
          businessDate: date,
          notes: '客户演示；使用真实业务接口与状态流转',
          payload: {
            lines: [
              {
                id: 'demo-order-line',
                materialId: master.material.id,
                quantity: 10,
                price: 100,
                taxRate: 13,
              },
            ],
          },
          requestId: `customer-demo:${key}`,
        },
      );
      state.records[key] = result.data.id;
      await save();
    }
    return (
      await request<{ data: Doc }>(
        'buyer',
        `operations/orders/${state.records[key]}`,
      )
    ).data;
  }
  let po = await order('verifiedOrder', '客户演示 · 已验证采购闭环');
  async function actOrder(role: string, action: string) {
    po = (
      await request<{ data: Doc }>(
        role,
        `operations/orders/${po.id}/actions/${action}`,
        { version: po.version, requestId: `customer-demo:order:${action}` },
      )
    ).data;
    state.steps.push(`order:${action}`);
    await save();
  }
  if (po.status === 'draft') await actOrder('buyer', 'submit');
  if (po.status === 'pending') await actOrder('approver', 'approve');
  if (po.status === 'approved') await actOrder('supplier', 'confirm');
  if (!state.records.verifiedDelivery) {
    const options = await request<{
      data: {
        id: string;
        version: number;
        sourceLines: {
          id: string;
          sku: string;
          name: string;
          quantity: number;
        }[];
      }[];
    }>('buyer', `showcase/orders?orderId=${po.id}`);
    const source = options.data.find((o) => o.id === po.id);
    if (!source) throw new Error('Confirmed source order missing');
    const delivery = await request<{ data: Delivery }>(
      'buyer',
      'showcase/deliveryPlans',
      {
        name: '客户演示 · 已验证交货闭环',
        orderId: po.id,
        expectedOrderVersion: source.version,
        region: 'CN',
        businessDate: date,
        notes: '客户演示；人工签收回执核对',
        labelCount: 10,
        lines: source.sourceLines.map((l) => ({
          sourceLineId: l.id,
          sku: l.sku,
          name: l.name,
          fnsku: '',
          allocation: l.quantity,
          unitsPerBox: 5,
        })),
        requestId: 'customer-demo:verified-delivery',
      },
    );
    state.records.verifiedDelivery = delivery.data.id;
    await save();
  }
  const deliveryId = state.records.verifiedDelivery;
  async function delivery() {
    return (
      await request<{ data: DeliveryView }>(
        'buyer',
        `showcase/deliveryPlans/${deliveryId}`,
      )
    ).data;
  }
  async function fire(role: string, action: string) {
    const current = await delivery();
    await request(role, `showcase/deliveryPlans/${deliveryId}/fire`, {
      transition: action,
      expectVersion: current.record.lifecycleVersion,
      requestId: `customer-demo:delivery:${action}`,
    });
    state.steps.push(`delivery:${action}`);
    await save();
  }
  let view = await delivery();
  if (view.record.status === 'draft') await fire('buyer', 'submit');
  view = await delivery();
  if (view.record.status === 'pending') {
    for (let attempt = 0; attempt < 100; attempt++) {
      view = await delivery();
      if (view.wait?.status === 'pending') break;
      await new Promise((done) => setTimeout(done, 150));
    }
    if (view.wait?.status !== 'pending')
      throw new Error('Approval wait node not ready');
    await fire('approver', 'approve');
    for (let attempt = 0; attempt < 100; attempt++) {
      view = await delivery();
      if (view.record.status === 'approved') break;
      await new Promise((done) => setTimeout(done, 150));
    }
  }
  view = await delivery();
  if (view.record.status === 'approved') await fire('supplier', 'ship');
  view = await delivery();
  if (view.record.status === 'shipped') await fire('warehouse', 'receive');
  view = await delivery();
  if (view.record.status !== 'completed')
    throw new Error(`Delivery did not complete:${view.record.status}`);
  if (!state.records.receipt) {
    const result = await request<{ data: Doc }>(
      'warehouse',
      'operations/receipts',
      {
        name: '客户演示 · 已验证入库单',
        supplierId: master.supplier.id,
        businessDate: date,
        notes: '客户演示；实际库存过账',
        payload: {
          orderId: po.id,
          warehouseId: master.warehouse.id,
          lines: [
            {
              id: 'demo-receipt-line',
              sourceLineId: 'demo-order-line',
              materialId: master.material.id,
              quantity: 10,
              accepted: 10,
              rejected: 0,
              price: 100,
              taxRate: 13,
              warehouseId: master.warehouse.id,
            },
          ],
        },
        requestId: 'customer-demo:receipt',
      },
    );
    state.records.receipt = result.data.id;
    await save();
  }
  let receipt = (
    await request<{ data: Doc }>(
      'warehouse',
      `operations/receipts/${state.records.receipt}`,
    )
  ).data;
  if (receipt.status === 'draft' && receipt.qualityRequired) {
    if (!state.records.inspectionRequestKey) {
      state.records.inspectionRequestKey = randomUUID();
      await save();
    }
    if (!state.records.inspection) {
      const created = await request<{ data: { id: string } }>(
        'warehouse',
        'srmCore/inspection',
        {
          name: '客户演示 · 收货质检',
          sourceId: receipt.id,
          supplierId: null,
          deadline: '',
          data: {
            sourceVersion: receipt.version,
            criteria: '采购规格与外观核验',
            evidence: '客户演示收货10件，核验合格10件，不合格0件',
            lines: receipt.payload.lines!.map((l) => ({
              id: l.id,
              materialId: l.materialId,
              quantity: l.quantity,
              accepted: l.quantity,
              rejected: 0,
            })),
          },
          requestKey: state.records.inspectionRequestKey,
        },
      );
      state.records.inspection = created.data.id;
      await save();
    }
    let inspection = (
      await request<{
        data: {
          record: { id: string; status: string; lifecycleVersion: number };
        };
      }>('warehouse', `srmCore/inspection/${state.records.inspection}`)
    ).data.record;
    if (inspection.status === 'draft')
      inspection = (
        await request<{ data: typeof inspection }>(
          'warehouse',
          `srmCore/inspection/${inspection.id}/actions/submit`,
          { version: inspection.lifecycleVersion, requestKey: randomUUID() },
        )
      ).data;
    if (inspection.status === 'pending')
      inspection = (
        await request<{ data: typeof inspection }>(
          'approver',
          `srmCore/inspection/${inspection.id}/actions/approve`,
          { version: inspection.lifecycleVersion, requestKey: randomUUID() },
        )
      ).data;
    if (inspection.status !== 'approved')
      throw new Error('Receipt inspection not approved');
    receipt = (
      await request<{ data: Doc }>(
        'warehouse',
        `operations/receipts/${receipt.id}`,
      )
    ).data;
  }
  if (receipt.status === 'draft')
    receipt = (
      await request<{ data: Doc }>(
        'warehouse',
        `operations/receipts/${receipt.id}/actions/post`,
        { version: receipt.version, requestId: 'customer-demo:receipt-post' },
      )
    ).data;
  if (receipt.status !== 'posted')
    throw new Error(`Receipt not posted:${receipt.status}`);
  async function acknowledge(quantity: number, key: string) {
    if (state.steps.includes(key)) return;
    const row = (
      await request<{ data: Ledger }>(
        'buyer',
        `showcase/businessLedger/${deliveryId}`,
      )
    ).data;
    const result = (
      await request<{ data: Ledger }>(
        'buyer',
        `showcase/businessLedger/${deliveryId}/acknowledgment`,
        {
          amount: row.localAmount,
          quantity,
          reference: `客户演示签收凭证-${quantity}`,
          reason:
            quantity === 8
              ? '首次人工登记签收8件，与订单10件存在2件差异'
              : '补充签收凭证确认共10件，核对台账随真实登记更新',
          expectedVersion: row.version,
          requestId: key,
        },
      )
    ).data;
    if (quantity === 8 && result.disposition !== 'disputed')
      throw new Error('Discrepancy did not appear');
    if (quantity === 10 && result.disposition !== 'matched')
      throw new Error('Ledger did not reconcile');
    state.steps.push(key);
    await save();
  }
  await acknowledge(8, 'customer-demo:ack-eight');
  await acknowledge(10, 'customer-demo:ack-ten');
  const ledger = (
    await request<{ data: Ledger }>(
      'buyer',
      `showcase/businessLedger/${deliveryId}`,
    )
  ).data;
  if (
    ledger.disposition !== 'matched' ||
    ledger.externalQuantity !== 10 ||
    ledger.quantityDifference !== 0
  )
    throw new Error('Readback ledger mismatch');
  const inventory = (
    await request<{ data: (Doc & { stock: number })[] }>(
      'warehouse',
      'operations/stock',
    )
  ).data.find((m) => m.id === master.material.id);
  if (inventory?.stock !== 10)
    throw new Error('Stock posting readback is not 10');
  await order('readyOrder', '客户演示 · 现场新建采购流程');
  const report = {
    kind: state.kind,
    changed: JSON.stringify(state) !== before,
    records: state.records,
    ledger: {
      status: ledger.disposition,
      localQuantity: ledger.localQuantity,
      externalQuantity: ledger.externalQuantity,
      quantityDifference: ledger.quantityDifference,
    },
    receipt: receipt.status,
    stock: inventory.stock,
    delivery: view.record.status,
    accounts: roles.map((r) => ({ role: r, email: state.accounts[r].email })),
    credentialsFile: file,
    steps: state.steps,
  };
  await writeFile(
    app.paths.storage('customer-demo/result.json'),
    JSON.stringify(report, null, 2),
  );
  return report;
}
