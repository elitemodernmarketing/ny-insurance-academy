import { useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, DEFAULT_SETTINGS, type Settings, type ActivityKind } from './db';
import { logStudySeconds } from './repo';

/** Live settings (defaults while loading). */
export function useSettings(): Settings {
  const s = useLiveQuery(() => db.settings.get('app'), []);
  return { ...DEFAULT_SETTINGS, ...(s ?? {}), tutor: { ...DEFAULT_SETTINGS.tutor, ...(s?.tutor ?? {}) } };
}
export function useSettingsLoaded(): Settings | undefined {
  const s = useLiveQuery(async () => (await db.settings.get('app')) ?? null, []);
  if (s === undefined) return undefined;
  return { ...DEFAULT_SETTINGS, ...(s ?? {}), tutor: { ...DEFAULT_SETTINGS.tutor, ...(s?.tutor ?? {}) } };
}

/**
 * Track active study time for the mounted page. Counts a second only when the tab is visible and the
 * learner interacted (mouse, key, touch, scroll) within the last 90 seconds. Flushes every 15 seconds and on unmount.
 * This is independent study time — it is NOT approved prelicensing course credit.
 */
export function useStudyTimer(kind: ActivityKind, active = true): void {
  const pending = useRef(0);
  const lastInput = useRef(Date.now());
  useEffect(() => {
    if (!active) return;
    const bump = () => { lastInput.current = Date.now(); };
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll', 'mousemove'] as const;
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const tick = setInterval(() => {
      if (document.visibilityState === 'visible' && Date.now() - lastInput.current < 90_000) pending.current += 1;
    }, 1000);
    const flush = () => { const s = pending.current; pending.current = 0; if (s > 0) void logStudySeconds(kind, s); };
    const flusher = setInterval(flush, 15_000);
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      clearInterval(tick); clearInterval(flusher);
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
  }, [kind, active]);
}
