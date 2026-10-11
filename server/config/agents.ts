import { defineAppConfig } from '@nocobase/app-server/config';
import type { AgentsConfig } from '@nocobase/app-plugin-agents/server/tokens';
export default defineAppConfig<AgentsConfig>(() => ({
  server: { enabled: true, maxSteps: 8 },
  vectors: { store: false },
}));
