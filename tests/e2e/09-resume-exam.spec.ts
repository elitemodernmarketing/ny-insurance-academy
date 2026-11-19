import { test, expect } from '@playwright/test';
import { completeOnboarding } from './helpers';

test('an interrupted exam resumes with answers and the same deadline', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await completeOnboarding(page);
  await page.goto('/exam');
  await page.getByTestId('start-custom-exam-25').click();
  await expect(page).toHaveURL(/\/exam\/[^/]+$/);
  await expect(page.getByText('Question 1 of 25')).toBeVisible();
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('2');
    await expect(page.getByTestId('exam-answered')).toContainText(`Answered ${i + 1} of 25`);
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText(`Question ${i + 2} of 25`)).toBeVisible();
  }
  await expect(page.getByTestId('exam-answered')).toContainText('Answered 3 of 25');
  const examUrl = page.url();
  await page.waitForTimeout(800); // let the last answer finish writing to IndexedDB before the tab closes
  await page.close();

  const page2 = await context.newPage();
  await page2.goto('/');
  await page2.getByTestId('resume-exam').click();
  await expect(page2).toHaveURL(examUrl);
  await expect(page2.getByTestId('exam-answered')).toContainText('Answered 3 of 25');
  await expect(page2.getByTestId('exam-timer')).toContainText(/2[0-4]:\d\d/);
  await context.close();
});

test('the exam submits automatically when time expires', async ({ page }) => {
  await page.clock.install();
  await completeOnboarding(page);
  await page.goto('/exam');
  await page.getByTestId('start-custom-exam-25').click();
  await expect(page).toHaveURL(/\/exam\/[^/]+$/);
  await expect(page.getByText('Question 1 of 25')).toBeVisible();
  await page.keyboard.press('1');
  await expect(page.getByTestId('exam-answered')).toContainText('Answered 1 of 25');
  await page.clock.fastForward('26:00');
  await expect(page).toHaveURL(/\/results$/, { timeout: 20_000 });
  await expect(page.getByTestId('exam-score')).toBeVisible();
  await expect(page.getByText(/submitted automatically when time ran out/i).first()).toBeVisible();
});
