import { test, expect } from '@playwright/test';
import { completeOnboarding } from './helpers';

test('complete a lesson: read every part, answer knowledge checks, mark complete', async ({ page }) => {
  await completeOnboarding(page);
  await page.goto('/learn');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.goto('/lesson/gen-l01');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Risk/);
  const complete = page.getByTestId('lesson-complete');
  await expect(complete).toBeDisabled();

  // Read every part (parts register as viewed when scrolled into view).
  const parts = page.getByTestId('lesson-part');
  const n = await parts.count();
  expect(n).toBeGreaterThan(1);
  for (let i = 0; i < n; i++) { await parts.nth(i).scrollIntoViewIfNeeded(); await page.waitForTimeout(250); }

  // Answer every knowledge check.
  const checks = page.getByTestId('knowledge-check');
  const k = await checks.count();
  expect(k).toBeGreaterThanOrEqual(2);
  for (let i = 0; i < k; i++) {
    await checks.nth(i).getByTestId('kc-choice').first().click();
    await expect(checks.nth(i).getByTestId('kc-feedback')).toBeVisible();
  }
  await complete.scrollIntoViewIfNeeded();
  await expect(complete).toBeEnabled();
  await complete.click();
  await expect(page.getByTestId('lesson-complete')).toHaveText(/Completed/);

  // Revisit later: still completed.
  await page.goto('/learn/gen');
  await expect(page.getByTestId('lesson-card').first()).toContainText(/Completed/i);
});
