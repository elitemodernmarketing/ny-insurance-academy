import { chromium } from '@playwright/test';
const OUT = process.argv[2]; const BASE = 'http://127.0.0.1:5173';
const routes = process.argv.slice(3);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: process.env.MOBILE ? { width: 390, height: 844 } : { width: 1360, height: 900 }, colorScheme: process.env.DARK ? 'dark' : 'light', deviceScaleFactor: 1 });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push('pageerror ' + e.message));
p.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text().slice(0, 200)); });
await p.goto(BASE + '/'); await p.waitForTimeout(1500);
await p.getByTestId('onboarding-skip').click(); await p.waitForTimeout(800);
for (const r of routes) {
  if (r === '@quiz') { await p.goto(BASE + '/practice?mode=learn'); await p.waitForTimeout(1200); await p.getByTestId('start-practice').click(); await p.waitForTimeout(1200); await p.getByTestId('choice-0').click(); await p.getByTestId('practice-submit').click(); await p.waitForTimeout(800); await p.screenshot({ path: `${OUT}/quiz.png`, fullPage: true }); continue; }
  await p.goto(BASE + r); await p.waitForTimeout(1800);
  const name = r.replace(/[^a-z0-9]+/gi, '_') || 'root';
  await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
}
console.log(errs.join('\n') || 'no errors');
await b.close();
