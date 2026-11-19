// Usage: node scripts/smoke-url.mjs <baseUrl>   e.g. https://herisnor.com/fa/
import { chromium } from '@playwright/test';
const base = process.argv[2].replace(/\/?$/, '/');
const b = await chromium.launch({ args: process.env.HOST_MAP ? [`--host-resolver-rules=MAP ${process.env.HOST_MAP}`] : [] });
const ctx = await b.newContext({ ignoreHTTPSErrors: true });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push('pageerror ' + e.message));
p.on('response', (r) => { if (r.status() >= 400) errs.push(`${r.status()} ${r.url()}`); });
await p.goto(base); await p.waitForURL(/onboarding/); 
await p.getByTestId('onboarding-skip').click();
await p.getByRole('heading', { name: 'Your study dashboard' }).waitFor();
await p.goto(base + 'learn'); await p.getByRole('heading', { name: /Learning curriculum/i }).waitFor();
await p.goto(base + 'lesson/gen-l01'); await p.getByRole('heading', { level: 1 }).waitFor();
await p.reload(); await p.getByRole('heading', { level: 1 }).waitFor(); // deep link reload
await p.waitForFunction(async () => { await navigator.serviceWorker.ready; return true; });
const scope = await p.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.scope);
console.log('OK', p.url(), 'sw scope:', scope, errs.length ? '\nISSUES:\n' + errs.join('\n') : '');
await b.close();
