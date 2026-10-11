import type React from 'react';
import {
  Home,
  Presentation,
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
const appRoutes: AppClientRouteContribution = defineAppRoutes([
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
    navigation: { title: 'showcase.group', icon: Presentation },
    children: [
      {
        ...showcasePage(
          'guide',
          '/showcase',
          'showcase.guide',
          Map,
          () => import('./pages/showcase/index.js'),
        ),
        children: [showcaseDetail('guide')],
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
  {
    name: 'finance',
    path: '/finance',
    navigation: { title: 'ops.finance', icon: Wallet },
    children: [
      'invoices',
      'settlements',
      'payments',
      'reconciliations',
      'taxScenarios',
    ].map((k) => documentRoutes(k, k)),
  },
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
    // Every signed-in user reaches the landing page. `authz: 'skip'` takes it out of page authorization entirely, so
    // no permission change can leave a user signed in with nowhere to land.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/home/index.js'),
    name: 'home',
    navigation: { title: 'navigation.home', icon: Home },
    path: '/',
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
]);

const routes: readonly AppClientRouteContribution[] = [appRoutes];

export default routes;
