import { describe, it, expect } from 'vitest';
import type { GlossaryTerm } from '@/content/schema';
import { filterTerms, findComparison, groupAZ, scoreTerm, searchTerms } from './search';
import { confusedTermFor, normalizeText, stripParens, termNames } from './termHelpers';

const mk = (id: string, term: string, extra: Partial<GlossaryTerm> = {}): GlossaryTerm => ({
  id, term, aliases: [], sectionId: 'lpr', outlineIds: ['lpr.1'], formal: `Formal text about ${term}`, plain: `Plain text about ${term}`,
  simpler: 's', examples: ['e1', 'e2'], examTip: 't', misconception: 'm', related: [], confusedWith: [], difficulty: 1,
  practice: { prompt: 'p', choices: ['a', 'b', 'c', 'd'], answerIndex: 0, explanation: 'x' }, sources: [], nySpecific: false, timeSensitive: false,
  verification: { status: 'reviewed', method: 'general-principle', checkedOn: '2026-01-01' }, ...extra,
} as GlossaryTerm);

const terms = [
  mk('coinsurance', 'Coinsurance', { aliases: ['co-insurance'] }),
  mk('insurance', 'Insurance'),
  mk('reinsurance', 'Reinsurance'),
  mk('copay', 'Copayment', { aliases: ['copay'], plain: 'A flat fee, unlike coinsurance, paid per visit' }),
  mk('free-look', 'Free look (right to examine)', { sectionId: 'lip' }),
  mk('annuity', 'Annuity', { sectionId: 'ann', difficulty: 3 }),
];

describe('dictionary search ranking', () => {
  it('exact term > alias exact > prefix > word prefix > contains > definition', () => {
    const r = searchTerms(terms, 'insurance').map((t) => t.id);
    expect(r[0]).toBe('insurance');            // exact
    expect(r.indexOf('coinsurance')).toBeLessThan(r.indexOf('copay')); // contains (term) beats definition-only match
    expect(r).toContain('reinsurance');
    expect(r.at(-1)).toBe('copay');
    expect(searchTerms(terms, 'copay')[0].id).toBe('copay');          // alias exact
    expect(searchTerms(terms, 'co').slice(0, 2).map((t) => t.id)).toEqual(['coinsurance', 'copay']); // prefix matches, alphabetical tie
    expect(scoreTerm(terms[1], 'insur')).toBeGreaterThan(scoreTerm(terms[2], 'insur')); // prefix beats contains
  });
  it('ignores case, punctuation and parentheticals; matches aliases', () => {
    expect(searchTerms(terms, 'CO-INSURANCE')[0].id).toBe('coinsurance');
    expect(searchTerms(terms, 'free look')[0].id).toBe('free-look');
    expect(searchTerms(terms, 'right to examine')[0].id).toBe('free-look');
    expect(searchTerms(terms, 'xyzzy')).toEqual([]);
  });
  it('multi-word queries require every word', () => {
    expect(searchTerms(terms, 'flat fee visit').map((t) => t.id)).toEqual(['copay']);
    expect(searchTerms(terms, 'flat zebra')).toEqual([]);
  });
  it('empty query returns all alphabetically', () => {
    expect(searchTerms(terms, '  ').map((t) => t.term)).toEqual(['Annuity', 'Coinsurance', 'Copayment', 'Free look (right to examine)', 'Insurance', 'Reinsurance']);
  });
  it('normalizes helpers', () => {
    expect(normalizeText('Café & Co.')).toBe('cafe and co');
    expect(stripParens('Free look (right to examine)')).toBe('Free look');
    expect(termNames(terms[4])).toEqual(['Free look (right to examine)', 'Free look', 'right to examine']);
  });
});

describe('filters and grouping', () => {
  const ctx = { level: (id: string) => (id === 'insurance' ? ('mastered' as const) : id === 'annuity' ? ('weak' as const) : undefined), difficult: new Set(['annuity']), deck: new Set(['copay']) };
  it('filters by section, difficulty, status, difficult and deck', () => {
    expect(filterTerms(terms, { sectionId: 'ann' }, ctx).map((t) => t.id)).toEqual(['annuity']);
    expect(filterTerms(terms, { difficulty: 3 }, ctx).map((t) => t.id)).toEqual(['annuity']);
    expect(filterTerms(terms, { status: 'mastered' }, ctx).map((t) => t.id)).toEqual(['insurance']);
    expect(filterTerms(terms, { status: 'learning' }, ctx).map((t) => t.id)).toEqual(['annuity']);
    expect(filterTerms(terms, { status: 'unseen' }, ctx)).toHaveLength(4);
    expect(filterTerms(terms, { difficultOnly: true }, ctx).map((t) => t.id)).toEqual(['annuity']);
    expect(filterTerms(terms, { inDeckOnly: true }, ctx).map((t) => t.id)).toEqual(['copay']);
  });
  it('groups A-Z', () => {
    expect(groupAZ(terms).map((g) => [g.letter, g.terms.length])).toEqual([['A', 1], ['C', 2], ['F', 1], ['I', 1], ['R', 1]]);
  });
  it('finds curated comparisons in either order', () => {
    const list = [{ a: 'x', b: 'y', keyDifference: 'k', rows: [], memoryTip: undefined }] as never;
    expect(findComparison('x', 'y', list)?.swapped).toBe(false);
    expect(findComparison('y', 'x', list)?.swapped).toBe(true);
    expect(findComparison('x', 'z', list)).toBeUndefined();
  });
  it('confusedTermFor returns undefined for unknown text', () => {
    expect(confusedTermFor('definitely not a glossary term zzz', 'nothing')).toBeUndefined();
  });
});
