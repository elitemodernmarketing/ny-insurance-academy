import { test, expect } from '@playwright/test';

test('first launch shows onboarding, runs the diagnostic, and never forces onboarding again', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByRole('heading', { name: /Welcome to NY Insurance Licensing Academy/ })).toBeVisible();
  await expect(page.getByText(/does\s+not\s+issue a School Certificate/)).toBeVisible();
  await page.getByTestId('onboarding-next').click();
  await page.getByLabel('How much do you already know about insurance?').selectOption('none');
  await page.getByTestId('onboarding-next').click();
  await page.getByTestId('diagnostic-start').click();

  // Answer every diagnostic question (pick the first displayed choice), reading feedback each time.
  for (let i = 0; i < 12; i++) {
    const choice = page.getByTestId('choice-0');
    if (!(await choice.isVisible().catch(() => false))) break;
    await choice.click();
    await expect(page.getByTestId('explanation')).toBeVisible();
    await page.getByTestId('diagnostic-next').click();
  }
  await expect(page.getByRole('heading', { name: 'Your starting point' })).toBeVisible();
  await expect(page.getByText(/You answered \d+ of \d+/)).toBeVisible();
  await page.getByTestId('onboarding-finish').click();
  await expect(page.getByRole('heading', { name: 'Your study dashboard' })).toBeVisible();

  // Reopen: onboarding is not forced again.
  await page.goto('/');
  await expect(page).not.toHaveURL(/onboarding/);
  await expect(page.getByRole('heading', { name: 'Your study dashboard' })).toBeVisible();
});
