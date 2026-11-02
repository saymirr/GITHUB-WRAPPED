// Rendering, step 1: stats -> a self-contained HTML string (no I/O, no
// browser APIs), so a web version can reuse it as-is. png.mjs screenshots it.

import { shortDate } from './dates.mjs';
import { escapeHtml as esc, formatCount, shorten, shortenRepo } from './format.mjs';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const SAFE_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * @param {object} stats    output of computeStats()
 * @param {object} options
 * @param {object} options.config   see config.mjs
 * @param {string|null} [options.avatar]  data: URI of the avatar
 * @param {string} [options.fontCss]      @font-face rules (see fonts.mjs)
 * @returns {string} full HTML document
 */
export function renderCardHtml(stats, { config, avatar = null, fontCss = '' }) {
  const { width, height } = config.card;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>GitHub Wrapped - @${esc(stats.username)} - ${esc(stats.monthLabel)}</title>
<style>${fontCss}${css(config)}</style></head>
<body>
<main class="card" style="width:${width}px;height:${height}px">
  <header class="top"><span class="brand">GitHub Wrapped</span><span class="period">${esc(stats.monthLabel)}${stats.inProgress ? ' · so far' : ''}</span></header>
  <div class="body">
    <section class="hero">${gridHtml(stats, config)}</section>
    <section class="right${fillsColumn(stats) ? '' : ' sparse'}">
      <h1 class="tagline">${esc(stats.tagline)}</h1>
      ${statsRowHtml(stats)}
      ${stats.shipped.length ? shippedHtml(stats) : breakdownHtml(stats)}
      ${stats.topRepos.length ? reposHtml(stats) : ''}
    </section>
  </div>
  ${footerHtml(stats, config, avatar)}
</main>
</body></html>`;
}

/** True when the right column has enough content to span the full card height. */
function fillsColumn(stats) {
  return stats.shipped.length === 3 && stats.topRepos.length > 0;
}

// ------------------------------------------------------------------- grid

function gridHtml(stats, { grid: g }) {
  const lead = stats.days[0].weekday; // empty slots before the 1st
  const cols = Math.ceil((lead + stats.daysInMonth) / 7);
  const cell = Math.min(
    g.maxCell,
    Math.floor((g.width - g.labelWidth - g.gap * (cols - 1)) / cols),
    Math.floor((g.height - g.gap * 6) / 7),
  );
  const cells = stats.days.map((d) => {
    const col = Math.floor((lead + d.day - 1) / 7) + 1;
    const classes = ['cell', `l${d.level}`];
    if (d.future) classes.push('future');
    if (stats.bestDay && d.date === stats.bestDay.date) classes.push('best');
    const label = `${shortDate(d.date)}: ${d.count} contribution${d.count === 1 ? '' : 's'}`;
    return `<div class="${classes.join(' ')}" style="grid-column:${col};grid-row:${d.weekday + 1}" title="${esc(label)}"><i>${d.day}</i></div>`;
  });
  const labels = WEEKDAY_LABELS.map((l) => `<span>${l}</span>`).join('');
  const legend = [0, 1, 2, 3, 4].map((l) => `<i class="cell l${l}"></i>`).join('');
  return `
    <div class="grid-wrap" style="--cell:${cell}px;--gap:${g.gap}px;--label:${g.labelWidth}px">
      <div class="weekdays">${labels}</div>
      <div class="grid" style="grid-template-columns:repeat(${cols},var(--cell))">${cells.join('')}</div>
    </div>
    <div class="legend"><span>Less</span>${legend}<span>More</span></div>`;
}

// ------------------------------------------------------------------ stats

function statsRowHtml(stats) {
  const best = stats.bestDay;
  const items = [
    { value: formatCount(stats.total), caption: 'contributions' },
    { value: String(stats.streak.length), caption: 'day streak' },
    { value: `${stats.activeDays}<small>/${stats.daysInMonth}</small>`, caption: 'days active' },
    { value: best ? formatCount(best.count) : '–', caption: best ? `best day · ${shortDate(best.date)}` : 'best day' },
  ];
  return `<div class="stats">${items
    .map((i) => `<div class="stat"><b>${i.value}</b><span>${esc(i.caption)}</span></div>`)
    .join('')}</div>`;
}

// ---------------------------------------------------------- shipped / PRs

function shippedHtml(stats) {
  const more = stats.mergedPrTotal > stats.shipped.length
    ? `top ${stats.shipped.length} of ${stats.mergedPrTotal} merged`
    : `${stats.shipped.length} merged`;
  const rows = stats.shipped.map((pr) => `
      <li><span class="title">${esc(shorten(pr.title, 140))}</span>
          <span class="sub">${esc(shortenRepo(pr.repo, 48, stats.username))}</span></li>`);
  return `<div class="panel"><h2>Shipped<em>${esc(more)}</em></h2><ol class="shipped">${rows.join('')}</ol></div>`;
}

// Shown instead of "Shipped" when there are no merged PRs to brag about.
function breakdownHtml(stats) {
  const c = stats.counts;
  const items = [
    ['commits', c.commits],
    ['pull requests', c.pullRequests],
    ['reviews', c.reviews],
    ['issues', c.issues],
  ].filter(([, n]) => n > 0);
  if (items.length < 2) return ''; // a lone number would just repeat the stats row
  return `<div class="panel"><h2>The breakdown<em>no merged PRs this month</em></h2><div class="breakdown" style="grid-template-columns:repeat(${items.length},minmax(0,1fr))">${items
    .map(([label, n]) => `<div><b>${formatCount(n)}</b><span>${label}</span></div>`)
    .join('')}</div></div>`;
}

// -------------------------------------------------------------- top repos

function reposHtml(stats) {
  const lang = stats.topLanguage;
  const dot = lang && SAFE_COLOR.test(lang.color ?? '') ? `<i class="dot" style="background:${lang.color}"></i>` : '<i class="dot"></i>';
  const note = lang ? `<em>${dot}mostly ${esc(shorten(lang.name, 24))}</em>` : '';
  const bare = stats.topRepos.map((r) => r.name.split('/').pop().toLowerCase());
  const ambiguous = new Set(bare).size < bare.length; // same repo name under two owners
  const items = stats.topRepos.map((r) => `
      <li><span class="name">${esc(ambiguous ? shortenRepo(r.name, 40, stats.username) : r.name.split('/').pop())}</span>
          <span class="commits">${formatCount(r.commits)} commit${r.commits === 1 ? '' : 's'}</span></li>`);
  return `<div class="panel"><h2>Top repos${note}</h2><ul class="repos">${items.join('')}</ul></div>`;
}

// ----------------------------------------------------------------- footer

function footerHtml(stats, { watermark }, avatar) {
  const face = avatar
    ? `<img class="avatar" src="${esc(avatar)}" alt="">`
    : `<span class="avatar initial">${esc(stats.username[0].toUpperCase())}</span>`;
  return `
  <footer class="footer">
    <div class="who">${face}<span class="handle">@${esc(stats.username)}</span><span class="month">${esc(stats.monthLabel)}</span></div>
    <div class="mark"><i></i>${esc(watermark)}</div>
  </footer>`;
}

// -------------------------------------------------------------------- css

function css({ theme: t, fonts }) {
  return `
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:${t.bg}}
body{font-family:${fonts.family};color:${t.text};-webkit-font-smoothing:antialiased}
.stat b,.breakdown b,.cell i,.commits{font-variant-numeric:tabular-nums}
.card{position:relative;overflow:hidden;display:flex;flex-direction:column;padding:30px 48px 26px;
  background:radial-gradient(900px 520px at 100% 0%,${t.bgGlow},transparent 70%),${t.bg}}
