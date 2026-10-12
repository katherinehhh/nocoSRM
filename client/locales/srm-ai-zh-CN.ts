export default {
  currentQuantity: '当前来源数量',
  reserved: '已预留退供数量',
  available: '剩余可退数量',
  openResult: '打开结果单据',
  title: 'AI 业务助手',
  hint: '基于来源证据提出建议，经确认后执行业务操作；审批仍由独立人员完成。',
  purposes: {
    quoteDecision: 'AI 询比价评审',
    requestDraft: 'AI 采购需求录入',
    qualityReturn: 'AI 质量处置',
  },
  model: '模型服务',
  configured: '已配置模型，尚不代表连接已验证；成功分析后展示模型和时间。',
  unconfigured: '未配置模型，不能生成 AI 建议。',
  configure: '配置模型服务',
  evidence: '本次分析依据',
  evidenceHint:
    '来源 {{number}}，版本 {{version}}；确认时会重新检查来源及权限。',
  text: '补充需求或文件文本',
  textHint:
    '可粘贴采购需求、报价说明或质量记录。未知物料需人工核实，不会自动创建。',
  analyze: '分析并生成建议',
  working: '处理中…',
  proposal: '待确认的业务建议',
  inferred: '模型 {{model}} · {{at}} · 已记录模型调用用量',
  noEligible:
    '当前业务状态尚不符合处理条件。询价需有已提交报价，需求录入需为草稿，退供需质检已批准且收货已过账。',
  stale: '来源版本或有效期已变化，请刷新并重新分析。',
  noAction: '本次建议没有可执行操作，请先处理不确定项。',
  applied: '已对“{{name}}”执行确认的业务操作',
  confirm: '将 AI 建议应用到“{{name}}”？',
  confirmHint:
    '只执行已展示的定标提交或草稿更新，仍需后续独立审批。系统会重查来源、权限和版本，重复确认不会重复写入。',
  apply: {
    quoteDecision: '确认并提交定标',
    requestDraft: '确认更新询价明细',
    qualityReturn: '确认创建退供草稿',
  },
  failed: '分析未完成，请检查模型服务或稍后重试。',
  errors: {
    AI_INVALID_LINES:
      '报价评审不能改变采购明细，模型输出已被拒绝，请重新分析。',
    AI_INVALID_SELECTION: '推荐的报价不属于当前有效报价，请重新分析。',
    AI_EVIDENCE_UNVERIFIED:
      '模型引用无法对应当前来源证据，未执行操作，请重新分析。',
    MODEL_INCOMPLETE:
      '模型在输出预算内未返回完整业务结果，请重新分析或选择较少推理的模型。',
    CONFLICT: '来源证据已变化，请刷新后重新分析，不要重复确认旧建议。',
    TEXT_REQUIRED: '请填写需要识别的需求文本。',
    MODEL_FAILED:
      '模型调用失败，请检查模型连接、密钥或限额。没有生成或执行业务操作。',
    MODEL_UNCONFIGURED: '请先配置可用聊天模型。',
    AI_INVALID_OUTPUT:
      '模型输出不符合业务格式或来源约束，没有写入单据；请重新分析。',
    AI_NO_ACTION: '没有可执行的建议。',
    AI_EXPIRED: '建议已过期，请重新分析。',
    REQUEST_CHANGED: '请求标识已用于其他输入，请重新分析。',
  },
};
