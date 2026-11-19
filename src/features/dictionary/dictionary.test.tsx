import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { content } from '@/content';
import { db, TABLES } from '@/db/db';
import DictionaryPage from './DictionaryPage';
import TermPage from './TermPage';
import ComparePage from './ComparePage';

async function reset() { await Promise.all(TABLES.map((t) => db.table(t).clear())); }
const wrap = (path: string) => render(
  <MemoryRouter initialEntries={[path]}><TooltipProvider>
    <Routes>
      <Route path="/dictionary" element={<DictionaryPage />} />
      <Route path="/dictionary/compare" element={<ComparePage />} />
      <Route path="/dictionary/:termId" element={<TermPage />} />
    </Routes>
  </TooltipProvider></MemoryRouter>,
);
const term = content.terms[0];

describe('DictionaryPage', () => {
  beforeEach(reset);
  it('lists terms A-Z and searches instantly, best match first', async () => {
    const user = userEvent.setup();
    wrap('/dictionary');
    expect(await screen.findByTestId('term-search')).toBeInTheDocument();
    expect(screen.getByTestId('result-count')).toHaveTextContent(new RegExp(`${content.terms.length} terms?`));
    await user.type(screen.getByTestId('term-search'), term.term);
    await waitFor(() => expect(screen.getAllByTestId('term-result')[0]).toHaveTextContent(term.term));
    await user.clear(screen.getByTestId('term-search'));
    await user.type(screen.getByTestId('term-search'), 'qqqzzzxxx');
    expect(await screen.findByText(/no terms match/i)).toBeInTheDocument();
  });
  it('filters by section', async () => {
    const user = userEvent.setup();
    wrap('/dictionary');
    const sec = content.terms[0].sectionId;
    await user.selectOptions(await screen.findByTestId('filter-section'), sec);
    const n = content.termsBySection.get(sec)!.length;
    await waitFor(() => expect(screen.getByTestId('result-count')).toHaveTextContent(new RegExp(`^${n} terms?`)));
  });
});

describe('TermPage', () => {
  beforeEach(reset);
  it('shows definitions, reveals simpler text, cycles examples and records a view', async () => {
    const user = userEvent.setup();
    wrap(`/dictionary/${term.id}`);
    expect(await screen.findByRole('heading', { level: 1, name: new RegExp(term.term.replace(/[()]/g, '.')) })).toBeInTheDocument();
    expect(screen.getByTestId('plain-def')).toHaveTextContent(term.plain);
    expect(screen.queryByTestId('simpler')).toBeNull();
    await user.click(screen.getByTestId('explain-simpler'));
    expect(screen.getByTestId('simpler')).toHaveTextContent(term.simpler);
    expect(screen.getByTestId('example-text')).toHaveTextContent(term.examples[0]);
    await user.click(screen.getByTestId('another-example'));
    expect(screen.getByTestId('example-text')).toHaveTextContent(term.examples[1]);
    await waitFor(async () => expect((await db.termStatus.get(term.id))?.viewCount).toBeGreaterThanOrEqual(1));
  });
  it('adds to flashcards, marks difficult, rates confidence', async () => {
    const user = userEvent.setup();
    wrap(`/dictionary/${term.id}`);
    await user.click(await screen.findByTestId('add-to-flashcards'));
    await waitFor(async () => expect((await db.cards.get(term.id))?.inDeck).toBe(true));
    expect(await screen.findByText('In flashcards')).toBeInTheDocument();
    await user.click(screen.getByTestId('mark-difficult'));
    await user.click(screen.getByTestId('confidence-4'));
    await waitFor(async () => { const s = await db.termStatus.get(term.id); expect(s?.difficult).toBe(true); expect(s?.confidence).toBe(4); });
  });
  it('"Test my understanding" gives feedback and records a glossary attempt', async () => {
    const user = userEvent.setup();
    wrap(`/dictionary/${term.id}`);
    const choices = await screen.findAllByTestId('term-choice');
    expect(choices).toHaveLength(4);
    await user.click(choices[0]);
    expect(await screen.findByTestId('term-feedback')).toBeInTheDocument();
    await waitFor(async () => {
      const a = (await db.attempts.toArray()).find((x) => x.questionId === `term:${term.id}`);
      expect(a).toBeTruthy();
      expect(a!.mode).toBe('glossary');
      expect(a!.concepts).toEqual([term.id]);
    });
  });
  it('unknown term shows an empty state', async () => {
    wrap('/dictionary/does-not-exist');
    expect(await screen.findByText(/term not found/i)).toBeInTheDocument();
  });
});

describe('ComparePage', () => {
  beforeEach(reset);
  it('shows two terms side by side, swaps, and adds both to flashcards', async () => {
    const user = userEvent.setup();
    const [a, b] = content.terms;
    wrap(`/dictionary/compare?a=${a.id}&b=${b.id}`);
    const result = await screen.findByTestId('compare-result');
    expect(within(result).getAllByText(a.formal).length).toBeGreaterThan(0);
    expect(within(result).getAllByText(b.plain).length).toBeGreaterThan(0);
    await user.click(screen.getByTestId('compare-swap'));
    expect(screen.getByTestId('compare-picker-a-selected')).toHaveTextContent(b.term);
    await user.click(screen.getByTestId('add-both'));
    await waitFor(async () => expect((await db.cards.toArray()).map((c) => c.termId).sort()).toEqual([a.id, b.id].sort()));
  });
  it('shows the curated comparison when one exists', async () => {
    const c = content.comparisons[0];
    if (!c) return;
    wrap(`/dictionary/compare?a=${c.b}&b=${c.a}`); // reversed on purpose
    expect(await screen.findByTestId('key-difference')).toHaveTextContent(c.keyDifference);
  });
  it('prompts for terms when none are chosen', async () => {
    wrap('/dictionary/compare');
    expect(await screen.findByText(/choose two terms/i)).toBeInTheDocument();
  });
});
