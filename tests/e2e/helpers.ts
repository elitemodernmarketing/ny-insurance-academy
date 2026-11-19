import { expect, type Page } from '@playwright/test';

/** Complete onboarding quickly (skip diagnostic) so a test starts from the dashboard. */
export async function completeOnboarding(page: Page) {
  await page.goto('/');
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByTestId('onboarding-skip').click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Your study dashboard' })).toBeVisible();
}

/** Wait until the service worker controls the page (needed for offline tests). */
export async function waitForServiceWorker(page: Page) {
  await page.waitForFunction(async () => {
    if (!('serviceWorker' in navigator)) return false;
    await navigator.serviceWorker.ready;
    return true;
  }, undefined, { timeout: 30_000 });
  // A reload makes the now-active worker control the page.
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, undefined, { timeout: 30_000 });
}
