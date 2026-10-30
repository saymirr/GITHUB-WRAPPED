import test from 'node:test';
import assert from 'node:assert/strict';
import { daysInMonth, monthLabel, monthRange, parseMonth, shortDate, weekdayOf } from '../src/dates.mjs';
import { escapeHtml, formatCount, shorten, shortenRepo } from '../src/format.mjs';

test('parseMonth accepts YYYY-MM and rejects everything else', () => {
  assert.deepEqual(parseMonth('2026-10'), { year: 2026, month: 10 });
  for (const bad of ['2026-13', '2026-00', '2026-1', '26-10', '2026-10-01', '2007-12', '', undefined]) {
    assert.throws(() => parseMonth(bad), { code: 'BAD_MONTH' }, String(bad));
  }
});

test('month math handles leap years and labels', () => {
  assert.equal(daysInMonth('2024-02'), 29);
  assert.equal(daysInMonth('2026-02'), 28);
  assert.deepEqual(monthRange('2026-10'), { first: '2026-10-01', last: '2026-10-31' });
  assert.equal(monthLabel('2026-10'), 'October 2026');
  assert.equal(shortDate('2026-10-04'), 'Oct 4');
  assert.equal(weekdayOf('2026-10-31'), 6); // a Saturday
});

test('escapeHtml neutralizes markup', () => {
  assert.equal(escapeHtml(`<img src=x onerror="a('b')">&`), '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;');
});

test('formatCount', () => {
  assert.equal(formatCount(0), '0');
  assert.equal(formatCount(1234), '1,234');
  assert.equal(formatCount(12_345), '12.3k');
  assert.equal(formatCount(20_000), '20k');
  assert.equal(formatCount(1_250_000), '1.2M');
});

test('shorten collapses whitespace, truncates by code point', () => {
  assert.equal(shorten('  a \n b  ', 10), 'a b');
  assert.equal(shorten('abcdefghij', 5), 'abcd…');
  assert.equal(shorten('🚀🚀🚀🚀', 3), '🚀🚀…'); // no broken surrogate pairs
});

test('shortenRepo keeps the repo name and hides the viewer as owner', () => {
  assert.equal(shortenRepo('me/app', 36, 'Me'), 'app');
  assert.equal(shortenRepo('acme/app', 36, 'me'), 'acme/app');
  const long = shortenRepo('a-very-long-organization-name/the-repo', 24, 'me');
  assert.ok(long.endsWith('/the-repo') && [...long].length <= 24, long);
  assert.ok(shortenRepo('o/' + 'r'.repeat(80), 30, 'me').endsWith('…'));
});
