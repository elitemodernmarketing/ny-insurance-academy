import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { content } from '@/content';
import { db, TABLES } from '@/db/db';
import { addToDeck } from '@/db/repo';
import FlashcardsPage from './FlashcardsPage';

async function reset() { await Promise.all(TABLES.map((t) => db.table(t).clear())); localStorage.clear(); }
const wrap = () => render(<MemoryRouter><TooltipProvider><FlashcardsPage /></TooltipProvider></MemoryRouter>);
const term = content.terms[0];

describe('FlashcardsPage', () => {
  beforeEach(reset);

  it('shows an explanatory empty state with actions when the deck is empty', async () => {
    wrap();
    expect(await screen.findByText(/your flashcard deck is empty/i)).toBeInTheDocument();
    expect(screen.getByText(/missed|miss a practice question/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /browse the dictionary/i })).toHaveAttribute('href', '/dictionary');
    expect(screen.getByRole('link', { name: /go to lessons/i })).toHaveAttribute('href', '/learn');
    expect(screen.getByTestId('add-cards')).toBeInTheDocument();
  });

  it('adds a whole section from the Add cards panel', async () => {
    const user = userEvent.setup();
    wrap();
    await user.selectOptions(await screen.findByTestId('add-section'), term.sectionId);
    await user.click(screen.getByTestId('add-all-section'));
    const n = content.termsBySection.get(term.sectionId)!.length;
    await waitFor(async () => expect(await db.cards.count()).toBe(n));
  });

  it('flipping never changes the schedule; rating does (Space to flip, rate Good)', async () => {
    const user = userEvent.setup();
    await addToDeck([term.id], 'manual');
    localStorage.setItem('nyia.flashcards.prefs', JSON.stringify({ cardType: 'term-def', mode: 'due', newPerDay: 5 }));
    wrap();
    await user.click(await screen.findByTestId('start-review'));
    const before = await db.cards.get(term.id);
    const flip = await screen.findByTestId('flashcard-flip');
    expect(screen.queryByTestId('rating-bar')).toBeNull();
    await user.click(flip); // reveal
    expect(screen.getByTestId('rating-bar')).toBeInTheDocument();
    await user.click(flip); // flip back and forth
    expect(await db.cards.get(term.id)).toEqual(before);
    expect(await db.cardReviews.count()).toBe(0);
    // intervals shown on rating buttons
    expect(screen.getByTestId('rate-again')).toHaveTextContent('10 min');
    expect(screen.getByTestId('rate-good')).toHaveTextContent('1 day');
    await user.click(screen.getByTestId('rate-good'));
    await waitFor(async () => expect(await db.cardReviews.count()).toBe(1));
    const after = await db.cards.get(term.id);
    expect(after!.srs.reps).toBe(1);
    expect(after!.srs.intervalDays).toBe(1);
    expect((await db.cardReviews.toArray())[0]).toMatchObject({ termId: term.id, rating: 'good', mode: 'term-def', correct: true });
    expect(await screen.findByTestId('session-summary')).toHaveTextContent(/100%/);
  });

  it('keyboard: 1-4 rate once revealed', async () => {
    const user = userEvent.setup();
    await addToDeck([term.id], 'manual');
    localStorage.setItem('nyia.flashcards.prefs', JSON.stringify({ cardType: 'def-term', mode: 'due', newPerDay: 5 }));
    wrap();
    await user.click(await screen.findByTestId('start-review'));
    await screen.findByTestId('flashcard-flip');
    await user.keyboard('1'); // not revealed -> ignored
    expect(await db.cardReviews.count()).toBe(0);
    await user.keyboard(' '); // flip via keyboard (flip button is focused → native click)
    await screen.findByTestId('rating-bar');
    await user.keyboard('2'); // Hard
    await waitFor(async () => expect(await db.cardReviews.count()).toBe(1));
    expect((await db.cardReviews.toArray())[0].rating).toBe('hard');
  });

  it('typed answer: wrong answer forces Again; correct is accepted ignoring case/punctuation', async () => {
    const user = userEvent.setup();
    await addToDeck([term.id], 'manual');
    localStorage.setItem('nyia.flashcards.prefs', JSON.stringify({ cardType: 'typed', mode: 'due', newPerDay: 5 }));
    wrap();
    await user.click(await screen.findByTestId('start-review'));
    await user.type(await screen.findByTestId('typed-input'), 'totally wrong answer');
    await user.click(screen.getByTestId('typed-check'));
    expect(screen.getByTestId('rate-good')).toBeDisabled();
    expect(screen.getByTestId('rate-hard')).toBeDisabled();
    expect(screen.getByTestId('rate-again')).toBeEnabled();
    await user.click(screen.getByTestId('rate-again'));
    await waitFor(async () => expect((await db.cardReviews.toArray())[0]?.rating).toBe('again'));
    // The card is re-queued within the session; answer it correctly.
    await user.type(await screen.findByTestId('typed-input'), `  ${term.term.toUpperCase()}!! `);
    await user.click(screen.getByTestId('typed-check'));
    expect(screen.getByTestId('rate-good')).toBeEnabled();
  });

  it('shows a caught-up message when nothing is due', async () => {
    await addToDeck([term.id], 'manual');
    localStorage.setItem('nyia.flashcards.prefs', JSON.stringify({ newPerDay: 0, mode: 'due' }));
    wrap();
    expect(await screen.findByText(/all caught up/i)).toBeInTheDocument();
    expect(screen.getByTestId('start-review')).toBeDisabled();
  });
});
