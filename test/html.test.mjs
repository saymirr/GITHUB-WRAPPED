import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.mjs';
import { renderCardHtml } from '../src/html.mjs';
import { computeStats } from '../src/stats.mjs';
import * as fx from './fixtures.mjs';

const render = (data, today = '2026-10-30') => renderCardHtml(computeStats(data, { today }), { config });

test('untrusted text is escaped, never injected', () => {
  const html = render(fx.longNamesMonth());
  assert.ok(!html.includes('<script>alert'), 'raw <script> must not appear');
  assert.ok(html.includes('&lt;script&gt;alert(&quot;hi&quot;)'));
});

test('one grid cell per day; best day is marked; future days are flagged', () => {
  const html = render(fx.busyMonth());
  assert.equal((html.match(/class="cell l\d/g) ?? []).length - 5 /* legend */, 31);
  assert.equal((html.match(/ best"/g) ?? []).length, 1);
  const wip = render(fx.inProgressMonth(), fx.IN_PROGRESS_TODAY);
  assert.equal((wip.match(/ future/g) ?? []).length, 18);
  assert.match(wip, /so far/);
});

test('Shipped section is swapped for the breakdown when no PRs merged', () => {
  assert.match(render(fx.busyMonth()), />Shipped</);
  const none = render(fx.reviewsOnlyMonth(), '2026-10-30');
  assert.ok(!none.includes('>Shipped<'));
  assert.match(none, /The breakdown/);
  assert.ok(!none.includes('>0</b><span>commits'), 'zero entries are dropped');
});

test('empty month hides both optional sections but still renders', () => {
  const html = render(fx.emptyMonth());
  assert.ok(!html.includes('>Shipped<') && !html.includes('The breakdown') && !html.includes('Top repos'));
  assert.match(html, /@quiet-person/);
});

test('footer shows handle, month label and watermark; avatar falls back to an initial', () => {
  const html = render(fx.busyMonth());
  assert.match(html, /@sample-user/);
  assert.match(html, /October 2026/);
  assert.ok(html.includes(config.watermark));
  assert.match(html, /class="avatar initial">S</);
  const withAvatar = renderCardHtml(computeStats(fx.busyMonth(), { today: '2026-10-30' }), { config, avatar: 'data:image/png;base64,AAAA' });
  assert.match(withAvatar, /<img class="avatar" src="data:image\/png;base64,AAAA"/);
});

test('language colour is only used when it is a plain hex value', () => {
  const data = fx.busyMonth();
  data.repos[1].languageColor = 'red;background:url(//evil)';
  assert.ok(!render(data).includes('evil'));
});
