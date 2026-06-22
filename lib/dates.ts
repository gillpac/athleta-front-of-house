// ─────────────────────────────────────────────────────────────────────────────
// Melbourne-time date helpers.
//
// All timestamps in the database are stored in UTC (Postgres `timestamptz`),
// which is correct. The bug we keep hitting is reading the *calendar date* off a
// UTC ISO string with `.slice(0, 10)` — that gives the UTC date, which is the
// PREVIOUS day for any morning Melbourne time (Melbourne is UTC+10/+11).
//
// Rule for the whole app: never derive a date from an ISO string by hand. Always
// go through these helpers so "what day is this trial / follow-up on?" is
// answered in Melbourne time, with daylight saving handled automatically.
// ─────────────────────────────────────────────────────────────────────────────

export const MELB_TZ = 'Australia/Melbourne'

/** Melbourne calendar date (YYYY-MM-DD) for an ISO timestamp. */
export function melbDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: MELB_TZ })
}

/** Today's Melbourne calendar date (YYYY-MM-DD). */
export function melbToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: MELB_TZ })
}

/** Melbourne time of day, e.g. "9:00 am". */
export function melbTime(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', timeZone: MELB_TZ })
    .toLowerCase()
}

/** Add (or subtract) whole days to a YYYY-MM-DD string, returning YYYY-MM-DD. */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
