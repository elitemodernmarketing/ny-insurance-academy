/**
 * Lists a section's outline nodes ordered by how few eligible questions test them (direct + descendants).
 *   npx tsx scripts/question-gaps.ts <sectionId>
 */
import { loadBundle } from './lib/load-content';
import { validate } from '../src/content/validate';
import { computeCoverage } from '../src/content/coverage';
import { isEligible } from '../src/content/schema';

const sid = process.argv[2];
const res = validate(loadBundle());
if (!res.parsed || !sid) { console.error('usage: npx tsx scripts/question-gaps.ts <sectionId>'); process.exit(1); }
const p = res.parsed;
const direct = new Map<string, number>();
for (const q of p.questions.filter(isEligible)) for (const o of q.outlineIds) direct.set(o, (direct.get(o) ?? 0) + 1);
const cov = computeCoverage({ sections: p.manifest.sections, lessons: p.lessons.filter(isEligible), questions: p.questions.filter(isEligible), terms: p.terms.filter(isEligible) });
const nodes = cov.nodes.filter((n) => n.sectionId === sid);
const qs = p.questions.filter((q) => q.sectionId === sid && isEligible(q));
const styles: Record<string, number> = {}; const diff: Record<number, number> = {};
for (const q of qs) { styles[q.style] = (styles[q.style] ?? 0) + 1; diff[q.difficulty] = (diff[q.difficulty] ?? 0) + 1; }
console.log(`${sid}: ${qs.length} eligible questions; styles ${JSON.stringify(styles)}; difficulty ${JSON.stringify(diff)}`);
console.log('direct  incl.desc  leaf  id  title');
for (const n of nodes.sort((a, b) => (direct.get(a.id) ?? 0) - (direct.get(b.id) ?? 0) || a.id.localeCompare(b.id)))
  console.log(`${String(direct.get(n.id) ?? 0).padStart(6)}  ${String(n.questions).padStart(9)}  ${n.isLeaf ? 'leaf' : '    '}  ${n.id}  ${n.title}${n.refs ? ` (${n.refs})` : ''}`);
const maxNum = Math.max(0, ...p.questions.filter((q) => q.sectionId === sid).map((q) => Number(q.id.split('-q')[1])));
console.log(`highest existing question number: ${sid}-q${String(maxNum).padStart(3, '0')}`);
