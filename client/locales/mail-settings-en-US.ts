export default {
  invalidHost:
    'Enter a server hostname or IPv4 address without a URL scheme, path or credentials.',
  invalidPort: 'Enter a whole-number port from 1 to 65535.',
  invalidTenant:
    'Enter a tenant ID or domain; use common for the default tenant.',
  discardNotice:
    'Unsaved provider settings will be discarded. Saved configuration remains unchanged.',
  other: 'Other provider instances',
  otherHint:
    'These provider types remain managed by deployment configuration and are preserved.',
  saveEnable: 'Save and enable configuration',
  oauthHint:
    'Use the client ID and secret from your external OAuth application, not your email address or mailbox password.',
  title: 'Mail service configuration',
  description:
    'Configure a provider here, then connect your mailbox from Mail accounts. Saving updates the local service immediately.',
  accounts: 'Connect a mailbox',
  instance: 'Provider instance',
  callback: 'OAuth callback URL',
  callbackHint:
    'Register this exact URL in the external OAuth application. Mailbox authorization is completed separately.',
  storageHint:
    'Secrets are stored in a private server configuration file and never returned. Leave a saved secret blank to preserve it.',
  clientId: 'Client ID',
  clientSecret: 'Client secret',
  tenant: 'Tenant',
  host: 'Server host',
  port: 'Port',
  secure: 'Use TLS from connection start',
  imap: 'Incoming mail (IMAP)',
  smtp: 'Outgoing mail (SMTP)',
  secretSaved: 'Secret already set',
  secretMissing: 'Secret required for first configuration',
  save: 'Save',
  saving: 'Saving configuration',
  saved: 'Saved "{{name}}"',
  toggleFailed: 'Could not update "{{name}}"',
  configured: 'Configured',
  unconfigured: 'Not configured',
  enabled: 'Enabled',
  disabled: 'Disabled',
  enable: 'Enable',
  disable: 'Disable',
  disableTitle: 'Disable mail provider "{{name}}"?',
  disableNotice:
    'Connected accounts will be unavailable for sending and synchronization. Stored mail remains available; the provider can be enabled again.',
  cancel: 'Cancel',
  confirmDisable: 'Disable provider',
  required: 'Check this required field or value.',
  refresh: 'Refresh',
  forbidden: 'Only administrators can configure mail services.',
  draftHint: 'Save these changes before enabling or disabling the provider.',
  connectionHint:
    'IMAP/SMTP mailbox usernames and authorization passwords are entered on the account connection page.',
  errors: {
    CONFLICT:
      'Configuration changed. Keep your edits, then refresh and review before saving.',
    BUSY: 'Another configuration save is in progress. Try again shortly.',
    SECRET_REQUIRED: 'Enter a client secret for first configuration.',
    REQUEST_REUSED:
      'This save request changed. Edit the form and submit again.',
    SAVE_FAILED:
      'Configuration could not be applied. Your inputs were retained.',
    RELOAD_FAILED:
      'Configuration reload failed. Contact the administrator before connecting accounts.',
    INVALID: 'The provider configuration is invalid. Check the fields.',
    FAILED: 'Save failed. Your inputs were retained.',
  },
};
