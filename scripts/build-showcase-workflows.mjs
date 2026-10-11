import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ConditionInstruction,
  RunInstruction,
  TerminateInstruction,
  WaitInstruction,
} from '@nocobase/app-plugin-workflow';
import {
  checkWorkflowPackage,
  buildApplicationWorkflows,
} from '@nocobase/app-plugin-workflow/build';
import { DeliveryInstruction } from '../server/workflow-instructions/delivery.ts';
const root = fileURLToPath(new URL('../', import.meta.url));
const instructions = new Map(
  [
    ConditionInstruction,
    RunInstruction,
    TerminateInstruction,
    WaitInstruction,
    DeliveryInstruction,
  ].map((node) => [node.type, node]),
);
const checked = await checkWorkflowPackage(
  path.join(root, 'workflows/delivery-approval'),
  { contracts: { nodes: instructions } },
);
if (!process.argv.includes('--check'))
  await buildApplicationWorkflows({
    sourceRoot: path.join(root, 'workflows'),
    resourceRoot: path.join(root, 'dist/workflows'),
    distRoot: path.join(root, 'dist/workflow-artifacts'),
    instructions,
  });
console.log(
  JSON.stringify({ validated: true, nodes: checked.ir.nodes.length }),
);
