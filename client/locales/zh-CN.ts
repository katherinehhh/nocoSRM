import srmMail from './mail-settings-zh-CN.js';
import srmApproval from './srm-approval-zh-CN.js';
import approvalUiLocale from '../extensions/nocobase-approval-ui/locales/zh-CN.js';
import { approvalLocaleZhCN } from '@nocobase/app-plugin-approval/client';
import srmAi from './srm-ai-zh-CN.js';
import core from './core-zh-CN.js';
import srm from './srm-zh-CN.js';
import showcase from './showcase-zh-CN.js';
import operations from './operations-zh-CN.js';
import type { AppResource } from './en-US.js';
import systemZhCN from './system/zh-CN.js';

const zhCN: AppResource = {
  // The template's own copy; see `./en-US.ts`.
  ...systemZhCN,
  ops: operations,
  srm,
  core,
  srmAi,
  srmApproval,
  srmMail,
  ...approvalUiLocale,
  ...approvalLocaleZhCN,
  showcase,
};

export default zhCN;
