import { test, expect } from '@playwright/test';
import { completeOnboarding } from './helpers';

test('take a topic quiz with explanations after each answer', async ({ page }) => {
  await completeOnboarding(page);
  await page.goto('/practice?mode=topic&section=lpr');
  await expect(page.getByTestId('practice-setup')).toBeVisible();
  await page.getByTestId('start-practice').click();
  await expect(page).toHaveURL(/\/practice\/session\//);
  for (let n = 1; n <= 10; n++) {
    await expect(page.getByText(new RegExp(`Question ${n} of 10`)).first()).toBeVisible();
    await page.getByTestId('choice-1').click();
    await page.getByTestId('practice-submit').click();
    await expect(page.getByTestId('explanation')).toBeVisible();
    await expect(page.getByTestId('explanation')).toContainText(/Why/);
    await expect(page.getByTestId('explanation')).toContainText(/Each choice/);
    await page.getByTestId('practice-next').click();
  }
  await expect(page.getByTestId('practice-final-score')).toContainText(/\d+\/10/);
});
