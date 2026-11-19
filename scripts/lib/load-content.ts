import fs from 'node:fs';
import path from 'node:path';
import type { RawBundle, RawFile } from '../../src/content/validate';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const C = (...p: string[]) => path.join(ROOT, 'content', ...p);

function readJson(abs: string): RawFile {
  const rel = path.relative(ROOT, abs);
  try {
    return { path: rel, data: JSON.parse(fs.readFileSync(abs, 'utf8')) };
  } catch (e) {
    return { path: rel, data: { __parseError: String(e) } };
  }
}
function dir(sub: string): RawFile[] {
  const d = C(sub);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((f) => f.endsWith('.json')).sort().map((f) => readJson(path.join(d, f)));
}

export function loadBundle(): RawBundle {
  return {
    manifest: readJson(C('manifest', 'exam-17-55.json')),
    extraManifests: [readJson(C('manifest', 'exam-17-54.json'))],
    registry: readJson(C('manifest', 'term-registry.json')),
    sources: dir('sources'),
    glossary: dir('glossary'),
    questions: dir('questions'),
    lessons: dir('lessons'),
    scenarios: dir('scenarios'),
  };
}
