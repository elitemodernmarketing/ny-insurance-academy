/** Portable JSON export / import of all learner data. Content is NOT exported (it ships with the app). */
import { z } from 'zod';
import { db, TABLES, type TableName } from './db';

export const BACKUP_APP = 'ny-insurance-academy';
export const BACKUP_SCHEMA_VERSION = 1;

const backupSchema = z.object({
  app: z.literal(BACKUP_APP),
  schemaVersion: z.number().int().positive(),
  exportedAt: z.string(),
  data: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
});
export type Backup = z.infer<typeof backupSchema>;

export async function exportData(): Promise<Backup> {
  const data: Record<string, Record<string, unknown>[]> = {};
  for (const t of TABLES) data[t] = (await db.table(t).toArray()) as Record<string, unknown>[];
  return { app: BACKUP_APP, schemaVersion: BACKUP_SCHEMA_VERSION, exportedAt: new Date().toISOString(), data };
}

export function parseBackup(json: unknown): { ok: true; backup: Backup } | { ok: false; error: string } {
  const r = backupSchema.safeParse(json);
  if (!r.success) return { ok: false, error: r.error.issues.slice(0, 3).map((i) => `${i.path.join('.') || 'file'}: ${i.message}`).join('; ') };
  if (r.data.schemaVersion > BACKUP_SCHEMA_VERSION) return { ok: false, error: `Backup is from a newer app version (schema ${r.data.schemaVersion}).` };
  const unknown = Object.keys(r.data.data).filter((k) => !(TABLES as readonly string[]).includes(k));
  if (unknown.length) return { ok: false, error: `Unknown tables in backup: ${unknown.join(', ')}` };
  return { ok: true, backup: r.data };
}

/**
 * Import a backup. mode "replace" clears every table first (exact restore); mode "merge" upserts rows by primary key
 * (auto-increment tables get new ids, so merge may duplicate history rows that already exist).
 */
export async function importData(backup: Backup, mode: 'replace' | 'merge' = 'replace'): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES as readonly TableName[]) {
      const rows = backup.data[t] ?? [];
      const table = db.table(t);
      if (mode === 'replace') await table.clear();
      const autoInc = !!table.schema.primKey.auto;
      const prepared = rows.map((r) => {
        if (autoInc && mode === 'merge') { const { id: _drop, ...rest } = r as { id?: unknown }; void _drop; return rest; }
        return r;
      });
      if (prepared.length) await table.bulkPut(prepared);
      counts[t] = prepared.length;
    }
  });
  return counts;
}

export async function resetAllData(): Promise<void> {
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) await db.table(t).clear();
  });
}

export function downloadJson(obj: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
