import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { content } from '@/content';
import { db, TABLES } from '@/db/db';
import CurriculumPage from './CurriculumPage';
import SectionPage from './SectionPage';
import LessonPage from './LessonPage';
import { LessonActivity } from './Activity';

async function reset() { await Promise.all(TABLES.map((t) => db.table(t).clear())); }
const wrap = (ui: React.ReactNode, path = '/') => render(<MemoryRouter initialEntries={[path]}><TooltipProvider>{ui}</TooltipProvider></MemoryRouter>);

describe('CurriculumPage', () => {
  beforeEach(reset);
  it('lists every section grouped by domain with weights', async () => {
    wrap(<CurriculumPage />);
    expect(screen.getByRole('heading', { level: 1, name: /learning curriculum/i })).toBeInTheDocument();
    for (const d of ['General', 'Life', 'Accident & Health']) expect(screen.getByRole('heading', { level: 2, name: new RegExp(d) })).toBeInTheDocument();
    expect(screen.getAllByTestId('section-card')).toHaveLength(content.sections.length);
    const first = content.sections[0];
    expect(screen.getAllByText(new RegExp(`≈ ${Math.round(first.weightPct * 1.5)} of 150`)).length).toBeGreaterThan(0);
  });
  it('expands the official outline', async () => {
    const user = userEvent.setup();
    wrap(<CurriculumPage />);
    const toggle = screen.getAllByTestId('outline-toggle')[0];
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(content.sections[0].outline[0].title)).toBeInTheDocument();
  });
});

describe('SectionPage', () => {
  beforeEach(reset);
  it('shows lessons, topic quiz link and glossary link', async () => {
    const sec = content.lessons[0]?.sectionId ?? content.sections[0].id;
    wrap(<Routes><Route path="/learn/:sectionId" element={<SectionPage />} /></Routes>, `/learn/${sec}`);
    expect(await screen.findByTestId('topic-quiz')).toHaveAttribute('href', `/practice?mode=topic&section=${sec}`);
    expect(screen.getByTestId('section-glossary')).toHaveAttribute('href', `/dictionary?section=${sec}`);
    expect(screen.getAllByTestId('lesson-card').length).toBe((content.lessonsBySection.get(sec) ?? []).length);
  });
  it('handles an unknown section', () => {
    wrap(<Routes><Route path="/learn/:sectionId" element={<SectionPage />} /></Routes>, '/learn/nope');
    expect(screen.getByText(/section not found/i)).toBeInTheDocument();
  });
});

