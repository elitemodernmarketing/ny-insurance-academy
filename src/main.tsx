import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App';
import './styles/index.css';

// Service worker: caches the whole app for offline use and updates automatically.
if ('serviceWorker' in navigator && import.meta.env.PROD) registerSW({ immediate: true });

// Ask the browser to keep IndexedDB data even under storage pressure (best effort).
if (navigator.storage?.persist) void navigator.storage.persist();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
