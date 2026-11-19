import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { validate, jaccard, type RawBundle } from './validate';
import { computeCoverage } from './coverage';
import { isEligible } from './schema';
import { allocate, assembleExam } from '@/lib/blueprint';

const ROOT = path.resolve(__dirname, '../..');
function readDir(sub: string) {
  const d = path.join(ROOT, 'content', sub);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((f) => f.endsWith('.json')).sort().map((f) => ({ path: `content/${sub}/${f}`, data: JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')) }));
}
function loadReal(): RawBundle {
  const j = (p: string) => ({ path: p, data: JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8')) });
  return {
    manifest: j('content/manifest/exam-17-55.json'), extraManifests: [j('content/manifest/exam-17-54.json')], registry: j('content/manifest/term-registry.json'),
    sources: readDir('sources'), glossary: readDir('glossary'), questions: readDir('questions'), lessons: readDir('lessons'), scenarios: readDir('scenarios'),
  };
}

describe('shipped content', () => {
  const res = validate(loadReal());
  it('passes validation with zero errors', () => {
    const errors = res.issues.filter((i) => i.level === 'error');
    expect(errors.map((e) => `${e.file} [${e.id}] ${e.message}`)).toEqual([]);
  });
  it('meets the initial-release minimums (≥200 eligible terms, ≥300 eligible questions)', () => {
    expect(res.counts.termsEligible).toBeGreaterThanOrEqual(200);
    expect(res.counts.questionsEligible).toBeGreaterThanOrEqual(300);
  });
  it('every eligible question has exactly one correct choice among 4 unique ids, with rationales', () => {
    for (const q of res.parsed!.questions.filter(isEligible)) {
      expect(q.choices.map((c) => c.id).sort()).toEqual(['a', 'b', 'c', 'd']);
      expect(q.choices.filter((c) => c.id === q.correct)).toHaveLength(1);
      for (const c of q.choices) expect(c.rationale.length).toBeGreaterThan(5);
    }
  });
  it.each(['ny-17-55', 'ny-17-54'])('can assemble a full exam for track %s from unique eligible questions per its blueprint', (trackId) => {
    const p = res.parsed!;
    const m = p.manifests.find((x) => x.id === trackId)!;
    const ids = new Set(m.sections.map((x) => x.id as string));
    const alloc = allocate(m.exam.questionCount, m.sections, 1);
    const ex = assembleExam(p.questions.filter((q) => ids.has(q.sectionId) && isEligible(q)), alloc, 1);
    expect(ex.shortfalls).toEqual([]);
    expect(new Set(ex.questionIds).size).toBe(m.exam.questionCount);
  });
  it('every official outline section of every track has at least one eligible lesson and enough questions', () => {
    const p = res.parsed!;
    for (const m of p.manifests) {
      const cov = computeCoverage({ sections: m.sections, lessons: p.lessons.filter(isEligible), questions: p.questions.filter(isEligible), terms: p.terms.filter(isEligible) }, m.exam.questionCount);
      const noLesson = m.sections.filter((s) => !p.lessons.some((l) => l.sectionId === s.id && isEligible(l)));
      expect(noLesson.map((s) => s.id)).toEqual([]);
      expect(cov.sections.filter((s) => !s.meetsFullExam).map((s) => s.id)).toEqual([]);
      expect(cov.nodes.filter((n) => n.status === 'gap')).toEqual([]);
    }
    expect(p.manifests[0].sections.flatMap((s) => s.children).length).toBeGreaterThan(40);
  });
});

// ---- validator behaviour on synthetic content ----
const manifest = { path: 'm', data: JSON.parse(fs.readFileSync(path.join(ROOT, 'content/manifest/exam-17-55.json'), 'utf8')) };
const registry = { path: 'r', data: { terms: [{ id: 'grace-period', term: 'Grace Period', owner: 'lpr' }] } };
const sources = [{ path: 's', data: { sources: [{ id: 'general-insurance-principles', title: 'g', publisher: 'p', kind: 'general' }, { id: 'ny-isc-3203', title: 't', publisher: 'p', kind: 'statute' }] } }];
const v = { status: 'reviewed', method: 'general-principle', checkedOn: '2026-11-19' };
const mkQ = (id: string, stem: string, over: Record<string, unknown> = {}) => ({
  id, series: ['17-55'], sectionId: 'lpr', outlineIds: ['lpr.1.6'], concepts: ['grace-period'], difficulty: 2, style: 'concept', tags: [],
  stem, choices: [
    { id: 'a', text: '31 days', rationale: 'right because' }, { id: 'b', text: '10 days', rationale: 'wrong because' },
    { id: 'c', text: '60 days', rationale: 'wrong because' }, { id: 'd', text: '90 days', rationale: 'wrong because' }],
  correct: 'a', explanation: 'x', memoryTip: 'y', version: 1, lastReviewed: '2026-11-19', sources: ['general-insurance-principles'], nySpecific: false, timeSensitive: false, verification: v, ...over,
});
const bundle = (questions: unknown[]): RawBundle => ({ manifest, registry, sources, glossary: [], questions: [{ path: 'content/questions/lpr.json', data: { sectionId: 'lpr', questions } }], lessons: [], scenarios: [] });

describe('validator rules', () => {
  it('flags near-duplicate questions', () => {
    const r = validate(bundle([mkQ('lpr-q001', 'How long is the grace period on a fixed premium life policy?'), mkQ('lpr-q002', 'How long is the grace period on a fixed-premium life policy?')]));
    expect(r.issues.some((i) => i.level === 'error' && /near-duplicate|identical stem/.test(i.message))).toBe(true);
  });
  it('rejects "all of the above" and positional choices', () => {
    const q = mkQ('lpr-q001', 'Which is true?', { choices: [
      { id: 'a', text: 'All of the above', rationale: 'r' }, { id: 'b', text: 'Both A and B', rationale: 'r' }, { id: 'c', text: 'c', rationale: 'r' }, { id: 'd', text: 'd', rationale: 'r' }] });
    const errs = validate(bundle([q])).issues.filter((i) => i.level === 'error').map((i) => i.message).join(' | ');
    expect(errs).toMatch(/All of the above/);
    expect(errs).toMatch(/positional/);
  });
  it('requires NY-specific content to be verified with sources', () => {
    const errs = validate(bundle([mkQ('lpr-q001', 'NY grace period?', { nySpecific: true, tags: ['ny-law'] })])).issues.filter((i) => i.level === 'error');
    expect(errs.some((e) => /cannot be "reviewed"/.test(e.message))).toBe(true);
    const ok = validate(bundle([mkQ('lpr-q001', 'NY grace period?', { nySpecific: true, tags: ['ny-law'], sources: ['ny-isc-3203'], verification: { status: 'verified', method: 'statute-text', checkedOn: '2026-11-19' } })]));
    expect(ok.issues.filter((i) => i.level === 'error')).toEqual([]);
  });
  it('flags unknown outline ids, sources and concepts', () => {
    const errs = validate(bundle([mkQ('lpr-q001', 'x?', { outlineIds: ['lpr.99'], sources: ['nope'], concepts: ['not-a-term'] })])).issues.filter((i) => i.level === 'error').map((i) => i.message).join(' | ');
    expect(errs).toMatch(/unknown outline id/);
    expect(errs).toMatch(/not in source registry/);
    expect(errs).toMatch(/not a glossary term/);
  });
  it('requires reviewDue for time-sensitive content', () => {
    const errs = validate(bundle([mkQ('lpr-q001', 'x?', { timeSensitive: true, sources: ['ny-isc-3203'], verification: { status: 'verified', method: 'statute-text', checkedOn: '2026-11-19' } })])).issues;
    expect(errs.some((e) => /needs reviewDue/.test(e.message))).toBe(true);
  });
  it('jaccard similarity', () => {
    expect(jaccard('grace period life policy', 'grace period life policy')).toBe(1);
    expect(jaccard('grace period', 'medicare supplement')).toBe(0);
  });
});
