import showcase from './showcase-zh-CN.js';
import operations from './operations-zh-CN.js';
import type { AppResource } from './en-US.js';
import systemZhCN from './system/zh-CN.js';

const zhCN: AppResource = {
  // The template's own copy; see `./en-US.ts`.
  ...systemZhCN,
  ops: operations,
  showcase,
};

export default zhCN;
