export const DAY_MS = 86_400_000;
/** Local calendar date "YYYY-MM-DD". */
export function localDate(ms: number = Date.now()): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(s: string, n: number): string {
  const d = parseLocalDate(s);
  d.setDate(d.getDate() + n);
  return localDate(d.getTime());
}
export function daysBetween(a: string, b: string): number {
  return Math.round((parseLocalDate(b).getTime() - parseLocalDate(a).getTime()) / DAY_MS);
}
export function startOfWeek(s: string): string {
  const d = parseLocalDate(s);
  return addDays(s, -((d.getDay() + 6) % 7)); // Monday
}