.top{display:flex;justify-content:space-between;font-size:15px;font-weight:800;letter-spacing:.2em;text-transform:uppercase}
.brand{color:${t.accent}} .period{color:${t.textMuted}}
.body{flex:1;min-height:0;display:grid;grid-template-columns:440px minmax(0,1fr);column-gap:56px;margin-top:18px}

/* hero grid */
.hero{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px}
.grid-wrap{display:flex;gap:0}
.weekdays{display:grid;grid-template-rows:repeat(7,var(--cell));row-gap:var(--gap);width:var(--label);
  font-size:12px;font-weight:700;color:${t.textFaint};align-items:center}
.grid{display:grid;grid-template-rows:repeat(7,var(--cell));gap:var(--gap)}
.cell{position:relative;border-radius:calc(var(--cell)*.2);background:${t.levels[0]}}
.cell i{position:absolute;left:7px;top:5px;font:700 11px/1 ${fonts.family};font-style:normal;color:rgba(255,255,255,.28)}
.l1{background:${t.levels[1]}}.l2{background:${t.levels[2]}}.l3{background:${t.levels[3]}}.l4{background:${t.levels[4]};box-shadow:0 0 16px rgba(57,211,83,.35)}
.l3 i,.l4 i{color:rgba(0,0,0,.45)}
.cell.future{background:transparent;outline:1.5px dashed ${t.line}}
.cell.best{box-shadow:0 0 0 3px ${t.bg},0 0 0 5px ${t.text},0 0 22px rgba(57,211,83,.6)}
.legend{display:flex;align-items:center;gap:5px;font-size:13px;font-weight:700;color:${t.textFaint}}
.legend span:first-child{margin-right:3px}.legend span:last-child{margin-left:3px}
.legend .cell{width:14px;height:14px;border-radius:3px;box-shadow:none}

