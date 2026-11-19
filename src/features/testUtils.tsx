/** Shared helpers for feature tests (jsdom + fake-indexeddb). */
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render } from '@testing-library/react';
import { db, TABLES } from '@/db/db';
import { TooltipProvider } from '@/components/ui/Tooltip';

export async function resetDb(): Promise<void> {
  await Promise.all(TABLES.map((t) => db.table(t).clear()));
}

export function renderRoutes(initial: string, routes: { path: string; element: ReactElement }[]) {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>{routes.map((r) => <Route key={r.path} path={r.path} element={r.element} />)}</Routes>
      </MemoryRouter>
    </TooltipProvider>,
  );
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}
