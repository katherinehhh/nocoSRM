import {
  defineCliPlugins,
  defineCliPlugin,
  type AppCliPlugins,
} from '@nocobase/app-cli';
import scheduler from '@nocobase/app-plugin-scheduler/cli';
import workflow from '@nocobase/app-plugin-workflow/cli';
import agents from '@nocobase/app-plugin-agents/cli';

// Array order is command registration order. A plugin contributes its commands
// by appearing in this list; removing its entry and its import removes them.
const cliPlugins: AppCliPlugins = defineCliPlugins([
  scheduler,
  defineCliPlugin({
    ...workflow,
    buildHooks: {
      ...workflow.buildHooks,
      afterServerBuild: [
        {
          label: 'Build delivery workflow artifacts',
          command: [
            'node',
            '--import',
            'tsx',
            'scripts/build-showcase-workflows.mjs',
          ],
        },
      ],
    },
  }),
  agents,
]);

export default cliPlugins;
