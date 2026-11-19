/**
 * Writes docs/COVERAGE.md (Life/A&H 17-55) and docs/COVERAGE-17-54.md (Personal Lines) — every official outline topic with its lessons, eligible practice questions and
 * glossary terms, plus per-section bank sufficiency for a 150-question exam.
 *   npx tsx scripts/coverage-report.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadBundle, ROOT } from './lib/load-content';
import { validate } from '../src/content/validate';
import { computeCoverage } from '../src/content/coverage';
import { isEligible } from '../src/content/schema';

const res = validate(loadBundle());
if (!res.parsed) { console.error('Manifest failed to parse'); process.exit(1); }
const { manifests, lessons, questions, terms } = res.parsed;
const today = new Date().toISOString().slice(0, 10);

for (const [mi, manifest] of manifests.entries()) {
  const ids = new Set(manifest.sections.map((s) => s.id as string));
  const shared = new Set<string>([...ids, ...manifest.sharedTermSections]);
  const L = {
    lessons: lessons.filter((l) => ids.has(l.sectionId)),
    questions: questions.filter((q) => ids.has(q.sectionId)),
    terms: terms.filter((t) => shared.has(t.sectionId)),
  };
  const el = { lessons: L.lessons.filter(isEligible), questions: L.questions.filter(isEligible), terms: L.terms.filter(isEligible) };
  const examSize = manifest.exam.questionCount;
  const cov = computeCoverage({
    sections: manifest.sections,
    lessons: el.lessons, questions: el.questions, terms: el.terms,
    draftQuestions: L.questions.filter((q) => !isEligible(q)),
  }, examSize);
  const out: string[] = [];
  out.push(`# Exam-Outline Coverage Report — NY Series ${manifest.series}`, '');
  out.push(`Generated ${today} by \`npx tsx scripts/coverage-report.ts\`. Outline source: PSI NY Candidate Information Bulletin (updated 4/28/2023). Exam: ${examSize} questions, ${manifest.exam.timeLimitMinutes} minutes, ${manifest.exam.passingPercent}% to pass.`, '');
  out.push('Status per outline topic: **complete** = taught in an eligible lesson *and* tested by ≥1 eligible question; **partial** = only one of the two; **gap** = neither. Only eligible content counts (verified, or reviewed general principles); drafts are listed separately.', '');
  const tot = { n: cov.nodes.length, c: cov.nodes.filter((n) => n.status === 'complete').length, p: cov.nodes.filter((n) => n.status === 'partial').length, g: cov.nodes.filter((n) => n.status === 'gap').length };
  out.push('## Summary', '');
  out.push(`- Outline topics: **${tot.n}** — complete ${tot.c}, partial ${tot.p}, gap ${tot.g}`);
  out.push(`- Eligible content: ${el.terms.length} glossary terms, ${el.questions.length} questions, ${el.lessons.length} lessons (drafts excluded: ${L.terms.length - el.terms.length} terms, ${L.questions.length - el.questions.length} questions, ${L.lessons.length - el.lessons.length} lessons)`);
  const short = cov.sections.filter((s) => !s.meetsFullExam);
  out.push(`- Full ${examSize}-question exam can be assembled from unique eligible questions: **${short.length ? 'NO' : 'YES'}**${short.length ? ` — shortfall in ${short.map((s) => `${s.id} (${s.eligibleQuestions}/${s.minForOneExam})`).join(', ')}` : ''}`);
  if (mi === 0) out.push(`- Validator (all tracks): ${res.issues.filter((i) => i.level === 'error').length} errors, ${res.issues.filter((i) => i.level === 'warning').length} warnings`);
  out.push('');
  out.push('## Sections', '', `| Section | Weight | Topics complete / partial / gap | Eligible questions | Needed for 1 exam | Target bank |`, '|---|---:|---|---:|---:|---:|');
  for (const s of cov.sections) out.push(`| ${s.id} — ${s.name} | ${s.weightPct}% | ${s.complete} / ${s.partial} / ${s.gap} | ${s.eligibleQuestions} | ${s.minForOneExam}${s.meetsFullExam ? '' : ' ⚠️'} | ${s.targetQuestions} |`);
  out.push('');
  out.push('## Gaps and partial coverage (by topic)', '');
  let any = false;
  for (const s of manifest.sections) {
    const ns = cov.nodes.filter((n) => n.sectionId === s.id && n.status !== 'complete');
    if (!ns.length) continue;
    any = true;
    out.push(`### ${s.id} — ${s.name}`, '', '| Outline id | Topic | Lessons | Questions | Terms | Draft Qs | Status |', '|---|---|---:|---:|---:|---:|---|');
    for (const n of ns) out.push(`| ${n.id} | ${'· '.repeat(n.depth)}${n.title}${n.refs ? ` (${n.refs})` : ''} | ${n.lessons.length}${n.lessonViaAncestor ? ' (via parent)' : ''} | ${n.questions} | ${n.terms} | ${n.draftQuestions} | ${n.status} |`);
    out.push('');
  }
  if (!any) out.push('None — every outline topic is taught and tested.', '');
  out.push('## Draft (unverified) content excluded from learners', '');
  const drafts = [...L.terms, ...L.questions, ...L.lessons].filter((r) => !isEligible(r));
  if (!drafts.length) out.push('None.');
  for (const d of drafts) out.push(`- \`${d.id}\` — ${d.verification.notes ?? (d.verification.status === 'draft' ? 'marked draft' : 'NY-specific/time-sensitive without verified source')}`);
  out.push('');
  const file = mi === 0 ? 'COVERAGE.md' : `COVERAGE-${manifest.series}.md`;
  fs.writeFileSync(path.join(ROOT, 'docs', file), out.join('\n'));
  console.log(`Wrote docs/${file} — ${tot.c}/${tot.n} complete, ${tot.p} partial, ${tot.g} gaps; full exam ${short.length ? 'NOT possible (shortfall)' : 'possible'}.`);
}
