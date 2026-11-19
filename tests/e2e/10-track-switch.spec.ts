import { test, expect } from '@playwright/test';
import { completeOnboarding } from './helpers';

test('switch to the Personal Lines (17-54) track, study and start its 100-question exam, then switch back', async ({ page }) => {
  test.setTimeout(180_000);
  await completeOnboarding(page);
  await page.goto('/settings');
  await expect(page.getByTestId('track-17-55')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('track-17-54')).toBeEnabled();
  await page.getByTestId('track-17-54').click();

  // The app reloads on the new track.
  await expect(page.getByRole('heading', { name: 'Your study dashboard' })).toBeVisible();
  await expect(page.getByText(/PSI SERIES 17-54|PSI Series 17-54/i).first()).toBeVisible();
  await expect(page.getByText(/100 questions · 120 minutes · 70% to pass/)).toBeVisible();

  // Curriculum shows the 7 Personal Lines sections.
  await page.goto('/learn');
  await expect(page.getByText('Homeowners').first()).toBeVisible();
  await expect(page.getByText('Auto Insurance').first()).toBeVisible();
  await expect(page.getByTestId('section-card')).toHaveCount(7);

  // A Personal Lines lesson loads and has content.
  await page.goto('/learn/plho');
  await page.getByTestId('lesson-card').first().click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // The full exam is 100 questions with a 2-hour clock.
  await page.goto('/exam');
  await page.getByTestId('start-full-exam').first().click();
  await expect(page.getByTestId('exam-answered')).toContainText('of 100');
  await expect(page.getByTestId('exam-timer')).toContainText(/1:(59|60|5\d):/);
  await page.getByTestId('choice-0').click();
  await expect(page.getByTestId('exam-answered')).toContainText('Answered 1 of 100');

  // Switch back: Life/A&H shows its own (separate) state.
  await page.goto('/settings');
  await page.getByTestId('track-17-55').click();
  await expect(page.getByRole('heading', { name: 'Your study dashboard' })).toBeVisible();
  await expect(page.getByText(/150 questions · 150 minutes · 70% to pass/)).toBeVisible();
  // The in-progress 17-54 exam is not offered on the 17-55 track.
  await expect(page.getByTestId('resume-exam')).toHaveCount(0);
});