/* right column */
.right{display:flex;flex-direction:column;justify-content:space-between;min-width:0;gap:14px}
.right.sparse{justify-content:center;gap:30px}
.tagline{font-size:42px;line-height:1.04;font-weight:900;letter-spacing:-.03em;text-wrap:balance;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.stats{display:grid;grid-template-columns:1.35fr 1fr 1.2fr 1.6fr;gap:12px}
.stat{background:${t.surface};border:1px solid ${t.line};border-radius:16px;padding:12px 14px 11px;min-width:0}
.stat b{display:block;font-size:44px;line-height:1;font-weight:900;letter-spacing:-.03em;color:${t.text};white-space:nowrap}
.stat b small{font-size:.5em;font-weight:800;color:${t.textMuted};letter-spacing:0}
.stat span{display:block;margin-top:7px;font-size:15px;font-weight:700;color:${t.textMuted};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

.panel h2{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:8px;
  font-size:14px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:${t.accent}}
.panel h2 em{font-style:normal;font-size:14px;letter-spacing:.02em;text-transform:none;font-weight:700;color:${t.textMuted};
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:${t.textFaint};margin-right:6px}
ol,ul{list-style:none}
.shipped li{padding:5px 0;border-top:1px solid ${t.line};min-width:0}
.shipped .title{display:block;font-size:20px;font-weight:800;letter-spacing:-.01em;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.shipped .sub{display:block;font-size:15px;font-weight:700;color:${t.textMuted};margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.breakdown{display:grid;gap:12px;border-top:1px solid ${t.line};padding-top:12px}
.breakdown b{display:block;font-size:34px;line-height:1;font-weight:900;letter-spacing:-.02em}
.breakdown span{display:block;margin-top:5px;font-size:15px;font-weight:700;color:${t.textMuted}}
.repos{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.repos li{background:${t.surface};border:1px solid ${t.line};border-radius:12px;padding:9px 12px;min-width:0}
.repos .name{display:block;font-size:17px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.repos .commits{display:block;margin-top:2px;font-size:15px;font-weight:700;color:${t.accent}}

/* footer */
.footer{display:flex;justify-content:space-between;align-items:center;gap:24px;margin-top:14px;padding-top:12px;border-top:1px solid ${t.line}}
.who{display:flex;align-items:center;gap:14px;min-width:0}
.avatar{flex:none;width:44px;height:44px;border-radius:50%;box-shadow:0 0 0 2px ${t.accent};object-fit:cover}
.avatar.initial{display:flex;align-items:center;justify-content:center;background:${t.surface};font-size:20px;font-weight:900;color:${t.accent}}
.handle{font-size:24px;font-weight:900;letter-spacing:-.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.month{flex:none;font-size:18px;font-weight:700;color:${t.textMuted};white-space:nowrap}
.month::before{content:"·";margin-right:14px;color:${t.textFaint}}
.mark{flex:none;display:flex;align-items:center;gap:9px;font-size:15px;font-weight:800;letter-spacing:.04em;color:${t.textMuted}}
.mark i{width:12px;height:12px;border-radius:3px;background:${t.accent}}
`;
}
