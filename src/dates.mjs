// Calendar helpers. Everything is done on 'YYYY-MM-DD' strings and in UTC so
// results never depend on the machine's time zone (GitHub's contribution
// calendar is date-based, too).

import { WrappedError } from './errors.mjs';

const pad = (n) => String(n).padStart(2, '0');

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Validates 'YYYY-MM' and returns its parts. */
export function parseMonth(input) {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(input ?? '');
  if (!m || Number(m[1]) < 2008) {
    throw new WrappedError(`Invalid month "${input}".`, {
      code: 'BAD_MONTH',
      hint: 'Use YYYY-MM, e.g. 2026-10 (GitHub launched in 2008).',
    });
  }
  return { year: Number(m[1]), month: Number(m[2]) };
}

export function daysInMonth(key) {
  const { year, month } = parseMonth(key);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export const dateOf = (key, day) => `${key}-${pad(day)}`;

export const monthOf = (date) => date.slice(0, 7);

/** First and last day of the month, as 'YYYY-MM-DD'. */
export function monthRange(key) {
  return { first: dateOf(key, 1), last: dateOf(key, daysInMonth(key)) };
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekdayOf(date) {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** Today's date in the machine's local time zone, as 'YYYY-MM-DD'. */
export function localDate(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** '2026-10' -> 'October 2026' */
export function monthLabel(key) {
  const { year, month } = parseMonth(key);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/** '2026-10-14' -> 'Oct 14' */
export function shortDate(date) {
  const { month } = parseMonth(monthOf(date));
  return `${MONTH_NAMES[month - 1].slice(0, 3)} ${Number(date.slice(8, 10))}`;
}
