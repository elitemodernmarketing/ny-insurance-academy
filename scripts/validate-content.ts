/**
 * Validate all content in /content.
 *   npx tsx scripts/validate-content.ts                 # everything
 *   npx tsx scripts/validate-content.ts --section lpr   # only report issues for files/ids of one section
 *   npx tsx scripts/validate-content.ts --json          # also write docs/validation-report.json
 *   npx tsx scripts/validate-content.ts --quiet-warnings
 * Exit code 1 when any error is reported (for the filtered scope).
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadBundle, ROOT } from './lib/load-content';
import { validate } from '../src/content/validate';

const args = process.argv.slice(2);
const section = args.includes('--section') ? args[args.indexOf('--section') + 1] : undefined;
const quietWarnings = args.includes('--quiet-warnings');

const bundle = loadBundle();
for (const f of [...bundle.glossary, ...bundle.questions, ...bundle.lessons, ...bundle.sources, ...bundle.scenarios]) {
  if ((f.data as { __parseError?: string }).__parseError) console.error(`JSON PARSE ERROR in ${f.path}: ${(f.data as { __parseError: string }).__parseError}`);
}
const res = validate(bundle);
const inScope = (i: { file: string; id?: string }) =>
  !section || i.file.includes(`/${section}.json`) || i.file.includes(`/${section}-`) || i.file.endsWith(`/${section}`) || (i.id ?? '').startsWith(section + '-') || (i.id ?? '').startsWith(section + '.');
const scoped = res.issues.filter(inScope);
const errors = scoped.filter((i) => i.level === 'error');
const warnings = scoped.filter((i) => i.level === 'warning');

for (const i of errors) console.log(`ERROR   ${i.file}${i.id ? ` [${i.id}]` : ''}: ${i.message}`);
if (!quietWarnings) for (const i of warnings) console.log(`warning ${i.file}${i.id ? ` [${i.id}]` : ''}: ${i.message}`);

console.log('\n=== Content summary ===');
console.log(JSON.stringify(res.counts));
console.log('section  terms  questions(eligible)  lessons');
for (const [k, v] of Object.entries(res.bySection)) {
  if (section && k !== section) continue;
  console.log(`${k.padEnd(8)} ${String(v.terms).padStart(5)}  ${String(v.questions).padStart(5)} (${String(v.questionsEligible).padStart(3)})         ${v.lessons}`);
}
console.log(`\n${errors.length} error(s), ${warnings.length} warning(s)${section ? ` in scope "${section}"` : ''}`);
if (args.includes('--json')) {
  fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'docs', 'validation-report.json'), JSON.stringify({ generatedAt: new Date().toISOString(), counts: res.counts, bySection: res.bySection, issues: res.issues }, null, 1));
}
process.exit(errors.length ? 1 : 0);
