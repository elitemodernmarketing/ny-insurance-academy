/** Wall-clock exam timer helpers. The deadline is stored as an absolute timestamp so reloads cannot reset it. */
export function deadlineFrom(startMs: number, minutes: number): number {
  return startMs + minutes * 60_000;
}
export function remainingMs(deadlineMs: number, nowMs: number): number {
  return Math.max(0, deadlineMs - nowMs);
}
export function isExpired(deadlineMs: number, nowMs: number): boolean {
  return nowMs >= deadlineMs;
}
export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  const mm = String(m).padStart(2, '0'), ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
/** Elapsed active time, capped at the time limit. */
export function timeUsedMs(startMs: number, endMs: number, limitMs: number): number {
  return Math.min(limitMs, Math.max(0, endMs - startMs));
}
