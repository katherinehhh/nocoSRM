export default {
  openFinance: 'Open finance workspace (new window)',
  financeBoundary:
    'SRM handles delivery checks and discrepancies. Settlement, invoices and payments belong to the separate finance app. Posted receipts and finance outcomes synchronize through signed APIs. Each application requires its own sign-in.',
  modelSetupHint:
    'Choose a provider to prefill the name, URL and model. Usually only its API key is needed.',
  modelPresetHint:
    'Defaults are editable. Changing provider preserves custom values and clears the old key. Generic compatible services need their own URL and model.',
  modelUrlInvalid:
    'Enter an HTTP(S) service URL, not an email or a URL containing credentials.',
  modelUrlRequired: 'A generic compatible service needs a base URL.',
  modelKeyRequired: 'Enter the selected provider’s API key.',
  modelNameLength: 'Use at most 100 characters for the service name.',
  modelIdLength: 'Use at most 200 characters for the model ID.',
  modelKeyKeep:
    'A key is saved. Leave blank to keep it, or enter a replacement.',
  modelKeyHint:
    'Use an API key from the model provider, not your application password. Local Ollama can leave it blank.',
  modelUrlHint:
    'Known providers use native default URLs. Adjust proxy, region or workspace URLs to match your service.',
  modelPlaceholders: {
    title: 'For example: Supply chain assistant',
    baseUrl: 'https://model-service-url',
    apiKey: 'Paste the provider API key',
    model: 'Model ID from your provider',
  },
  markReview: 'Mark as needing review',
  productName: 'Product name',
  documentTruncated:
    'Only the first 10 pages and 20,000 characters were extracted. Add any missing evidence.',
  disableModel: 'Disable model service "{{name}}"?',
  disableModelDescription: 'This service will no longer accept model calls.',
  discardTitle: 'Discard unsaved changes?',
  discardDescription: 'Your changes will not be saved.',
  discard: 'Discard',
  defaultModel: 'Default chat model',
  inbound: 'Inbound',
  outbound: 'Outbound',
  succeeded: 'Succeeded',
  failed: 'Failed',
  externalReference: 'External reference',
  externalTitle: 'Local external system',
  externalNotice:
    'This is a local fixture. A real system requires an address and embedding permissions.',

  workflowEnabled: 'Approval workflow enabled',
  enableWorkflow: 'Enable delivery approval workflow',
  guide: 'Operations guide',
  description:
    'Follow delivery plans through workflows, integrations and assisted operations.',
  saved: 'Operation saved',
  error: 'Operation failed. Refresh the data and try again.',
  story: 'Manufacturing delivery collaboration',
  storyDescription:
    'Suggested order: create → approve → ship → sync → reconcile → print → AI assistance.',
  localNotice:
    'Local demonstration uses an external-system fixture and rule analysis. Real AI and mail require configured services.',
  newScenario: 'Create demonstration scenario',
  start: 'Start demonstration',
  open: 'Open',
  deliveryPlans: 'Delivery plans',
  deliveryDescription:
    'A native lifecycle owns status; submission starts the native approval workflow.',
  ledger: 'Delivery reconciliation ledger',
  ledgerDescription:
    'Compare order amounts with external delivery acknowledgments and record discrepancies. Recheck after source updates.',
  localAmount: 'Order amount',
  externalAmount: 'External amount',
  difference: 'Amount difference',
  invoiceAmount: 'Matched invoice amount',
  registeredPayments: 'Registered payment amount',
  updatedAt: 'Updated',
  cap: 'Only the first {{count}} records are shown. Narrow the filters.',
  board: 'Work board',
  boardDescription:
    'Organize work by delivery state. Open a card to inspect evidence and perform allowed transitions.',
  print: 'Print PDF',
  stateDescription:
    'Declared transitions validate the record version and retain history.',
  lines: 'Delivery lines',
  linesDescription:
    'SKU, FNSKU and quantities drive reports and barcode labels.',
  actions: 'Actions',
  approvalNotice:
    'A human approver must differ from the submitter. An accepted request is applied by the workflow.',
  enablePolicy: 'Enable low-risk approval',
  disablePolicy: 'Disable low-risk approval',
  waitStatus: 'Native wait node: {{status}}',
  history: 'State history',
  historyDescription: 'Native lifecycle history retains actors and timestamps.',
  actor: 'Actor',
  newDelivery: 'Create delivery plan',
  editDelivery: 'Edit delivery plan',
  required: 'Complete this required field.',
  invalidLine: 'Check the value and its allowed range.',
  chooseOrder: 'Choose an order',
  removeLine: 'Remove line',
  addLine: 'Add line',
  labelCount: 'Label count',
  resolve: 'Confirm reconciliation disposition',
  evidence: 'Reconciliation evidence',
  resolutionNotice:
    'Record the reason and actor without changing source records. Recheck after source data changes.',
  reason: 'Reason',
  mail: 'Mail center',
  mailDescription:
    'Native mailbox workspace. Connect an account to synchronize and process mail.',
  integrations: 'Integrations',
  integrationDescription:
    'Inspect signed inbound callbacks and external connection status.',
  sync: 'Synchronize external data',
  signatureNotice:
    'Callbacks use HMAC-SHA256, a five-minute window and event deduplication.',
  connectorReady: 'Signed connector configured.',
  connectorUnconfigured:
    'Real connector is unconfigured. The local fixture uses the same validation path.',
  callback: 'Simulate signed callback',
  failDelivery: 'Simulate delivery failure',
  events: 'Integration events',
  eventsDescription: 'Inspect inbound and outbound events and retry attempts.',
  direction: 'Direction',
  attempts: 'Attempts',
  embeds: 'Page embedding',
  embedDescription:
    'Embed a local external-system fixture here; its host page embeds the live work board.',
  externalHost: 'Open external system host',
  externalPage: 'Local external-system fixture',
  templates: 'Print templates',
  templateDescription:
    'Configure columns, language and Code 128 label grids with revision history.',
  revision: 'Template revision {{revision}}',
  grid: '{{columns}} columns × {{rows}} rows per page; {{count}} labels.',
  templateSafe:
    'Templates accept allowlisted columns and bounded layout options.',
  language: 'Language',
  chinese: 'Chinese',
  english: 'English',
  columns: 'Report columns',
  ai: 'AI workbench',
  aiDescription:
    'Extract facts, check evidence and confirm supported business operations.',
  employeesTitle: 'Native AI employee presets',
  employeeNotice:
    'Presets are registered with Agents. Rule rehearsal is not model inference.',
  employee: 'Employee role',
  mode: 'Mode',
  rulesMode: 'Local rule rehearsal',
  modelMode: 'Real model analysis',
  modelReady: 'A model service is configured for inference.',
  modelUnconfigured:
    'No model configured. Ask an administrator to configure a model service.',
  analyze: 'Analyze document text',
  analyzeDescription:
    'Upload text, CSV, JSON or Markdown, or paste unstructured text. Inspect facts, evidence and missing fields.',
  uploadText: 'Text PDF (2 MB) or TXT / CSV / JSON / MD (64 KB)',
  fileTooLarge:
    'File too large: PDF up to 2 MB; text up to 64 KB and 20,000 characters.',
  sourceText: 'Source text',
  sampleText: 'SKU 24124.05TP.V2, quantity 30, FNSKU 1, destination AU.',
  result: 'Analysis and evidence',
  naturalLanguage: 'Natural-language operations',
  proposalNotice:
    'Supports printing and confirming reconciliation. Preview and confirm before permission and version checks. Payment and approval are not supported here.',
  target: 'Target delivery plan',
  chooseTarget: 'Choose a target record',
  instruction: 'Operation request',
  utteranceExample: 'Print this delivery plan',
  preview: 'Preview operation',
  apply: 'Confirm operation',
  proposedAction: 'Proposed action: {{action}}',
  proposalVersion: 'Record version {{version}}; expires at {{expiry}}',
  confirmAction: 'Apply "{{action}}" to "{{name}}"?',
  confirmConsequence:
    'The system will apply the preview after rechecking permissions, target and version.',
  models: 'Model services',
  modelsDescription:
    'Configure services through the native Agents API. Keys are write-only.',
  newModel: 'Add model service',
  provider: 'Provider',
  credentials: 'Credentials',
  configured: 'Configured',
  unconfigured: 'Unconfigured',
  enabled: 'Enabled',
  disabled: 'Disabled',
  secretNotice:
    'Keys are submitted only when saved and never returned. Leave blank to preserve a saved key.',
  group: 'Delivery collaboration',
  metrics: {
    count: 'Delivery plans',
    pending: 'Pending approval',
    completed: 'Completed',
  },
  pages: {
    'delivery-plans': 'Delivery plans',
    'work-board': 'Work board',
    'business-ledger': 'Delivery reconciliation ledger',
    integrations: 'Integrations',
    'print-templates': 'Print templates',
    'ai-workbench': 'AI workbench',
    'mail-center': 'Mail center',
  },
  steps: {
    'delivery-plans':
      'Create and submit a plan; approve using another account.',
    'work-board': 'Inspect state changes; open a card to ship and receive.',
    'business-ledger':
      'Compare local and external data; record reconciliation.',
    integrations:
      'Synchronize, receive callbacks, retry failures and embed pages.',
    'print-templates':
      'Edit a template, then print the report and barcode labels.',
    'ai-workbench':
      'Analyze unstructured text; preview and confirm operations.',
    'mail-center': 'Show the native workspace; real mail requires an account.',
  },
  fields: {
    supplier: 'Supplier',
    labelCount: 'Label count',
    number: 'Plan number',
    businessDate: 'Delivery date',
    orderId: 'Purchase order',
    amount: 'Order amount',
    version: 'Record version',
    workflow: 'Native workflow run',
    decision: 'Decision request status',
    notes: 'Notes',
    sku: 'SKU',
    name: 'Name',
    fnsku: 'FNSKU',
    allocation: 'Allocation',
    unitsPerBox: 'Units per box',
    region: 'Region',
    boxes: 'Boxes',
  },
  actionsCopy: {
    submit: 'Submit for approval',
    approve: 'Approve',
    reject: 'Reject',
    ship: 'Ship',
    receive: 'Receive',
    rework: 'Rework',
  },
  supplierFilter: 'Filter by supplier name or ID',
  noResults: 'No matching records. Clear or adjust the filters.',
  analysisFields: { sku: 'SKU', quantity: 'Quantity', fnsku: 'FNSKU' },
  missingFields: 'Missing fields',
  emptyTitle: 'No records yet',
  emptyDescription:
    'Create a business record or ask an administrator to configure business access.',
  signInAgain: 'Sign in again',
  askAdministrator: 'Ask an administrator to check your access permissions.',
  operationComplete: 'Completed {{operation}} {{name}}',
  extractDocument: 'Extract document text',
  retryEvent: 'Retry event',
  editTemplate: 'Edit print template',
  modelNewTitle: 'Create model service',
  modelEditTitle: 'Edit model service',
  eventIdentity: 'Event number',
  eventSource: 'Data source',
  allDirections: 'All directions',
  allProviders: 'All providers',
  listSearch: 'Search number, name, SKU, supplier or external reference',
  effects: 'Tasks following state changes',
  effectName: 'Task',
  workflowNotice:
    'After submission the native workflow checks conditions, automatically approves low risk, or waits for another approver.',
  currentValue: 'Current ledger status',
  proposedValue: 'Ledger status after confirmation',
  printOnly:
    'Generate a private print document without changing business data.',
  sourceUnchanged:
    'Record only the ledger disposition; order, invoice and payment sources retain their values. Reconcile again after source changes.',
  presenterTitle: '15-minute customer demonstration',
  presenterPrerequisites:
    'Prepare an administrator and a separate approver. Enable the approval workflow here. Real models, mailboxes and external services require separate configuration.',
  presenterSequence:
    'Minutes0–4: create a scenario and delivery plan, submit approval and inspect the board. Minutes4–8: ship, receive, synchronize, retry a failure and resolve a ledger difference. Minutes8–11: edit the template and print the report/barcodes. Minutes11–15: paste or upload a document, inspect evidence, preview and confirm a natural-language action, then show mail and bidirectional embedding.',
  presenterLowRisk:
    'Automatic branch: use a real order of ¥5,000 or less, enable the low-risk policy, and submit without external discrepancies. Human branch: disable the policy or exceed the threshold and approve using another account.',
  presenterAI:
    'Example requests: Print this delivery plan; mark this record as needs review; resolve: supplier acknowledgment checked. Demonstration mode uses explicitly labeled local rules.',
  presenterRepeat:
    'Demo data is retained. Create another scenario to start with new drafts; synchronization recalculates the ledger. Preserve existing business records when repeating the demonstration.',
  disablePolicyTitle: 'Disable low-risk approval for "{{name}}"?',
  disablePolicyNotice: 'This plan will require a separate human approver.',
  syncLimit:
    'Each local synchronization processes the latest100 accessible delivery plans.',
  states: {
    rejected: 'Rejected',
    needsReview: 'Needs review',
    resolved: 'Resolved',
    matched: 'Matched',
    disputed: 'Disputed',
  },
  employeeDescriptions: {
    delivery: 'Extract delivery facts and evidence.',
    approval: 'Check approval risks and missing evidence.',
    ledger: 'Compare ledger sources and discrepancies.',
  },
  employees: {
    delivery: 'Delivery assistant',
    approval: 'Approval checker',
    ledger: 'Ledger reviewer',
  },
  modelFields: {
    title: 'Service title',
    baseUrl: 'Endpoint URL',
    apiKey: 'API key',
    model: 'Model identifier',
  },
  templateFields: {
    title: 'Report title',
    labelColumns: 'Label columns (1–6)',
    labelRows: 'Label rows (1–10)',
    labelCount: 'Label count (1–400)',
  },
  errors: {
    CONFLICT: 'Data changed. Refresh before trying again.',
    SELF_APPROVAL: 'You cannot approve your own submission.',
    WORKFLOW_DISABLED: 'An administrator must enable the approval workflow.',
    NOT_READY: 'The workflow is still processing. Refresh shortly.',
    MODEL_UNCONFIGURED: 'No real model configured.',
    UNSUPPORTED: 'This request is outside the supported operations.',
    FORBIDDEN: 'Your account cannot perform this operation.',
    KEY_REUSED: 'The request key was used for different content.',
    EXPIRED: 'The preview expired. Prepare a new preview.',
  },
};
