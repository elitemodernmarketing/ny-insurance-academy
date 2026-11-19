import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';

// Recharts' ResponsiveContainer needs ResizeObserver, which jsdom lacks.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
}
