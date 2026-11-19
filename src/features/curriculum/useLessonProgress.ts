import { useCallback, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type LessonProgressRow } from '@/db/db';
import { touchLesson, updateLesson } from '@/db/repo';

/**
 * Live progress row for a lesson. Calls touchLesson once on mount (creating the row) and serialises writes so
 * concurrent patches (parts viewed, knowledge checks, quiz score) never clobber each other.
 */
export function useLessonProgress(lessonId: string, sectionId: string) {
  const row = useLiveQuery(async () => (await db.lessonProgress.get(lessonId)) ?? null, [lessonId]);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const touched = useRef<string | null>(null);

  useEffect(() => {
    if (touched.current === lessonId) return;
    touched.current = lessonId;
    queue.current = queue.current.then(() => touchLesson(lessonId, sectionId)).catch(() => undefined);
  }, [lessonId, sectionId]);

  const patch = useCallback((fn: (cur: LessonProgressRow) => Partial<LessonProgressRow> | null): Promise<unknown> => {
    queue.current = queue.current
      .then(async () => {
        const cur = await db.lessonProgress.get(lessonId);
        if (!cur) return;
        const p = fn(cur);
        if (p) await updateLesson(lessonId, p);
      })
      .catch(() => undefined);
    return queue.current;
  }, [lessonId]);

  return { row, patch };
}
