import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { content } from '@/content';
import type { GlossaryTerm, Lesson } from '@/content/schema';
import { db } from '@/db/db';
import { updateSettings } from '@/db/repo';
import TutorPage from './TutorPage';
import { answerQuestion, buildIndex, contentContext, corpusFrom, detectIntent, mentionedTerms, resolveSection, search, stem, tokenize } from './retrieval';
import { NOT_COVERED, OllamaError, askOllama, buildSystemPrompt, describeError, extractCitations, listModels } from './ollama';

const wrap = (ui: React.ReactElement) => render(<MemoryRouter><TooltipProvider>{ui}</TooltipProvider></MemoryRouter>);

const term = (id: string, name: string, plain: string, extra: Partial<GlossaryTerm> = {}): GlossaryTerm => ({
  id, term: name, aliases: [], sectionId: 'gen', outlineIds: ['gen.1'], formal: `${name} formal text`, plain, simpler: `${name} is like an everyday thing.`,
  examples: [`Example of ${name} one.`, `Example of ${name} two.`], examTip: 'tip', misconception: 'myth', related: [], confusedWith: [], difficulty: 1,
  practice: { prompt: 'p', choices: ['a', 'b', 'c', 'd'], answerIndex: 0, explanation: 'e' }, sources: [], nySpecific: false, timeSensitive: false,
  verification: { status: 'reviewed', method: 'general-principle', checkedOn: '2026-01-01' }, ...extra,
} as GlossaryTerm);
const TERMS = [
  term('insurable-interest', 'Insurable Interest', 'You must stand to lose money if the insured person dies or the property is damaged.'),
  term('aleatory-contract', 'Aleatory Contract', 'A contract where the amounts exchanged are unequal and depend on chance events.'),
  term('hmo', 'HMO', 'Health maintenance organization: members use a network and need referrals.', { aliases: ['Health Maintenance Organization'], sectionId: 'med' }),
  term('ppo', 'PPO', 'Preferred provider organization: members can see out-of-network providers for more cost.', { aliases: ['Preferred Provider Organization'], sectionId: 'med' }),
  term('annuity', 'Annuity', 'A contract that turns a lump sum into an income stream.', { sectionId: 'ann' }),
  term('premium', 'Premium', 'The price paid for insurance coverage. Insurance companies charge premiums.'),
];
const LESSONS = [{
  id: 'gen-l01', sectionId: 'gen', order: 1, title: 'Contracts', parts: [
    { heading: 'Why insurable interest matters', body: 'Insurable interest means financial stake. Without insurable interest a policy is a wager.', callouts: [] },
    { heading: 'Premiums and payment', body: 'Premiums are paid in advance for coverage.', callouts: [] },
  ],
}] as unknown as Lesson[];
const index = buildIndex(corpusFrom({ terms: TERMS, lessons: LESSONS }));
const ctx = (over = {}) => ({
  index, comparisons: [{ a: 'hmo', b: 'ppo', keyDifference: 'Network strictness', rows: [{ aspect: 'x', a: '1', b: '2' }, { aspect: 'y', a: '3', b: '4' }] }],
  questionsBySection: new Map(), sections: [{ id: 'ann', name: 'Annuities', shortName: 'Annuities' }, { id: 'lib', name: 'Life Insurance Basics', shortName: 'Life Insurance Basics' }, { id: 'lip', name: 'Life Policies', shortName: 'Life Policies' }],
  ...over,
});

