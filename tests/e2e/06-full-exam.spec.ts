import { test, expect } from '@playwright/test';
import { completeOnboarding } from './helpers';

test('take a full 150-question timed mock exam, then review incorrect answers', async ({ page }) => {
  test.setTimeout(300_000);
  await completeOnboarding(page);
  await page.goto('/exam');
  await expect(page.getByTestId('exam-allocation')).toBeVisible();
  await page.getByTestId('start-full-exam').first().click();
  await expect(page).toHaveURL(/\/exam\/[^/]+$/);
  await expect(page.getByTestId('exam-timer')).toContainText(/2:(29|30):/);
  await expect(page.getByTestId('exam-answered')).toContainText('of 150');
  // No feedback during the exam.
  await page.getByTestId('choice-0').click();
  await expect(page.getByTestId('explanation')).toHaveCount(0);
  await page.getByTestId('exam-flag').click();
  // Answer 120 questions with the keyboard, leave 30 unanswered.
  for (let i = 1; i < 120; i++) {
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press(String((i % 4) + 1));
  }
  await expect(page.getByTestId('exam-answered')).toContainText('Answered 120 of 150');
  await page.getByTestId('nav-q-1').click();
  await expect(page.getByText(/Question 1 of 150/)).toBeVisible();
  await page.getByTestId('exam-review-submit').click();
  await expect(page.getByTestId('review-unanswered')).toContainText('30');
  await expect(page.getByTestId('review-flagged')).toContainText('1');
  await page.getByTestId('exam-submit-final').click();
  await page.getByTestId('exam-confirm-submit').click();
  await expect(page).toHaveURL(/\/results$/);
  await expect(page.getByTestId('exam-score')).toContainText('%');
  await expect(page.getByTestId('exam-pass-status')).toBeVisible();
  await expect(page.getByTestId('results-by-section')).toBeVisible();
  await expect(page.getByText(/30\s*unanswered|Unanswered\s*30/i).first()).toBeVisible();

  // Review incorrect answers with explanations.
  await page.getByTestId('filter-incorrect').click();
  await page.getByTestId('answer-review').getByRole('button').first().click();
  await expect(page.getByTestId('explanation').first()).toBeVisible();
  await expect(page.getByTestId('explanation').first()).toContainText(/Each choice/);
  await page.goto('/review');
  await expect(page.getByTestId('missed-group').first()).toBeVisible();
});