describe('LessonActivity', () => {
  it('sequence: up/down buttons reorder and check reports success only for the right order', async () => {
    const user = userEvent.setup();
    let solved = 0;
    render(<LessonActivity lessonId="t-l01" onSolved={() => solved++} activity={{ type: 'sequence', prompt: 'Order them', steps: ['first', 'second', 'third'] }} />);
    const items = () => screen.getAllByTestId('sequence-item').map((li) => within(li).getAllByText(/first|second|third/)[0].textContent);
    // Solve by bubble-sorting with the buttons.
    for (let guard = 0; guard < 12 && items().join() !== 'first,second,third'; guard++) {
      const order = items();
      const want = ['first', 'second', 'third'];
      const pos = order.findIndex((s, i) => s !== want[i]);
      const from = order.indexOf(want[pos]);
      await user.click(screen.getAllByTestId('seq-up')[from]);
    }
    await user.click(screen.getByTestId('activity-check'));
    expect(screen.getByTestId('activity-result')).toHaveTextContent(/perfect/i);
    expect(solved).toBe(1);
    await user.click(screen.getByTestId('activity-reset'));
    expect(screen.getByTestId('activity-result')).toBeEmptyDOMElement();
  });
  it('true/false: shows explanation and success feedback', async () => {
    const user = userEvent.setup();
    render(<LessonActivity lessonId="t-l02" activity={{ type: 'truefalse', prompt: 'TF', statements: [
      { text: 'S1', answer: true, explanation: 'because one' }, { text: 'S2', answer: false, explanation: 'because two' }, { text: 'S3', answer: true, explanation: 'because three' }] }} />);
    expect(screen.getByTestId('activity-check')).toBeDisabled();
    const t = screen.getAllByTestId('tf-true'), f = screen.getAllByTestId('tf-false');
    await user.click(t[0]); await user.click(t[1]); await user.click(t[2]);
    await user.click(screen.getByTestId('activity-check'));
    expect(screen.getByTestId('activity-result')).toHaveTextContent(/2 of 3/);
    expect(screen.getByText(/because two/)).toBeInTheDocument();
    await user.click(f[1]);
    await user.click(screen.getByTestId('activity-check'));
    expect(screen.getByTestId('activity-result')).toHaveTextContent(/perfect/i);
  });
  it('match: select left then right; correct pairing succeeds', async () => {
    const user = userEvent.setup();
    const pairs = [{ left: 'L1', right: 'R1' }, { left: 'L2', right: 'R2' }, { left: 'L3', right: 'R3' }];
    render(<LessonActivity lessonId="t-l03" activity={{ type: 'match', prompt: 'Match', pairs }} />);
    const rights = () => screen.getAllByTestId('match-right');
    expect(rights().every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    for (let i = 0; i < 3; i++) {
      await user.click(screen.getAllByTestId('match-left')[i]);
      await user.click(rights().find((b) => b.textContent?.startsWith(`R${i + 1}`))!);
    }
    await user.click(screen.getByTestId('activity-check'));
    expect(screen.getByTestId('activity-result')).toHaveTextContent(/perfect/i);
  });
  it('categorize: wrong assignment is flagged', async () => {
    const user = userEvent.setup();
    render(<LessonActivity lessonId="t-l04" activity={{ type: 'categorize', prompt: 'Cat', categories: ['Alpha', 'Beta'], items: [
      { text: 'i1', category: 'Alpha' }, { text: 'i2', category: 'Beta' }, { text: 'i3', category: 'Alpha' }, { text: 'i4', category: 'Beta' }] }} />);
    const opts = screen.getAllByTestId('category-option'); // 2 per item
    for (let i = 0; i < 4; i++) await user.click(opts[i * 2]); // everything "Alpha"
    await user.click(screen.getByTestId('activity-check'));
    expect(screen.getByTestId('activity-result')).toHaveTextContent(/2 of 4/);
  });
});

describe('LessonPage', () => {
  beforeEach(reset);
  const lesson = content.lessons[0];
  it.skipIf(!lesson)('renders required blocks and gates completion on knowledge checks', async () => {
    const user = userEvent.setup();
    wrap(<Routes><Route path="/lesson/:lessonId" element={<LessonPage />} /></Routes>, `/lesson/${lesson.id}`);
    expect(await screen.findByRole('heading', { level: 1, name: lesson.title })).toBeInTheDocument();
    expect(screen.getByTestId('objectives').children).toHaveLength(lesson.objectives.length);
    expect(screen.getByTestId('key-terms')).toBeInTheDocument();
    expect(screen.getAllByTestId('lesson-part')).toHaveLength(lesson.parts.length);
    expect(screen.getByTestId('lesson-activity')).toBeInTheDocument();
    expect(screen.getByTestId('lesson-summary')).toBeInTheDocument();
    expect(screen.getByTestId('term-review')).toBeInTheDocument();
    expect(screen.getByTestId('end-quiz')).toBeInTheDocument();

    // progress row created on mount
    await waitFor(async () => expect(await db.lessonProgress.get(lesson.id)).toBeTruthy());

    const complete = screen.getByTestId('lesson-complete');
    expect(complete).toBeDisabled();
    // answer each knowledge check (first visible choice) -> attempts recorded
    const checks = screen.getAllByTestId('knowledge-check');
    for (const kc of checks) await user.click(within(kc).getAllByTestId('kc-choice')[0]);
    await waitFor(async () => expect((await db.attempts.where('mode').equals('lesson-quiz').toArray()).filter((a) => a.questionId.startsWith(`lesson:${lesson.id}:`)).length).toBe(checks.length));
    await waitFor(() => expect(screen.getByTestId('lesson-complete')).toBeEnabled()); // jsdom has no IntersectionObserver -> all parts count as viewed
    await user.click(screen.getByTestId('lesson-complete'));
    await waitFor(async () => expect((await db.lessonProgress.get(lesson.id))?.status).toBe('completed'));
  });
  it('adds all key terms to flashcards', async () => {
    if (!lesson) return;
    const user = userEvent.setup();
    wrap(<Routes><Route path="/lesson/:lessonId" element={<LessonPage />} /></Routes>, `/lesson/${lesson.id}`);
    await user.click(await screen.findByTestId('add-all-terms'));
    await waitFor(async () => expect((await db.cards.toArray()).length).toBeGreaterThan(0));
    expect((await db.cards.toArray()).every((c) => c.addedReason === 'lesson')).toBe(true);
  });
  it('unknown lesson shows an empty state', () => {
    wrap(<Routes><Route path="/lesson/:lessonId" element={<LessonPage />} /></Routes>, '/lesson/nope-l99');
    expect(screen.getByText(/lesson not found/i)).toBeInTheDocument();
  });
});