describe('retrieval ranking', () => {
  it('tokenizes and stems consistently', () => {
    expect(stem('annuities')).toBe('annuity');
    expect(stem('premiums')).toBe('premium');
    expect(tokenize('Explain insurable interest in simple English')).toEqual(['insurable', 'interest']);
  });
  it('ranks the named term first, then the lesson part that discusses it', () => {
    const hits = search(index, 'Explain insurable interest in simple English');
    expect(hits[0].doc.id).toBe('term:insurable-interest');
    expect(hits[1].doc.id).toBe('lesson:gen-l01#0');
    expect(hits[0].score).toBeGreaterThan(hits[1].score);
    expect(search(index, 'insurable interest', { kind: 'lesson' })[0].doc.id).toBe('lesson:gen-l01#0');
  });
  it('matches aliases and returns nothing for unrelated queries', () => {
    expect(mentionedTerms(index, 'what is a health maintenance organization').map((d) => d.id)).toEqual(['term:hmo']);
    expect(search(index, 'zzzz qqqq')).toEqual([]);
  });
  it('is deterministic and respects the limit', () => {
    expect(search(index, 'premium', { limit: 1 })).toHaveLength(1);
    expect(search(index, 'contract')).toEqual(search(index, 'contract'));
  });
  it('detects intents', () => {
    expect(detectIntent('Quiz me on annuities')).toBe('quiz');
    expect(detectIntent("What's the difference between HMO and PPO?")).toBe('compare');
    expect(detectIntent('Give me an example of an aleatory contract')).toBe('example');
    expect(detectIntent('Explain this topic using an analogy')).toBe('analogy');
    expect(detectIntent('what is a premium')).toBe('explain');
  });
  it('compares two named terms and attaches the validated comparison', () => {
    const a = answerQuestion("What's the difference between HMO and PPO?", ctx());
    expect(a.terms.slice(0, 2).map((h) => h.doc.termId).sort()).toEqual(['hmo', 'ppo']);
    expect(a.comparison?.keyDifference).toBe('Network strictness');
    expect(a.citations[0]).toBe('comparison:hmo|ppo');
  });
  it('uses the previous topic for "this topic" analogy requests', () => {
    const a = answerQuestion('Explain this topic using an analogy', ctx({ lastTermId: 'annuity' }));
    expect(a.intent).toBe('analogy');
    expect(a.terms[0].doc.termId).toBe('annuity');
    const none = answerQuestion('Explain this topic using an analogy', ctx());
    expect(none.citations).toEqual([]);
    expect(none.note).toMatch(/Name a topic/);
  });
  it('quiz intent resolves the section and picks 5 questions deterministically', () => {
    expect(resolveSection('Quiz me on annuities', ctx().sections)?.id).toBe('ann');
    expect(resolveSection('quiz me on life policies', ctx().sections)?.id).toBe('lip');
    const qs = Array.from({ length: 9 }, (_, i) => ({ id: `ann-q00${i}`, stem: `Stem ${i}` }));
    const c = ctx({ questionsBySection: new Map([['ann', qs]]) });
    const a = answerQuestion('Quiz me on annuities', c);
    expect(a.quiz?.sectionId).toBe('ann');
    expect(a.quiz?.questions).toHaveLength(5);
    expect(new Set(a.quiz!.questions.map((q) => q.id)).size).toBe(5);
    expect(answerQuestion('Quiz me on annuities', c).quiz?.questions).toEqual(a.quiz?.questions);
    expect(answerQuestion('Quiz me on annuities', ctx()).note).toMatch(/pending verification/);
  });
  it('is honest when nothing matches', () => {
    const a = answerQuestion('qwertyuiop', ctx());
    expect(a.citations).toEqual([]);
    expect(a.note).toMatch(/could not find/);
  });
  it('works against the real course content', () => {
    if (!content.termById.has('insurable-interest') || !content.terms.some((t) => t.id === 'insurable-interest')) return;
    const a = answerQuestion('Explain insurable interest in simple English', contentContext());
    expect(a.terms[0].doc.termId).toBe('insurable-interest');
  });
});

describe('ollama client', () => {
  const ok = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, ...init });
  it('system prompt contains only the provided snippets with ids and citation rules', () => {
    const p = buildSystemPrompt([{ id: 'term:annuity', title: 'Annuity', text: 'Income stream.' }]);
    expect(p).toContain('[term:annuity] Annuity');
    expect(p).toContain('Income stream.');
    expect(p).toContain(NOT_COVERED);
    expect(p).toMatch(/ONLY from the course snippets/);
  });
  it('posts to /api/chat with stream:false and returns the reply', async () => {
    const f = vi.fn().mockResolvedValue(ok({ message: { role: 'assistant', content: ' Hello [term:annuity] ' } }));
    const reply = await askOllama({ baseUrl: 'http://localhost:11434/', model: 'm', messages: [{ role: 'user', content: 'hi' }], fetchImpl: f as unknown as typeof fetch });
    expect(reply).toBe('Hello [term:annuity]');
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('http://localhost:11434/api/chat');
    expect(JSON.parse(init.body)).toEqual({ model: 'm', messages: [{ role: 'user', content: 'hi' }], stream: false });
  });
  it('classifies failures', async () => {
    const net = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(askOllama({ baseUrl: 'http://x', model: 'm', messages: [], fetchImpl: net as unknown as typeof fetch })).rejects.toMatchObject({ kind: 'network' });
    const missing = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "model 'zz' not found" }), { status: 404 }));
    await expect(askOllama({ baseUrl: 'http://x', model: 'zz', messages: [], fetchImpl: missing as unknown as typeof fetch })).rejects.toMatchObject({ kind: 'model-missing' });
    const empty = vi.fn().mockResolvedValue(ok({ message: { content: '' } }));
    await expect(askOllama({ baseUrl: 'http://x', model: 'm', messages: [], fetchImpl: empty as unknown as typeof fetch })).rejects.toMatchObject({ kind: 'bad-response' });
    expect(describeError(new OllamaError('network', 'x'), 'm', 'http://x')).toMatch(/Could not reach Ollama/);
  });
  it('lists models and extracts valid citations', async () => {
    const f = vi.fn().mockResolvedValue(ok({ models: [{ name: 'llama3.1:latest' }] }));
    expect(await listModels('http://x', f as unknown as typeof fetch)).toEqual(['llama3.1:latest']);
    expect(extractCitations('A [term:annuity] and [term:bogus] and [term:annuity]', ['term:annuity'])).toEqual(['term:annuity']);
  });
});

