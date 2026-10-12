import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, vi, afterEach } from 'vitest';
import { MemoryRouter, Routes, Outlet } from 'react-router';
import {
  resolveAppClientContributions,
  type AppClientRegisteredRoute,
} from '@nocobase/app-client/plugins';
import routes from '../../client/routes.js';
import { renderRouteTree } from '../../client/routing/route-tree.js';
import HomeRedirect from '../../client/pages/home/redirect.js';
import LegacyGuide from '../../client/pages/showcase/index.js';
vi.mock('../../client/routing/client-route.js', () => ({
  ClientRoute: ({ route }: { route: AppClientRegisteredRoute }) =>
    route.name === 'home' ? (
      <HomeRedirect />
    ) : route.name === 'showcase-guide' ? (
      <LegacyGuide />
    ) : route.name === 'srm-workspace' ? (
      <>
        <h1>SRM workspace route</h1>
        <Outlet />
      </>
    ) : (
      <div>{route.name}</div>
    ),
}));
afterEach(cleanup);
describe('canonical SRM workspace routing', () => {
  it.each(['/', '/showcase', '/workspace'])(
    'reaches the workspace rather than an empty navigation group from %s',
    async (path) => {
      const resolved = resolveAppClientContributions([
        { packageName: 'app1', source: 'application', routes },
      ]);
      render(
        <MemoryRouter initialEntries={[path]}>
          <Routes>{renderRouteTree(resolved.routes)}</Routes>
        </MemoryRouter>,
      );
      await screen.findByRole('heading', { name: 'SRM workspace route' });
    },
  );
});
