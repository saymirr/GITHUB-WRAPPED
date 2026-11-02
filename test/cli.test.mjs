import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { resolveRequest } from '../src/cli.mjs';
import { previousMonth } from '../src/dates.mjs';
import { askForRequest } from '../src/prompt.mjs';

const today = '2026-11-02';

test('previousMonth wraps around the year', () => {
  assert.equal(previousMonth('2026-11-02'), '2026-10');
  assert.equal(previousMonth('2026-01-31'), '2025-12');
});

test('resolveRequest: defaults, explicit month, --last', () => {
  assert.deepEqual(resolveRequest({ positionals: [], today }), { username: undefined, month: '2026-11' });
  assert.deepEqual(resolveRequest({ positionals: ['alice', '2026-09'], today }), { username: 'alice', month: '2026-09' });
  assert.deepEqual(resolveRequest({ positionals: ['alice'], last: true, today }), { username: 'alice', month: '2026-10' });
  assert.deepEqual(resolveRequest({ positionals: ['', '2026-09'], today }), { username: undefined, month: '2026-09' });
});

test('resolveRequest rejects --last with a month, and bad months', () => {
  assert.throws(() => resolveRequest({ positionals: ['a', '2026-09'], last: true, today }), { code: 'USAGE' });
  assert.throws(() => resolveRequest({ positionals: ['a', '2026-13'], today }), { code: 'BAD_MONTH' });
});

async function answer(lines) {
  const input = new PassThrough();
  const output = new PassThrough();
  const done = askForRequest({ today, input, output });
  // feed one line per question, as a person typing would
  for (const line of lines) { await new Promise((r) => setImmediate(r)); input.write(`${line}\n`); }
  return { result: await done, shown: output.read()?.toString() ?? '' };
}

test('prompt: Enter twice = you, this month', async () => {
  assert.deepEqual((await answer(['', ''])).result, { username: undefined, month: '2026-11' });
});

test('prompt: username with @, and "last"', async () => {
  assert.deepEqual((await answer(['@alice', 'last'])).result, { username: 'alice', month: '2026-10' });
});

test('prompt: re-asks after an invalid month', async () => {
  const { result, shown } = await answer(['alice', 'october', '2026-10']);
  assert.deepEqual(result, { username: 'alice', month: '2026-10' });
  assert.match(shown, /Invalid month "october"/);
});

test('prompt: gives up after three bad months', async () => {
  await assert.rejects(answer(['alice', 'x', 'y', 'z']), { code: 'USAGE' });
});
