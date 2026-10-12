export default {
  single: 'Designated reviewer',
  settings: 'Purchase award approval',
  settingsHint:
    'When enabled, new award submissions go through two different reviewers. Existing applications retain their original process.',
  enabled: 'Enable native two-stage approval',
  purchasing: 'Purchasing manager',
  department: 'Department manager',
  choose: 'Choose an eligible reviewer',
  save: 'Save approval configuration',
  saved: 'Approval configuration saved',
  title: 'Native award approval',
  content:
    'Review the selected quotation and decision rationale above. Submitted content is frozen; changed quotation evidence refuses approval.',
  empty: 'No native approval has started for this record.',
  opinion: 'Approval opinion',
  required: 'Enter an approval opinion.',
  approve: 'Approve',
  reject: 'Reject',
  return: 'Return for correction',
  purchasingReview: 'Purchasing manager review',
  departmentReview: 'Department manager review',
  confirm: '{{action}} "{{name}}"',
  consequence:
    'Approval moves to the next reviewer; only the final approval creates a purchase order draft. Reject ends this submission; return reopens quotation selection.',
  success: '{{action}} completed for "{{name}}"',
  changed:
    'Configuration changed on the server. Refresh after preserving your unsaved input.',
  errors: {
    NO_ASSIGNEE:
      'No eligible reviewer is available. Ask an administrator to restore the configured reviewer.',
    NOT_ASSIGNEE: 'This task is assigned to another reviewer.',
    TASK_CLOSED: 'This approval task has ended. Refresh the record.',
    REASON_REQUIRED: 'Enter an approval opinion.',
    APPROVAL_REVIEWERS_REQUIRED:
      'Choose two different active internal reviewers with approval permission; neither may be the applicant.',
    CONFLICT: 'The record or configuration changed. Refresh and review again.',
    STALE_CONTENT: 'The reviewed content changed. Refresh and review again.',
    NOT_ALLOWED: 'This task is no longer available to you.',
    FORBIDDEN: 'You do not have permission to process this approval.',
    SELF_APPROVAL: 'Applicants cannot approve their own submission.',
    REQUIRED: 'Enter all required values.',
    FAILED: 'The operation failed. Your input was retained.',
  },
};
