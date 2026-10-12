import type { LocaleResource } from '@nocobase/i18n';

// The application's own server-side wording. It is empty because every string the server produces today belongs to a
// plugin's namespace; add keys here as the application starts producing its own, and use `overrides` to reword a
// plugin's.
const enUS = {
  srmApproval: {
    noticeTitle: 'Purchase award approval pending',
    noticeBody:
      'A new approval task has been assigned to you. Open the quotation, review the evidence and enter your opinion.',
  },
  showcase: {
    externalTitle: 'Local external system demonstration',
    externalNotice:
      'This is a local fixture. A real system requires an address and embedding permissions.',
    externalBody:
      'External system → NocoBase: order acknowledgments and supplier workspace.',
    board: 'NocoBase work board',
  },
};

export type AppServerResource = LocaleResource<typeof enUS>;

export default enUS;
