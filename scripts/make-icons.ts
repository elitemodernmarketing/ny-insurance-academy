/** Renders public/icons/icon.svg to PNG app icons (192, 512) using Playwright's Chromium. */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/load-content';

const svg = fs.readFileSync(path.join(ROOT, 'public/icons/icon.svg'), 'utf8');
const browser = await chromium.launch();
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: path.join(ROOT, `public/icons/icon-${size}.png`), omitBackground: true });
  await page.close();
}
await browser.close();
console.log('icons written');
