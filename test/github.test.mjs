import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WrappedError } from '../src/errors.mjs';
import { createRunner, fetchMonthData, MERGED_PRS_QUERY, PROFILE_QUERY, VIEWER_QUERY } from '../src/github.mjs';

// ---- a fake GraphQL backend shaped like GitHub's responses -----------------

const repo = (name, isPrivate, commits) => ({
  repository: { nameWithOwner: name, isPrivate, primaryLanguage: { name: 'Go', color: '#00ADD8' } },
  contributions: { totalCount: commits },
});
const pr = (title, repoName, isPrivate, additions) => ({
  title, url: '#', additions, deletions: 0, comments: { totalCount: 0 }, repository: { nameWithOwner: repoName, isPrivate },
});

function fakeBackend({ viewer = 'me', users = { alice: true, me: true } } = {}) {
  const calls = [];
  const run = async (query, variables = {}) => {
    calls.push({ query, variables });
    if (query === VIEWER_QUERY) return { viewer: { login: viewer } };
    if (query === PROFILE_QUERY) {
      if (!users[variables.login.toLowerCase()]) return { user: null }; // GitHub logins are case-insensitive
      return { user: {
        login: variables.login, name: null, avatarUrl: 'https://avatars.githubusercontent.com/u/1',
        contributionsCollection: {
          totalCommitContributions: 10, totalPullRequestContributions: 2, totalIssueContributions: 0,
          totalPullRequestReviewContributions: 1, restrictedContributionsCount: 3,
          contributionCalendar: { totalContributions: 3, weeks: [{ contributionDays: [
            { date: '2026-10-01', contributionCount: 2 }, { date: '2026-10-02', contributionCount: 1 },
          ] }] },
          commitContributionsByRepository: [repo('acme/secret-project', true, 50), repo('acme/public-lib', false, 7)],
        },
      } };
    }
    assert.equal(query, MERGED_PRS_QUERY);
    const nodes = [pr('Secret roadmap rewrite', 'acme/secret-project', true, 900), pr('Public fix', 'acme/public-lib', false, 5), {}];
    // A real `is:public` search would not return private PRs; only emulate that when asked.
    return { search: { issueCount: nodes.length, pageInfo: { hasNextPage: false, endCursor: null }, nodes } };
  };
  return { run, calls };
}
const opts = { month: '2026-10', today: '2026-10-30' };

test('another user: private repos and PRs never appear, search is public-only', async () => {
  const { run, calls } = fakeBackend();
  const data = await fetchMonthData({ run, username: 'alice', ...opts });
  assert.equal(data.isSelf, false);
  assert.deepEqual(data.repos.map((r) => r.name), ['acme/public-lib']);
  assert.deepEqual(data.mergedPrs.map((p) => p.title), ['Public fix']);
  assert.match(calls.find((c) => c.variables.q).variables.q, /\bis:public\b/);
  assert.ok(!JSON.stringify(data).includes('secret'), 'no trace of private names in the data');
});

test('own card: private repos and PRs are included (case-insensitive match)', async () => {
  const { run, calls } = fakeBackend();
  const data = await fetchMonthData({ run, username: 'ME', ...opts });
  assert.equal(data.isSelf, true);
  assert.equal(data.repos.length, 2);
  assert.equal(data.mergedPrs.length, 2);
  assert.ok(!/is:public/.test(calls.find((c) => c.variables.q).variables.q));
});

test('--public-only hides private data even on your own card', async () => {
  const { run } = fakeBackend();
  const data = await fetchMonthData({ run, username: 'me', publicOnly: true, ...opts });
  assert.deepEqual(data.repos.map((r) => r.name), ['acme/public-lib']);
  assert.deepEqual(data.mergedPrs.map((p) => p.title), ['Public fix']);
});

test('username defaults to the authenticated user', async () => {
  const { run } = fakeBackend({ viewer: 'me' });
  assert.equal((await fetchMonthData({ run, ...opts })).username, 'me');
});

test('the PR search is built from validated input and the right date window', async () => {
  const { run, calls } = fakeBackend();
  await fetchMonthData({ run, username: 'alice', month: '2026-02', today: '2026-10-30' });
  assert.equal(calls.find((c) => c.variables.q).variables.q, 'is:pr author:alice is:merged merged:2026-02-01..2026-02-28 is:public');
  await assert.rejects(fetchMonthData({ run, username: 'x author:victim', ...opts }), { code: 'BAD_USERNAME' });
  await assert.rejects(fetchMonthData({ run, username: 'a'.repeat(40), ...opts }), { code: 'BAD_USERNAME' });
});

test('the current month only queries up to today; future months are rejected', async () => {
  const { run, calls } = fakeBackend();
  await fetchMonthData({ run, username: 'alice', month: '2026-10', today: '2026-10-15' });
  assert.equal(calls.find((c) => c.variables.to).variables.to, '2026-10-15T23:59:59Z');
  await assert.rejects(fetchMonthData({ run, username: 'alice', month: '2026-12', today: '2026-10-15' }), { code: 'BAD_MONTH' });
});

