import { describe, it, expect } from 'vitest';
import type { GlossaryTerm } from '@/content/schema';
import type { CardRow } from '@/db/db';
import { newCard, review } from '@/lib/srs';
import { DAY_MS } from '@/lib/dates';
import { allowedRatings, buildMultipleChoice, buildReviewQueue, cardTypeAt, formatInterval, isTypedAnswerCorrect, maskTerm, newIntroducedToday, previewIntervals, scenarioFor, summarize, MASK } from './cardLogic';

const T0 = Date.UTC(2026, 5, 1, 12);
const mk = (id: string, term: string, extra: Partial<GlossaryTerm> = {}): GlossaryTerm => ({
  id, term, aliases: [], sectionId: 'lpr', outlineIds: ['lpr.1'], formal: 'f', plain: `${term} means something`, simpler: 's',
  examples: [`Pat buys ${term} from an agent. The ${term}s are tricky.`, 'Another example'], examTip: 't', misconception: 'm', related: [], confusedWith: [], difficulty: 1,
  practice: { prompt: 'Which?', choices: ['w', 'x', 'y', 'z'], answerIndex: 2, explanation: 'because' },
  sources: [], nySpecific: false, timeSensitive: false, verification: { status: 'reviewed', method: 'general-principle', checkedOn: '2026-01-01' }, ...extra,
} as GlossaryTerm);

describe('typed answer matching', () => {
  const t = mk('free-look', 'Free look (right to examine)', { aliases: ['free-look period', 'Right-to-examine'] });
  it('ignores case, punctuation and parentheticals', () => {
    expect(isTypedAnswerCorrect('free look', t)).toBe(true);
    expect(isTypedAnswerCorrect('  FREE-LOOK!! ', t)).toBe(true);
    expect(isTypedAnswerCorrect('Free look (right to examine)', t)).toBe(true);
    expect(isTypedAnswerCorrect('the free look', t)).toBe(true);
  });
  it('accepts aliases and parenthetical text', () => {
    expect(isTypedAnswerCorrect('free look period', t)).toBe(true);
    expect(isTypedAnswerCorrect('right to examine', t)).toBe(true);
  });
  it('tolerates spacing/hyphenation and a trailing s', () => {
    const c = mk('coinsurance', 'Coinsurance');
    expect(isTypedAnswerCorrect('co-insurance', c)).toBe(true);
    expect(isTypedAnswerCorrect('co insurance', c)).toBe(true);
    expect(isTypedAnswerCorrect('coinsurances', c)).toBe(true);
  });
  it('rejects wrong and empty answers, including near-miss distinct terms', () => {
    expect(isTypedAnswerCorrect('', t)).toBe(false);
    expect(isTypedAnswerCorrect('   ', t)).toBe(false);
    expect(isTypedAnswerCorrect('grace period', t)).toBe(false);
    expect(isTypedAnswerCorrect('insurer', mk('insured', 'Insured'))).toBe(false);
  });
});

describe('scenario masking', () => {
  it('masks the term, plural forms and aliases but not partial words', () => {
    const t = mk('annuity', 'Annuity', { aliases: ['fixed annuity'] });
    expect(maskTerm('An annuity pays. Two Annuitys? The fixed annuity differs. Annuitant is a person.', t)).toBe(`An ${MASK} pays. Two ${MASK}? The ${MASK} differs. Annuitant is a person.`);
    const p = mk('free-look', 'Free look (right to examine)');
    expect(maskTerm('She used her free look to cancel; the right to examine period ended.', p)).toBe(`She used her ${MASK} to cancel; the ${MASK} period ended.`);
  });
  it('scenarioFor never leaks the term name', () => {
    const t = mk('rider', 'Rider');
    for (let s = 0; s < 6; s++) expect(scenarioFor(t, s).toLowerCase()).not.toContain('rider');
  });
});