describe('tutor page', () => {
  beforeEach(async () => { await db.tutorMessages.clear(); await updateSettings({ tutor: { enabled: false, baseUrl: 'http://localhost:11434', model: 'llama3.1' } }); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('answers from validated content with no LLM and labels it', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.fn(); vi.stubGlobal('fetch', fetchSpy);
    wrap(<TutorPage />);
    await user.type(screen.getByTestId('tutor-input'), 'What is an annuity?');
    await user.click(screen.getByTestId('tutor-ask'));
    const sourced = await screen.findByTestId('tutor-sourced');
    expect(within(sourced).getByText('From validated course content')).toBeInTheDocument();
    expect(within(sourced).getAllByTestId('tutor-term')[0]).toHaveTextContent(/Annuity/);
    expect(screen.queryByTestId('tutor-ai')).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await db.tutorMessages.count()).toBe(2);
  });

  it('quick prompt for annuities links to a topic quiz', async () => {
    const user = userEvent.setup();
    wrap(<TutorPage />);
    await user.click(screen.getByRole('button', { name: 'Quiz me on annuities' }));
    const link = await screen.findByTestId('tutor-start-quiz').catch(() => null);
    if ((content.questionsBySection.get('ann')?.length ?? 0) > 0) expect(link).toHaveAttribute('href', '/practice?mode=topic&section=ann');
    else expect(await screen.findByText(/pending verification/)).toBeInTheDocument();
  });

  it('shows AI replies separately, labeled not verified', async () => {
    await updateSettings({ tutor: { enabled: true, baseUrl: 'http://localhost:11434', model: 'llama3.1' } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: { content: 'An annuity pays income. [term:annuity]' } }), { status: 200 })));
    const user = userEvent.setup();
    wrap(<TutorPage />);
    await user.type(screen.getByTestId('tutor-input'), 'annuity');
    await user.click(screen.getByTestId('tutor-ask'));
    const ai = await screen.findByTestId('tutor-ai');
    expect(within(ai).getByText('AI-generated — not verified')).toBeInTheDocument();
    expect(screen.getByTestId('tutor-sourced')).not.toContainElement(ai);
    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const sys = JSON.parse(init.body).messages[0].content as string;
    expect(sys).toContain('[term:annuity]');
  });

  it('shows setup help when Ollama is unreachable and keeps the sourced answer', async () => {
    await updateSettings({ tutor: { enabled: true, baseUrl: 'http://localhost:11434', model: 'llama3.1' } });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const user = userEvent.setup();
    wrap(<TutorPage />);
    await user.type(screen.getByTestId('tutor-input'), 'annuity');
    await user.click(screen.getByTestId('tutor-ask'));
    const err = await screen.findByTestId('tutor-error');
    expect(err).toHaveTextContent(/Could not reach Ollama/);
    expect(err).toHaveTextContent(/ollama pull/);
    expect(err).toHaveTextContent(/OLLAMA_ORIGINS/);
    expect(screen.getByTestId('tutor-sourced')).toBeInTheDocument();
  });

  it('clears history after confirmation', async () => {
    await db.tutorMessages.bulkAdd([{ at: 1, role: 'user', text: 'hi', sourced: false, citations: [] }]);
    const user = userEvent.setup();
    wrap(<TutorPage />);
    await user.click(await screen.findByTestId('tutor-clear'));
    await user.click(screen.getByTestId('tutor-clear-confirm'));
    await waitFor(async () => expect(await db.tutorMessages.count()).toBe(0));
  });
});