test('unknown user -> a clean NOT_FOUND (also when the API itself raises it)', async () => {
  const { run } = fakeBackend();
  await assert.rejects(fetchMonthData({ run, username: 'ghost', ...opts }), { code: 'NOT_FOUND', message: 'GitHub user "ghost" not found.' });
  const throwing = async (q, v) => {
    if (q === PROFILE_QUERY) throw new WrappedError("Could not resolve to a User with the login of 'x'.", { code: 'NOT_FOUND' });
    return run(q, v);
  };
  await assert.rejects(fetchMonthData({ run: throwing, username: 'ghost', ...opts }), { message: 'GitHub user "ghost" not found.' });
  // `wrapped.mjs 2026-10` passes a month where the username goes: say so.
  await assert.rejects(fetchMonthData({ run, username: '2026-10', ...opts }), { code: 'NOT_FOUND', hint: /username comes first/ });
});

// ---- transport: the real createRunner() against a fake `gh` on PATH ---------

async function fakeGh(script) {
  const dir = await mkdtemp(join(tmpdir(), 'fake-gh-'));
  await writeFile(join(dir, 'gh'), `#!/usr/bin/env node\n${script}`);
  await chmod(join(dir, 'gh'), 0o755);
  return { PATH: `${dir}:${process.env.PATH}` };
}

test('transport: passes variables as raw -f fields and parses the response', async () => {
  const env = await fakeGh(`
    const a = process.argv.slice(2);
    console.log(JSON.stringify({ data: { echo: a } }));`);
  const { echo } = await createRunner({ env })('query { x }', { login: 'alice', after: null });
  assert.deepEqual(echo, ['api', 'graphql', '-f', 'query=query { x }', '-f', 'login=alice']);
});

test('transport: GraphQL NOT_FOUND on stdout with a non-zero exit is mapped', async () => {
  const env = await fakeGh(`
    console.log(JSON.stringify({ data: { user: null }, errors: [{ type: 'NOT_FOUND', message: "Could not resolve to a User with the login of 'x'." }] }));
    process.exit(1);`);
  await assert.rejects(createRunner({ env })('q'), { code: 'NOT_FOUND' });
});

test('transport: rate limit and auth failures get friendly errors', async () => {
  const limited = await fakeGh(`console.error('gh: API rate limit exceeded for user ID 1. (HTTP 403)'); process.exit(1);`);
  await assert.rejects(createRunner({ env: limited })('q'), { code: 'RATE_LIMIT', hint: /try again/i });
  const unauth = await fakeGh(`console.error('gh: Bad credentials (HTTP 401)'); process.exit(1);`);
  await assert.rejects(createRunner({ env: unauth })('q'), { code: 'AUTH', hint: /gh auth login/ });
});

test('transport: REST-style error bodies (HTTP 401/403) become friendly errors, not crashes', async () => {
  const body = (message) => fakeGh(`console.log(JSON.stringify({ message: ${JSON.stringify(message)}, documentation_url: 'x' })); process.exit(1);`);
  await assert.rejects(createRunner({ env: await body('Bad credentials') })('q'), { code: 'AUTH' });
  await assert.rejects(createRunner({ env: await body('API rate limit exceeded for user ID 1.') })('q'), { code: 'RATE_LIMIT' });
  await assert.rejects(createRunner({ env: await body('Resource not accessible by integration') })('q'),
    { code: 'API', message: /Resource not accessible/ });
});

test('transport (fetch): only a drained quota is a rate limit; other 403s keep their message', async (t) => {
  const env = { PATH: '/nonexistent', GITHUB_TOKEN: 'ghp_x' };
  const reply = (status, headers, body) => t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(body), { status, headers }));
  reply(403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1900000000' }, { message: 'forbidden' });
  await assert.rejects(createRunner({ env })('q'), { code: 'RATE_LIMIT' });
  globalThis.fetch.mock.mockImplementation(async () => new Response('{"message":"Resource not accessible"}', { status: 403 }));
  await assert.rejects(createRunner({ env })('q'), { code: 'API', message: /Resource not accessible/ });
});

test('transport: without gh it falls back to fetch + GITHUB_TOKEN, and never leaks the token', async (t) => {
  const SECRET = 'ghp_SUPERSECRETTOKEN123';
  const noGh = { PATH: '/nonexistent', GITHUB_TOKEN: SECRET };
  const seen = [];
  const logs = [];
  t.mock.method(console, 'log', (...a) => logs.push(a));
  t.mock.method(console, 'error', (...a) => logs.push(a));
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    seen.push({ url, init });
    return new Response(JSON.stringify({ data: { ok: true } }), { status: 200 });
  });
  assert.deepEqual(await createRunner({ env: noGh })('query { x }'), { ok: true });
  assert.equal(seen[0].url, 'https://api.github.com/graphql');
  assert.equal(seen[0].init.headers.authorization, `Bearer ${SECRET}`);

  globalThis.fetch.mock.mockImplementation(async () => new Response('{"message":"Bad credentials"}', { status: 401 }));
  const err = await createRunner({ env: noGh })('q').catch((e) => e);
  assert.equal(err.code, 'AUTH');
  assert.ok(![err.message, err.hint, err.stack, JSON.stringify(logs)].join('\n').includes(SECRET));

  await assert.rejects(createRunner({ env: { PATH: '/nonexistent' } })('q'), { code: 'AUTH' });
});
