import srmApproval from './srm-approval-en-US.js';
import approvalUiLocale from '../extensions/nocobase-approval-ui/locales/en-US.js';
import { approvalLocaleEnUS } from '@nocobase/app-plugin-approval/client';
import srmAi from './srm-ai-en-US.js';
import core from './core-en-US.js';
import srm from './srm-en-US.js';
import showcase from './showcase-en-US.js';
import operations from './operations-en-US.js';
import type { LocaleResource } from '@nocobase/i18n';

import systemEnUS from './system/en-US.js';

const enUS = {
  // The template's own copy: the shell, the sign-in pages, shared components and the homepage. Keep it in
  // `./system/` so a template upgrade can replace it without touching the application's copy below.
  ...systemEnUS,
  ops: operations,
  srm,
  core,
  srmAi,
  srmApproval,
  ...approvalUiLocale,
  ...approvalLocaleEnUS,
  showcase,
  // The application's copy goes here, one group per feature. A shared group such as `navigation` is extended by
  // spreading the system one first, `navigation: { ...systemEnUS.navigation, orders: 'Orders' }`, since a group
  // written here replaces the system group of the same name rather than merging with it.
};

/**
 * The shape every locale of this application follows, derived from the English wording above.
 *
 * Anything a plugin does not translate falls back to this namespace, so a term defined here is reused everywhere
 * without each plugin repeating it.
 */
export type AppResource = LocaleResource<typeof enUS>;

export default enUS;
