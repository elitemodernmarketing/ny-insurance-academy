import { test, expect } from '@playwright/test';
import { completeOnboarding } from './helpers';

test('review flashcards with spaced repetition', async ({ page }) => {
  await completeOnboarding(page);
  for (const id of ['premium', 'indemnity', 'peril']) {
    await page.goto(`/dictionary/${id}`);
    await page.getByTestId('add-to-flashcards').click();
    await expect(page.getByTestId('add-to-flashcards')).toContainText(/In flashcards|Remove/i);
  }
  await page.goto('/flashcards');
  await expect(page.getByTestId('deck-stats')).toContainText('3');
  await page.getByTestId('card-type').selectOption('term-def');
  await page.getByTestId('start-review').click();
  for (let i = 0; i < 3; i++) {
    await page.getByTestId('flashcard-flip').click();
    await expect(page.getByTestId('card-back')).toBeVisible();
    await page.getByTestId('rate-good').click();
  }
  await expect(page.getByTestId('session-summary')).toBeVisible();
  await expect(page.getByTestId('session-summary')).toContainText(/3/);
  // All three are now scheduled in the future, so nothing is due.
  await page.goto('/flashcards');
  await expect(page.getByTestId('deck-stats')).toBeVisible();
});
