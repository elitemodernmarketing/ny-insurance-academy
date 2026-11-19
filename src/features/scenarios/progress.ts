/** Scenario completion tracking (db.scenarioProgress). Ids are `<scenario>` or `<scenario>:<caseId>`. */
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type ScenarioProgressRow } from '@/db/db';
import { SECTION_IDS, type SectionId } from '@/content/schema';

export async function markScenarioComplete(id: string, kind: string, score: number | null): Promise<void> {
  await db.transaction('rw', db.scenarioProgress, async () => {
    const cur = await db.scenarioProgress.get(id);
    await db.scenarioProgress.put({ id, kind, completedAt: Date.now(), score, attempts: (cur?.attempts ?? 0) + 1 });
  });
}

/** Live map of completion rows keyed by id. */
export function useScenarioProgress(): Map<string, ScenarioProgressRow> {
  const rows = useLiveQuery(() => db.scenarioProgress.toArray(), []);
  return new Map((rows ?? []).map((r) => [r.id, r]));
}

/** Best-effort section id from an outline id like "reg.2.1". Falls back to `fallback`. */
export function sectionFromOutline(outlineIds: string[], fallback: SectionId = 'reg'): SectionId {
  const head = outlineIds[0]?.split('.')[0];
  return (SECTION_IDS as readonly string[]).includes(head ?? '') ? (head as SectionId) : fallback;
}
