import { defineAppConfig } from '@nocobase/app-server/config';
import type { WorkflowRuntimeConfig } from '@nocobase/app-plugin-workflow/server';
export default defineAppConfig<WorkflowRuntimeConfig>(({paths}) => ({sourceRoot:paths.root('workflows'),distRoot:paths.root('dist/workflows'),artifactDisk:'local',production:process.env.NODE_ENV === 'production'}));
