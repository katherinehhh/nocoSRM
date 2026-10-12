export default {
  currentQuantity: 'Current source quantity',
  reserved: 'Reserved for return',
  available: 'Available for return',
  openResult: 'Open resulting document',
  title: 'AI business assistant',
  hint: 'Propose evidence-based actions for human confirmation; independent approval remains required.',
  purposes: {
    quoteDecision: 'AI quotation review',
    requestDraft: 'AI purchasing request entry',
    qualityReturn: 'AI quality disposition',
  },
  model: 'Model service',
  configured:
    'Model configured; connection is not yet verified. Successful analysis records its model and time.',
  unconfigured: 'No model configured; AI suggestions cannot be generated.',
  configure: 'Configure model service',
  evidence: 'Analysis evidence',
  evidenceHint:
    'Source {{number}}, version {{version}}; confirmation rechecks evidence and permissions.',
  text: 'Additional request or document text',
  textHint:
    'Paste purchasing needs, quotation notes or quality records. Unknown materials require verification and are never created automatically.',
  analyze: 'Analyze and propose',
  working: 'Processing…',
  proposal: 'Business proposal for confirmation',
  inferred: 'Model {{model}} · {{at}} · Model usage recorded',
  noEligible:
    'This state is not eligible. Quotation review needs submitted quotes; request entry needs a draft; returns need approved inspection and posted receipt.',
  stale:
    'The source version or validity has changed. Refresh and analyze again.',
  noAction: 'No business action is proposed. Resolve uncertainties first.',
  applied: 'Confirmed business action applied to "{{name}}"',
  confirm: 'Apply the AI proposal to "{{name}}"?',
  confirmHint:
    'Only the displayed award submission or draft update is applied. Independent approval remains required. Evidence, permissions and versions are rechecked; repeated confirmation does not duplicate writes.',
  apply: {
    quoteDecision: 'Confirm and submit award',
    requestDraft: 'Confirm RFQ line update',
    qualityReturn: 'Confirm return draft creation',
  },
  failed: 'Analysis did not complete. Check the model service or retry later.',
  errors: {
    AI_INVALID_LINES:
      'Quotation review cannot change purchasing lines. The model output was rejected; analyze again.',
    AI_INVALID_SELECTION:
      'The selected quotation is not valid for this source. Analyze again.',
    AI_EVIDENCE_UNVERIFIED:
      'The model citation does not match source evidence. No action was applied; analyze again.',
    MODEL_INCOMPLETE:
      'The model returned no complete business response within its budget. Analyze again or select a model with less reasoning.',
    CONFLICT:
      'Source evidence changed. Refresh and analyze again instead of confirming the old proposal.',
    TEXT_REQUIRED: 'Enter request text to analyze.',
    MODEL_FAILED:
      'Model call failed. Check connection, credentials or quota. No business operation was generated or executed.',
    MODEL_UNCONFIGURED: 'Configure an available chat model first.',
    AI_INVALID_OUTPUT:
      'The model output violates the schema or source constraints. No record was written; analyze again.',
    AI_NO_ACTION: 'No executable proposal.',
    AI_EXPIRED: 'Proposal expired. Analyze again.',
    REQUEST_CHANGED:
      'This request identifier was used for different input. Analyze again.',
  },
};
