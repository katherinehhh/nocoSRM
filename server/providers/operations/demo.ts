import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import type { UserAdministrationService } from '@nocobase/app-plugin-authentication';
import { OperationsService, type Actor } from './service.js';
import { roleNames, type Kind, type Doc } from '../../../shared/operations.js';
// Explicit developer demo operation. Never run from installation seeds or production startup.
export async function createDemo(
  service: OperationsService,
  authz: AppAuthorization,
  users: UserAdministrationService,
  password: string,
) {
  const actor: Actor = {
    id: 'demo-loader',
    organizationId: 'main',
    supplierId: null,
    policies: {},
    system: true,
  };
  const accounts: Record<string, string> = {};
  for (const role of Object.keys(roleNames)) {
    const email = `${role}@supply.demo.invalid`;
    const existing = await users.list({
      page: 1,
      pageSize: 100,
      search: email,
    });
    let user = existing.items.find((u) => u.email === email);
    if (!user)
      user = await users.create({
        name: `【演示】${roleNames[role][0]}`,
        email,
        password,
      });
    accounts[role] = user.id;
    const key = `operations-${role}`;
    const assigned = await authz.permissionSets.listAssignments(key);
    if (!assigned.some((a) => a.subject.id === user.id))
      await authz.permissionSets.assign({
        permissionSet: key,
        subject: { type: 'user', id: user.id },
      });
  }
  const result = await service.once(
    actor,
    'manufacturing-demo-v1',
    async (c) => {
      const make = async (
        k: Kind,
        name: string,
        payload: Doc['payload'] = {},
        supplierId: string | null = null,
        date = '2026-10-20',
        amount = 0,
      ) =>
        service.createIn(
          c,
          {
            ...actor,
            id: accounts[
              k === 'plans'
                ? 'planner'
                : [
                      'invoices',
                      'settlements',
                      'payments',
                      'taxScenarios',
                      'reconciliations',
                    ].includes(k)
                  ? 'finance'
                  : 'buyer'
            ],
          },
          k,
          {
            name: `【演示】${name}`,
            payload,
            supplierId,
            businessDate: date,
            amount,
          },
          true,
        );
      const suppliers = [];
      for (const [name, contact] of [
        ['苏州精工零部件', '王经理 · 采购协同'],
        ['宁波海拓电子', '刘经理 · 电子元件'],
        ['昆山联达包装', '陈经理 · 包材供应'],
      ])
        suppliers.push(await make('suppliers', name, { contact, terms: 30 }));
      const warehouse = await make('warehouses', '华东工厂原料仓');
      const materials = [];
      for (const [name, unit, point, stock] of [
        ['精密轴承 6205', '件', 500, 120],
        ['伺服控制板 V3', '块', 100, 42],
        ['铝合金支架 A08', '件', 800, 1600],
        ['工业连接器 M12', '个', 300, 85],
        ['防护包装箱', '套', 200, 600],
        ['耐高温密封圈', '个', 1000, 280],
      ] as const)
        materials.push(
          await make('materials', name, {
            unit,
            reorderPoint: point,
            openingStock: stock,
            warehouseId: warehouse.id,
          }),
        );
      const orders = [];
      for (let n = 0; n < 6; n++) {
        const supplier = suppliers[n % 3],
          material = materials[n],
          qty = [600, 160, 800, 500, 300, 1200][n],
          price = [28.5, 320, 16.8, 38, 12, 3.6][n];
        const line = {
          id: `line-${n}`,
          materialId: material.id,
          quantity: qty,
          price,
          taxRate: 13,
        };
        const plan = await make(
          'plans',
          `${material.name.replace('【演示】', '')}备料计划`,
          { lines: [line] },
          supplier.id,
        );
        await service.persist(
          c,
          actor,
          'plans',
          plan,
          { status: 'approved' },
          'approve',
        );
        const order = await make(
          'orders',
          `${supplier.name.replace('【演示】', '')} · 十月采购`,
          { lines: [line], sourceId: plan.id },
          supplier.id,
          `2026-10-${String([8, 12, 18, 22, 25, 28][n]).padStart(2, '0')}`,
        );
        orders.push(
          await service.persist(
            c,
            actor,
            'orders',
            order,
            {
              status: n < 2 ? 'confirmed' : n === 2 ? 'approved' : 'pending',
              payload: { ...order.payload, submittedBy: accounts.buyer },
            },
            'approve',
          ),
        );
      }
      const o = orders[0],
        ol = o.payload.lines![0];
      const receipt = await make(
        'receipts',
        '精密轴承首批到货',
        {
          orderId: o.id,
          warehouseId: warehouse.id,
          lines: [
            {
              ...ol,
              id: 'receipt-line',
              sourceLineId: ol.id,
              accepted: ol.quantity,
              rejected: 0,
            },
          ],
        },
        o.supplierId,
      );
      await service.persist(
        c,
        actor,
        'receipts',
        receipt,
        { status: 'posted' },
        'post',
      );
      await c.repository('opsStock').createOne({
        values: {
          id: `${receipt.id}:receipt-line`,
          sourceId: receipt.id,
          materialId: ol.materialId,
          warehouseId: warehouse.id,
          quantityMilli: ol.quantity * 1000,
          at: new Date().toISOString(),
        },
      });
      await service.persist(
        c,
        actor,
        'orders',
        o,
        { status: 'received' },
        'receive',
      );
      const invoice = await make(
        'invoices',
        '精工十月发票',
        {
          orderId: o.id,
          invoiceNumber: 'DEMO-INV-202610-001',
          lines: [{ ...ol, id: 'invoice-line', sourceLineId: ol.id }],
        },
        o.supplierId,
      );
      await service.persist(
        c,
        actor,
        'invoices',
        invoice,
        { status: 'matched' },
        'match',
      );
      const settlement = await make(
        'settlements',
        '精工首批采购结算',
        { orderId: o.id, receiptId: receipt.id, invoiceId: invoice.id },
        o.supplierId,
        '2026-10-15',
      );
      const settled = await service.persist(
        c,
        actor,
        'settlements',
        settlement,
        {
          status: 'approved',
          payload: {
            ...settlement.payload,
            approvedBy: accounts.approver,
            submittedBy: accounts.finance,
          },
        },
        'approve',
      );
      await make(
        'payments',
        '精工首期付款申请',
        { settlementId: settled.id },
        o.supplierId,
        '2026-10-15',
        settled.amount,
      );
      await make(
        'reconciliations',
        '精工十月对账',
        { from: '2026-10-01', to: '2026-10-31' },
        o.supplierId,
      );
      await make('taxScenarios', '十月进销项情景测算', {
        inputTax: 26340,
        outputTax: 48200,
        deductible: 100,
      });
      for (const [template, name, threshold] of [
        ['reorder', '安全库存补货建议', 0],
        ['delivery', '未来7天交期提醒', 7],
      ] as const)
        await make('policies', name, {
          template,
          threshold,
          timezone: 'Asia/Shanghai',
        });
      for (const [role, userId] of Object.entries(accounts))
        await c.repository('opsMemberships').createOne({
          values: {
            id: userId,
            userId,
            organizationId: 'main',
            supplierId: role === 'supplier' ? suppliers[0].id : null,
          },
        });
      return {
        suppliers: suppliers.length,
        materials: materials.length,
        orders: orders.length,
        accounts: Object.keys(accounts).map((role) => ({
          role,
          email: `${role}@supply.demo.invalid`,
        })),
      };
    },
  );
  return result;
}
