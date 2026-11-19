import { test, expect } from '@playwright/test';
import { completeOnboarding } from './helpers';

test('study glossary terms: search, simpler explanation, examples, test, flashcards, compare', async ({ page }) => {
  await completeOnboarding(page);
  await page.goto('/dictionary');
  await page.getByTestId('term-search').fill('coinsurance');
  await expect(page.getByTestId('term-result').first()).toContainText(/Coinsurance/);
  await page.getByTestId('term-result').first().click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Coinsurance/);

  await page.getByTestId('explain-simpler').click();
  await expect(page.getByTestId('simpler')).toBeVisible();
  const ex1 = await page.getByTestId('example-text').innerText();
  await page.getByTestId('another-example').click();
  await expect(page.getByTestId('example-text')).not.toHaveText(ex1);

  await page.getByTestId('term-choice').first().click();
  await expect(page.getByTestId('term-feedback')).toBeVisible();

  await page.getByTestId('add-to-flashcards').click();
  await expect(page.getByTestId('add-to-flashcards')).toContainText(/In flashcards|Remove/i);
  await page.getByTestId('mark-difficult').click();
  await expect(page.getByTestId('mark-difficult')).toHaveAttribute('aria-pressed', 'true');

  await page.goto('/dictionary/compare?a=coinsurance&b=copayment');
  await expect(page.getByTestId('compare-result')).toContainText(/Copayment/);
});
