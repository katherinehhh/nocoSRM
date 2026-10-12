import {
  UserRoundCheck as AdmissionIcon,
  ClipboardList as RfqIcon,
  FileCheck as QuoteIcon,
  ScanLine as InspectionIcon,
  Undo2 as ReturnIcon,
  ListTodo as WorkbenchIcon,
} from 'lucide-react';
import { coreKinds, corePaths, type CoreKind } from '../shared/srm-core.js';
import type React from 'react';
import {
  Home,
  PackageCheck,
  KeyRound,
  UserRoundCog,
  Map,
  KanbanSquare,
  BookOpen,
  Plug,
  Printer,
  Mail,
  Bot,
  Settings2,
  Boxes,
  Wallet,
  Workflow,
  Handshake,
  Settings,
  LayoutDashboard,
  FileText,
  Package,
  Warehouse,
  Truck,
  Users,
  Receipt,
  CalendarClock,
  ListChecks,
  Coins,
  Calculator,
  ClipboardList,
} from 'lucide-react';
import {
  defineAppRoutes,
  type AppClientRouteContribution,
  type AppClientRouteDefinition,
} from '@nocobase/app-client/plugins';

const icons: Record<string, typeof FileText> = {
  plans: ClipboardList,
  orders: FileText,
  dispatches: Truck,
  receipts: Package,
  suppliers: Users,
  materials: Boxes,
  warehouses: Warehouse,
  invoices: Receipt,
  settlements: Coins,
  payments: Wallet,
  reconciliations: ListChecks,
  taxScenarios: Calculator,
  policies: Workflow,
  runs: CalendarClock,
  tasks: ListChecks,
};
const contextualDetail = (owner: string) => ({
  name: `${owner}-record`,
  path: 'records/:resource/:id',
  componentLoader: () => import('./pages/operations/detail.js'),
  children: [
    {
      name: `${owner}-record-related`,
      path: 'related/:relatedKind/:relatedId',
      componentLoader: () => import('./pages/operations/related.js'),
    },
    {
      name: `${owner}-record-edit`,
      path: 'edit',
      componentLoader: () => import('./pages/operations/form.js'),
    },
  ],
});
const documentRoutes = (kind: string, path: string, prefix = 'ops') => ({
  name: `${prefix}-${kind}`,
  path,
  auth: 'required' as const,
  authz: {
    resource: { type: 'page' as const, id: `operations.${kind}` },
    action: 'access',
  },
  navigation: { title: `ops.kinds.${kind}`, icon: icons[kind] },
  componentLoader: () => import('./pages/operations/index.js'),
  children: [
    {
      name: `${prefix}-${kind}-new`,
      path: 'new',
      componentLoader: () => import('./pages/operations/form.js'),
    },
    {
      name: `${prefix}-${kind}-detail`,
      path: ':id',
      componentLoader: () => import('./pages/operations/detail.js'),
      children: [
        {
          name: `${prefix}-${kind}-related`,
          path: 'related/:relatedKind/:relatedId',
          componentLoader: () => import('./pages/operations/related.js'),
        },
        {
          name: `${prefix}-${kind}-edit`,
          path: 'edit',
          componentLoader: () => import('./pages/operations/form.js'),
        },
      ],
    },
  ],
});
const showcaseDetail = (owner: string) => ({
  name: `showcase-${owner}-record`,
  path: ':id',
  componentLoader: () => import('./pages/showcase/detail.js'),
  children: [
    {
      name: `showcase-${owner}-edit`,
      path: 'edit',
      componentLoader: () => import('./pages/showcase/form.js'),
    },
  ],
});
const showcasePage = (
  name: string,
  path: string,
  title: string,
  icon: typeof FileText,
  componentLoader: () => Promise<{ default: React.ComponentType }>,
) => ({
  name: `showcase-${name}`,
  path,
  auth: 'required' as const,
  authz: {
    resource: { type: 'page' as const, id: `showcase.${name}` },
    action: 'access',
  },
  navigation: { title, icon },
  componentLoader,
});
const pageDefinitions: AppClientRouteDefinition[] = [
  {
    name: 'showcase-embedded-board',
    path: '/integrations/embed/work-board',
    auth: 'required',
    authz: {
      resource: { type: 'page', id: 'showcase.workBoard' },
      action: 'access',
    },
    componentLoader: () => import('./pages/showcase/board.js'),
    children: [showcaseDetail('embed-board')],
  },
  {
    name: 'showcase-group',
    navigation: { title: 'srm.deliveryGroup', icon: PackageCheck },
    children: [
      {
        ...showcasePage(
          'guide',
          '/showcase',
          'srm.home',
          Map,
          () => import('./pages/showcase/index.js'),
        ),
        navigation: undefined,
        children: [],
      },
      {
        ...showcasePage(
          'deliveryPlans',
          '/delivery-plans',
          'showcase.deliveryPlans',
          Truck,
          () => import('./pages/showcase/list.js'),
        ),
        children: [
          {
            name: 'showcase-delivery-new',
            path: 'new',
            componentLoader: () => import('./pages/showcase/form.js'),
          },
          showcaseDetail('delivery'),
        ],
      },
      {
        ...showcasePage(
          'workBoard',
          '/work-board',
          'showcase.board',
          KanbanSquare,
          () => import('./pages/showcase/board.js'),
        ),
        children: [showcaseDetail('board')],
      },
      {
        ...showcasePage(
          'ledger',
          '/business-ledger',
          'showcase.ledger',
          BookOpen,
          () => import('./pages/showcase/list.js'),
        ),
        children: [
          {
            name: 'showcase-ledger-record',
            path: ':id',
            componentLoader: () => import('./pages/showcase/ledger-detail.js'),
            children: [
              {
                name: 'showcase-ledger-resolve',
                path: 'resolve',
                componentLoader: () => import('./pages/showcase/resolve.js'),
              },
              {
                name: 'showcase-ledger-ack',
                path: 'acknowledgment',
                componentLoader: () =>
                  import('./pages/showcase/acknowledgment.js'),
              },
            ],
          },
        ],
      },
      showcasePage(
        'integrations',
        '/integrations',
        'showcase.integrations',
        Plug,
        () => import('./pages/showcase/integrations.js'),
      ),
      {
        ...showcasePage(
          'templates',
          '/print-templates',
          'showcase.templates',
          Printer,
          () => import('./pages/showcase/templates.js'),
        ),
        children: [
          {
            name: 'showcase-template-edit',
            path: 'edit',
            componentLoader: () => import('./pages/showcase/template-edit.js'),
          },
        ],
      },
      showcasePage(
        'mail',
        '/mail-center',
        'showcase.mail',
        Mail,
        () => import('./pages/showcase/mail.js'),
      ),
      {
        ...showcasePage(
          'mailAccounts',
          '/mail-accounts',
          'showcase.mail',
          Mail,
          () => import('./pages/showcase/mail-accounts.js'),
        ),
        navigation: undefined,
      },
      showcasePage(
        'ai',
        '/ai-workbench',
        'showcase.ai',
        Bot,
        () => import('./pages/showcase/assistant.js'),
      ),
      {
        ...showcasePage(
          'models',
          '/model-services',
          'showcase.models',
          Settings2,
          () => import('./pages/showcase/models.js'),
        ),
        children: [
          {
            name: 'showcase-model-new',
            path: 'new',
            componentLoader: () => import('./pages/showcase/model-form.js'),
          },
          {
            name: 'showcase-model-edit',
            path: ':id/edit',
            componentLoader: () => import('./pages/showcase/model-form.js'),
          },
        ],
      },
    ],
  },

  {
    name: 'operations-dashboard',
    path: '/operations',
    auth: 'required',
    authz: {
      resource: { type: 'page', id: 'operations.dashboard' },
      action: 'access',
    },
    navigation: { title: 'ops.dashboard', icon: LayoutDashboard },
    componentLoader: () => import('./pages/operations/dashboard.js'),
    children: [contextualDetail('dashboard')],
  },
  {
    name: 'supply',
    path: '/supply',
    navigation: { title: 'ops.supply', icon: Boxes },
    children: [
      'plans',
      'orders',
      'dispatches',
      'receipts',
      'suppliers',
      'materials',
      'warehouses',
    ].map((k) => documentRoutes(k, k)),
  },
  // Keep legacy finance URLs and grants without a sidebar group. Route groups require
  // navigation in app-client, so these remain individual protected page routes.
  // Presentation hiding is not an authorization boundary.
  ...[
    'invoices',
    'settlements',
    'payments',
    'reconciliations',
    'taxScenarios',
  ].map((k) => ({
    ...documentRoutes(k, `/finance/${k}`),
    navigation: undefined,
  })),
  {
    name: 'automation',
    path: '/automation',
    navigation: { title: 'ops.automation', icon: Workflow },
    children: ['policies', 'runs', 'tasks'].map((k) => documentRoutes(k, k)),
  },
  {
    name: 'portal-home',
    path: '/portal',
    auth: 'required',
    authz: {
      resource: { type: 'page', id: 'operations.portal' },
      action: 'access',
    },
    navigation: { title: 'ops.portal', icon: Handshake },
    componentLoader: () => import('./pages/operations/portal.js'),
    children: [
      'orders',
      'dispatches',
      'invoices',
      'reconciliations',
      'payments',
    ].map((k) => ({
      ...documentRoutes(k, k, 'portal'),
      navigation: undefined,
      componentLoader: () => import('./pages/operations/portal-list.js'),
    })),
  },
  {
    name: 'srm-mail-services',
    path: '/mail-services',
    auth: 'required',
    authz: {
      resource: { type: 'settings', id: 'operations.admin' },
      action: 'update',
    },
    navigation: { title: 'srmMail.title', icon: Mail },
    componentLoader: () => import('./pages/mail-settings/index.js'),
  },
  {
    name: 'operations-settings',
    path: '/operationsSettings',
    auth: 'required',
    authz: {
      resource: { type: 'settings', id: 'operations.admin' },
      action: 'read',
    },
    navigation: { title: 'ops.settings', icon: Settings },
    componentLoader: () => import('./pages/operations/settings.js'),
  },
  {
    name: 'srm-users',
    path: '/srm-users',
    auth: 'required',
    authz: { resource: { type: 'user', id: '*' }, action: 'read' },
    navigation: { title: 'srm.users', icon: UserRoundCog },
    componentLoader: () => import('./pages/srm-users/index.js'),
    children: [
      {
        name: 'srm-users-new',
        path: 'new',
        componentLoader: () =>
          import('./pages/srm-users/index.js').then((m) => ({
            default: m.UserForm,
          })),
      },
      {
        name: 'srm-users-edit',
        path: 'edit/:id',
        componentLoader: () =>
          import('./pages/srm-users/index.js').then((m) => ({
            default: m.UserForm,
          })),
      },
      {
        name: 'srm-users-roles',
        path: 'roles/:id/:scope',
        componentLoader: () =>
          import('./pages/srm-users/index.js').then((m) => ({
            default: m.UserForm,
          })),
      },
      {
        name: 'srm-users-business',
        path: 'business/:id',
        componentLoader: () => import('./pages/srm-users/business.js'),
      },
    ],
  },
  {
    name: 'srm-api-keys',
    path: '/api-keys',
    auth: 'required',
    authz: 'skip',
    navigation: { title: 'srm.apiKeysTitle', icon: KeyRound },
    componentLoader: () => import('./pages/api-keys/index.js'),
    children: [
      {
        name: 'srm-api-key-new',
        path: 'new',
        componentLoader: () =>
          import('./pages/api-keys/index.js').then((m) => ({
            default: m.ApiKeyForm,
          })),
      },
      {
        name: 'srm-api-key-edit',
        path: ':id/edit',
        componentLoader: () =>
          import('./pages/api-keys/index.js').then((m) => ({
            default: m.ApiKeyForm,
          })),
      },
    ],
  },
  {
    // Every signed-in user reaches the landing page. `authz: 'skip'` takes it out of page authorization entirely, so
    // no permission change can leave a user signed in with nowhere to land.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/home/index.js'),
    name: 'srm-workspace',
    navigation: { title: 'srm.home', icon: Home },
    path: '/workspace',
    children: [
      contextualDetail('workspace'),
      { ...showcaseDetail('workspace-delivery'), path: 'deliveries/:id' },
      {
        name: 'workspace-ledger',
        path: 'ledger/:id',
        componentLoader: () => import('./pages/showcase/ledger-detail.js'),
        children: [
          {
            name: 'workspace-ledger-resolve',
            path: 'resolve',
            componentLoader: () => import('./pages/showcase/resolve.js'),
          },
          {
            name: 'workspace-ledger-ack',
            path: 'acknowledgment',
            componentLoader: () => import('./pages/showcase/acknowledgment.js'),
          },
        ],
      },
    ],
  },
  {
    name: 'home',
    path: '/',
    auth: 'required',
    authz: 'skip',
    componentLoader: () => import('./pages/home/redirect.js'),
  },
  {
    // Declares no navigation, so the application decides where its entry goes (for example a sidebar item with an
    // unread badge). The plugin's API answers each person's own messages only, so the page needs no authorization of
    // its own.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/inbox.js'),
    name: 'inbox',
    path: '/inbox',
  },
  {
    auth: 'guest',
    authz: 'skip',
    componentLoader: () => import('./pages/auth/login.js'),
    name: 'login',
    path: '/login',
  },
  {
    auth: 'guest',
    authz: 'skip',
    componentLoader: () => import('./pages/auth/register.js'),
    name: 'register',
    path: '/register',
  },
  {
    auth: 'guest',
    authz: 'skip',
    componentLoader: () => import('./pages/auth/forgot-password.js'),
    name: 'forgot-password',
    path: '/forgot-password',
  },
  {
    auth: 'guest',
    authz: 'skip',
    componentLoader: () => import('./pages/auth/reset-password.js'),
    name: 'reset-password',
    path: '/reset-password',
  },
  {
    // Where a command line's sign-in sends the person to approve it (`pages/auth/device.tsx`). Optional rather than
    // required so it renders outside the shell, like the sign-in pages; the page sends a guest to sign in and back.
    auth: 'optional',
    authz: 'skip',
    componentLoader: () => import('./pages/auth/device.js'),
    name: 'device',
    path: '/device',
  },
];
const coreDetail = (kind: CoreKind, owner: string, path = ':id') => ({
  name: `srm-core-${owner}-${kind}-record`,
  path,
  componentLoader: () => import('./pages/srm-core/detail.js'),
  children: [
    ...(['rfq', 'inspection'].includes(kind)
      ? [
          {
            name: `srm-ai-${owner}-${kind}`,
            path: 'ai',
            authz: {
              resource: { type: 'composite' as const, id: `srmCore.${kind}` },
              action: 'view',
            },
            componentLoader: () => import('./pages/srm-core/ai.js'),
          },
        ]
      : []),
    ...(kind === 'rfq'
      ? [
          {
            name: `srm-core-${owner}-rfq-quote`,
            path: 'quote/:quoteId',
            authz: {
              resource: { type: 'composite' as const, id: 'srmCore.quote' },
              action: 'view',
            },
            componentLoader: () => import('./pages/srm-core/context-quote.js'),
          },
        ]
      : []),
    {
      name: `srm-core-${owner}-${kind}-edit`,
      path: 'edit',
      authz: {
        resource: { type: 'composite' as const, id: `srmCore.${kind}` },
        action: 'edit',
      },
      componentLoader: () => import('./pages/srm-core/form.js'),
    },
  ],
});
const coreIcons = {
  admission: AdmissionIcon,
  rfq: RfqIcon,
  quote: QuoteIcon,
  inspection: InspectionIcon,
  return: ReturnIcon,
};
const corePages = coreKinds.map((kind) => ({
  name: `srm-core-${kind}`,
  path: corePaths[kind].replace(/^\/supply\//, ''),
  auth: 'required' as const,
  authz: {
    resource: { type: 'page' as const, id: `srmCore.${kind}` },
    action: 'access',
  },
  navigation: { title: `core.kinds.${kind}`, icon: coreIcons[kind] },
  componentLoader: () => import('./pages/srm-core/index.js'),
  children: [
    {
      name: `srm-core-${kind}-new`,
      path: 'new',
      authz: {
        resource: { type: 'composite' as const, id: `srmCore.${kind}` },
        action: 'create',
      },
      componentLoader: () => import('./pages/srm-core/form.js'),
    },
    coreDetail(kind, 'list'),
  ],
}));
const supplyIndex = pageDefinitions.findIndex((r) => r.name === 'supply');
if (supplyIndex >= 0)
  pageDefinitions[supplyIndex] = {
    ...pageDefinitions[supplyIndex],
    children: [...(pageDefinitions[supplyIndex].children ?? []), ...corePages],
  };
pageDefinitions.push({
  name: 'srm-core-workbench',
  path: '/srm-workbench',
  auth: 'required',
  authz: {
    resource: { type: 'page', id: 'srmCore.workbench' },
    action: 'access',
  },
  navigation: { title: 'core.workbench', icon: WorkbenchIcon },
  componentLoader: () => import('./pages/srm-core/workbench.js'),
  children: coreKinds.map((kind) =>
    coreDetail(kind, 'workbench', `${kind}/:id`),
  ),
});
const legacyGroup = pageDefinitions.find((r) => r.name === 'showcase-group')!;
const configurationNames = new Set([
  'showcase-integrations',
  'showcase-templates',
  'srm-mail-services',
  'showcase-mail',
  'showcase-models',
  'showcase-mailAccounts',
  'srm-users',
  'srm-api-keys',
  'operations-settings',
]);
const configurationChildren = [
  ...(legacyGroup.children ?? []).filter((r) => configurationNames.has(r.name)),
  ...pageDefinitions.filter((r) => configurationNames.has(r.name)),
];
const appRoutes: AppClientRouteContribution = defineAppRoutes([
  ...pageDefinitions
    .filter((r) => !configurationNames.has(r.name))
    .map((r) =>
      r === legacyGroup
        ? {
            ...r,
            children: (r.children ?? []).filter(
              (c) => !configurationNames.has(c.name),
            ),
          }
        : r,
    ),
  {
    name: 'srm-system',
    navigation: { title: 'srm.systemGroup', icon: Settings },
    children: configurationChildren,
  },
]);

const routes: readonly AppClientRouteContribution[] = [appRoutes];

export default routes;