describe('intervals and previews', () => {
  it('formats intervals', () => {
    expect(formatInterval(10 * 60_000)).toBe('10 min');
    expect(formatInterval(DAY_MS)).toBe('1 day');
    expect(formatInterval(6 * DAY_MS)).toBe('6 days');
    expect(formatInterval(90 * DAY_MS)).toBe('3 mo');
    expect(formatInterval(30_000)).toBe('<1 min');
  });
  it('previews come from the real scheduler and never mutate state', () => {
    const c = newCard(T0);
    const before = JSON.stringify(c);
    const p = previewIntervals(c, T0);
    expect(p).toEqual({ again: '10 min', hard: '1 day', good: '1 day', easy: '4 days' });
    expect(JSON.stringify(c)).toBe(before);
  });
});

const row = (termId: string, srs = newCard(T0), addedAt = T0): CardRow => ({ termId, inDeck: true, addedAt, addedReason: 'manual', srs });
describe('review queue', () => {
  const reviewed = (due: number, ease = 2.5, reps = 1) => ({ ...review(newCard(T0 - 5 * DAY_MS), 'good', T0 - 5 * DAY_MS), due, ease, reps });
  it('daily queue = due reviews (most overdue first) + new cards up to the limit', () => {
    const cards = [
      row('late', reviewed(T0 - DAY_MS)), row('later', reviewed(T0 - 3 * DAY_MS)), row('future', reviewed(T0 + DAY_MS)),
      row('n1', newCard(T0), 1), row('n2', newCard(T0), 2), row('n3', newCard(T0), 3),
    ];
    const q = buildReviewQueue(cards, { mode: 'due', now: T0, newLimit: 2, sessionSize: 20 });
    expect(q.ids).toEqual(['later', 'late', 'n1', 'n2']);
    expect(q.due).toBe(2); expect(q.fresh).toBe(2);
    expect(buildReviewQueue(cards, { mode: 'due', now: T0, newLimit: 0, sessionSize: 20 }).ids).toEqual(['later', 'late']);
  });
  it('hardest first orders by ease and respects session size', () => {
    const cards = [row('easy', reviewed(T0 + DAY_MS, 2.8)), row('hard', reviewed(T0 + DAY_MS, 1.4)), row('mid', reviewed(T0 + DAY_MS, 2.0))];
    expect(buildReviewQueue(cards, { mode: 'hardest', now: T0, newLimit: 5, sessionSize: 2 }).ids).toEqual(['hard', 'mid']);
  });
  it('counts new cards already started today', () => {
    const a = row('a', { ...newCard(T0), totalReviews: 1 });
    const b = row('b', { ...newCard(T0), totalReviews: 3 });
    expect(newIntroducedToday([a, b], [{ termId: 'a' }, { termId: 'b' }])).toBe(1); // b has older reviews
    expect(newIntroducedToday([a, b], [])).toBe(0);
  });
});

describe('card types, multiple choice, grading', () => {
  it('mixed rotates types; explicit type is constant', () => {
    expect(new Set([0, 1, 2, 3, 4].map((i) => cardTypeAt('mixed', i))).size).toBe(5);
    expect(cardTypeAt('typed', 7)).toBe('typed');
  });
  it('multiple-choice always contains the answer exactly once with 4 choices', () => {
    const pool = ['a', 'b', 'c', 'd', 'e', 'f'].map((x) => mk(x, `Term ${x}`, { sectionId: x < 'd' ? 'lpr' : 'lip' }));
    for (let seed = 0; seed < 12; seed++) {
      const spec = buildMultipleChoice(pool[0], pool, seed);
      expect(spec.choices).toHaveLength(4);
      expect(new Set(spec.choices).size).toBe(4);
      if (spec.kind === 'names') expect(spec.choices[spec.answerIndex]).toBe('Term a');
      else expect(spec.choices[spec.answerIndex]).toBe('y');
    }
    // not enough distractors -> falls back to the practice question
    expect(buildMultipleChoice(pool[0], [pool[0]], 0).kind).toBe('practice');
  });
  it('wrong objective answers force Again; summaries', () => {
    expect(allowedRatings(false)).toEqual(['again']);
    expect(allowedRatings(true)).toEqual(['again', 'hard', 'good', 'easy']);
    expect(allowedRatings(null)).toHaveLength(4);
    expect(summarize(['again', 'good', 'easy', 'hard'])).toEqual({ reviewed: 4, correctPct: 75 });
    expect(summarize([])).toEqual({ reviewed: 0, correctPct: 0 });
  });
});
