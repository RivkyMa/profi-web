/**
 * Fixed-format date helpers. Dates are ISO strings ("2026-10-12" or
 * "2026-10-12T14:00Z") and are formatted by string slicing, never by
 * `new Date()` / `toLocaleString`, so server and client always agree and the
 * demo is not tied to the user's time zone or clock.
 */

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** The demo's "today". Everything in the mock data is relative to it. */
export const DEMO_TODAY = "2026-10-12";

/** "2026-10-12" -> "12 Oct 2026". */
export function formatDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-");
  const m = Number(month) - 1;
  if (!year || !day || m < 0 || m > 11) return iso;
  return `${Number(day)} ${MONTHS[m]} ${year}`;
}

/** "2026-10-12T14:00Z" -> "12 Oct 2026, 14:00 UTC". */
export function formatDateTime(iso: string): string {
  const time = iso.length >= 16 ? iso.slice(11, 16) : "00:00";
  return `${formatDate(iso)}, ${time} UTC`;
}

/** Adds whole days to an ISO date (UTC), returning an ISO date. */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}
