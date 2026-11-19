import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { completeOnboarding, waitForServiceWorker } from './helpers';

test('closing and reopening the app keeps progress and settings', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await completeOnboarding(page);
  await page.goto('/settings');
  await page.getByTestId('theme-select').selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  // Create progress: add a flashcard from the dictionary data via the deck API exposed in the UI.
  await page.goto('/dictionary/indemnity');
  await page.getByTestId('add-to-flashcards').click();
  await expect(page.getByTestId('add-to-flashcards')).toContainText(/In flashcards|Remove/i);
  await page.close();

  // "Reopen" the app in a new tab of the same profile.
  const page2 = await context.newPage();
  await page2.goto('/');
  await expect(page2.getByRole('heading', { name: 'Your study dashboard' })).toBeVisible();
  await expect(page2.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page2.goto('/flashcards');
  await expect(page2.getByText(/1 card|1 in deck|Due now|Indemnity/i).first()).toBeVisible();
  await context.close();
});

test('the installed app works offline', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await completeOnboarding(page);
  await waitForServiceWorker(page);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your study dashboard' })).toBeVisible();
  await expect(page.getByText(/Offline — everything still works/)).toBeVisible();
  for (const [path, heading] of [['/dictionary', /Dictionary/i], ['/learn', /Curriculum|Learning/i], ['/practice', /Practice/i], ['/exam', /Exam/i]] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 }).first()).toHaveText(heading);
  }
  await context.close();
});

test('export and import a backup round-trips progress', async ({ page }, testInfo) => {
  await completeOnboarding(page);
  await page.goto('/settings');
  await page.getByLabel(/Practice target/).selectOption('90');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-data').click()]);
  const file = testInfo.outputPath('backup.json');
  await download.saveAs(file);
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  expect(json.app).toBe('ny-insurance-academy');
  expect(json.data.settings[0].practiceTarget).toBe(90);

  await page.getByLabel(/Practice target/).selectOption('75');
  await page.getByTestId('import-file').setInputFiles(file);
  await page.getByTestId('confirm-import').click();
  await expect(page.getByText(/Imported \d+ records/)).toBeVisible();
  await expect(page.getByLabel(/Practice target/)).toHaveValue('90');
});

test('responsive navigation works on a phone @mobile', async ({ page }) => {
  await completeOnboarding(page);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('dialog', { name: 'Navigation' }).getByRole('link', { name: 'Insurance Dictionary' }).click();
  await expect(page).toHaveURL(/\/dictionary/);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
});
