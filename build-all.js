#!/usr/bin/env node
/**
 * morestayz 전체 재빌드(self-heal)
 *  - data/articles/*.json → articles/*.html
 *  - index.html(1p) + page/N.html (전체 최신 피드, 정적 페이지네이션)
 *  - category/<id>.html + category/<id>/N.html (카테고리별 재배치)
 *  - articles.json(검색) + sitemap.xml
 *  publish.js가 매 실행 호출 → 생성물이 항상 데이터와 일치
 */
const fs = require('fs');
const path = require('path');
const { buildOne, buildSpecial, editorialTitle, editorialDescription, isCurrentOrFuture } = require('./build');

const ROOT = __dirname;
const SITE = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/site.json'), 'utf8'));
const THEMES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/themes.json'), 'utf8'));
const ART = path.join(ROOT, 'data/articles');
const PAGE_SIZE = 12;
const BASE = `https://${SITE.domain}`;

// 카테고리 정의(테마 순서 = 노출 순서). 실제 글이 있는 카테고리만 노출.
// '국내 특별 여행지'(domestic)는 자동 테마가 아닌 에디토리얼 기획 카테고리로 맨 앞에 노출.
const SPECIALS = path.join(ROOT, 'data/specials');
const CATS = [{ id: 'celebrity', label: 'Celebrity & Screen', emoji: '🎬' }, ...THEMES.themes.map(t => ({ id: t.id, label: t.audience, emoji: t.emoji }))];

// 특별기획 글은 이미지가 없으므로 지역명 타이포 카드(SVG data-URI)를 썸네일로 사용
function specialCardImg(region) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6f8f67"/><stop offset="1" stop-color="#365a78"/></linearGradient></defs><rect width="600" height="400" fill="url(#g)"/><text x="50%" y="45%" fill="#ffffff" font-family="sans-serif" font-size="66" font-weight="800" text-anchor="middle">${region}</text><text x="50%" y="61%" fill="rgba(255,255,255,0.9)" font-family="sans-serif" font-size="20" font-weight="700" letter-spacing="5" text-anchor="middle">FEATURED</text></svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}
function specialMetas() {
  if (!fs.existsSync(SPECIALS)) return [];
  return fs.readdirSync(SPECIALS).filter(f => f.endsWith('.json') && !f.endsWith('.hotels.json')).map(f => {
    const d = JSON.parse(fs.readFileSync(path.join(SPECIALS, f), 'utf8'));
    return {
      slug: d.slug, theme: 'domestic', title: d.title,
      audience: d.categoryLabel || 'Celebrity & Screen', emoji: d.emoji || '🎬',
      city: d.region || '', season: 'Featured', travelMonthLabel: '',
      heroImg: specialCardImg(d.region || d.slug), updated: d.updated || '',
    };
  });
}

function articleMetas() {
  if (!fs.existsSync(ART)) return [];
  return fs.readdirSync(ART).filter(f => f.endsWith('.json')).map(f => {
    const d = JSON.parse(fs.readFileSync(path.join(ART, f), 'utf8'));
    return {
      slug: d.slug, theme: d.theme, title: editorialTitle(d), description: editorialDescription(d), audience: d.audience, emoji: d.emoji,
      city: d.city, season: d.season || '', travelMonthLabel: d.travelMonthLabel || '',
      heroImg: d.heroImg || '', updated: d.updated || (d._meta && d._meta.fetchedAt) || '', indexable: isCurrentOrFuture(d),
    };
  }).sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
}

function cardHtml(m) {
  return `      <a class="card" href="/articles/${m.slug}">
        <div class="cthumb"><img src="${m.heroImg}" alt="${String(m.title || '').replace(/"/g, '&quot;')}" loading="lazy"><span class="ctag">${m.emoji} ${m.audience}</span></div>
        <div class="cbody"><span class="cmeta">${[m.season, m.travelMonthLabel].filter(Boolean).join(' · ')}</span><h2>${m.title}</h2></div>
      </a>`;
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out.length ? out : [[]];
}

// base: '/' (홈) 또는 '/category/<id>'
function pageUrl(base, k) {
  if (k === 1) return base;
  return (base === '/' ? '/page' : base) + '/' + k;
}

function pagerHtml(base, cur, total) {
  if (total <= 1) return '';
  const want = new Set([1, total, cur, cur - 1, cur + 1, cur - 2, cur + 2]);
  const ks = [];
  for (let k = 1; k <= total; k++) if (want.has(k)) ks.push(k);
  let html = '', last = 0;
  if (cur > 1) html += `<a class="pg nav" href="${pageUrl(base, cur - 1)}" aria-label="Previous">‹</a>`;
  ks.forEach(k => {
    if (last && k - last > 1) html += `<span class="pg gap">…</span>`;
    html += (k === cur)
      ? `<span class="pg cur" aria-current="page">${k}</span>`
      : `<a class="pg" href="${pageUrl(base, k)}">${k}</a>`;
    last = k;
  });
  if (cur < total) html += `<a class="pg nav" href="${pageUrl(base, cur + 1)}" aria-label="Next">›</a>`;
  return html;
}

function catnavHtml(activeCats, currentId) {
  const chip = (href, label, on) => `<a class="cchip${on ? ' on' : ''}" href="${href}">${label}</a>`;
  let html = chip('/', 'All', currentId === 'all');
  activeCats.forEach(c => { html += chip(`/category/${c.id}`, `${c.emoji} ${c.label}`, currentId === c.id); });
  return html;
}

function applyShell(shell, opts) {
  // opts: { cards, pager, catnav, canon, title, seclabel }
  let html = shell
    .replace(/<!--ARTICLES_START-->[\s\S]*?<!--ARTICLES_END-->/, `<!--ARTICLES_START-->\n${opts.cards}\n      <!--ARTICLES_END-->`)
    .replace(/<!--PAGER_START-->[\s\S]*?<!--PAGER_END-->/, `<!--PAGER_START-->${opts.pager}<!--PAGER_END-->`)
    .replace(/<!--CATNAV_START-->[\s\S]*?<!--CATNAV_END-->/, `<!--CATNAV_START-->${opts.catnav}<!--CATNAV_END-->`)
    .replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${opts.canon}">`)
    .replace(/(<meta property="og:url" content=")[^"]*(">)/, `$1${opts.canon}$2`);
  if (opts.title) html = html.replace(/<title>[^<]*<\/title>/, `<title>${opts.title}</title>`);
  if (opts.seclabel) html = html.replace(/<div class="seclabel"[^>]*id="seclabel"[^>]*>[\s\S]*?<\/div>/,
    `<div class="seclabel" id="seclabel"><h2>${opts.seclabel}</h2><span class="ln"></span></div>`);
  return html;
}

function writePages(shell, ctx, activeCats) {
  // ctx: { kind:'home'|'category', id, label, base, metas }
  const pages = chunk(ctx.metas, PAGE_SIZE);
  const total = pages.length;
  pages.forEach((chunkMetas, i) => {
    const p = i + 1;
    const url = pageUrl(ctx.base, p);
    const canon = BASE + (url === '/' ? '/' : url);
    const cards = chunkMetas.map(cardHtml).join('\n');
    const opts = {
      cards,
      pager: pagerHtml(ctx.base, p, total),
      catnav: catnavHtml(activeCats, ctx.kind === 'home' ? 'all' : ctx.id),
      canon,
    };
    if (ctx.kind === 'category') {
      opts.seclabel = `${ctx.label}`;
      opts.title = `${ctx.label}${p > 1 ? ` (${p})` : ''} | GoCart Global — The world's finest luxury stays`;
    } else if (p > 1) {
      opts.title = `GoCart Global — page ${p} · The world's finest luxury stays`;
    }
    const html = applyShell(shell, opts);
    if (ctx.kind === 'home') {
      if (p === 1) fs.writeFileSync(path.join(ROOT, 'index.html'), html);
      else { const d = path.join(ROOT, 'page'); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, `${p}.html`), html); }
    } else {
      if (p === 1) { fs.mkdirSync(path.join(ROOT, 'category'), { recursive: true }); fs.writeFileSync(path.join(ROOT, 'category', `${ctx.id}.html`), html); }
      else { const d = path.join(ROOT, 'category', ctx.id); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, `${p}.html`), html); }
    }
  });
  return total;
}

function cleanDir(dir, re) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach(f => {
    const full = path.join(dir, f);
    if (re.test(f)) { try { fs.unlinkSync(full); } catch (e) {} }
    else if (fs.statSync(full).isDirectory()) { cleanDir(full, re); }
  });
}

function regenAll(metas) {
  const shell = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

  // 활성 카테고리(글 1개 이상)
  const byCat = {};
  metas.forEach(m => { (byCat[m.theme] = byCat[m.theme] || []).push(m); });
  const activeCats = CATS.filter(c => (byCat[c.id] || []).length);

  // 이전 빌드 잔여물 정리(sandbox에선 unlink 실패해도 무시)
  cleanDir(path.join(ROOT, 'page'), /^\d+\.html$/);
  cleanDir(path.join(ROOT, 'category'), /\.html$/);

  // 홈(전체 최신 피드)
  const homePages = writePages(shell, { kind: 'home', base: '/', metas }, activeCats);

  // 카테고리별
  const catPageInfo = [];
  activeCats.forEach(c => {
    const total = writePages(shell, { kind: 'category', id: c.id, label: `${c.emoji} ${c.label}`, base: `/category/${c.id}`, metas: byCat[c.id] }, activeCats);
    catPageInfo.push({ id: c.id, total });
  });

  return { homePages, activeCats, catPageInfo };
}

function regenSearchIndex(metas) {
  const data = metas.map(m => ({
    slug: m.slug, title: m.title, audience: m.audience, emoji: m.emoji,
    city: m.city, season: m.season, month: m.travelMonthLabel, img: m.heroImg, description: m.description || '',
  }));
  fs.writeFileSync(path.join(ROOT, 'articles.json'), JSON.stringify(data));
}

function regenSitemap(metas, info) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: BASE + '/', pri: '1.0', cf: 'daily' },
    { loc: BASE + '/pages/about.html', pri: '0.5', cf: 'monthly' },
    { loc: BASE + '/pages/contact.html', pri: '0.3', cf: 'yearly' },
    { loc: BASE + '/pages/privacy.html', pri: '0.3', cf: 'yearly' },
    { loc: BASE + '/pages/methodology.html', pri: '0.6', cf: 'monthly' },
    { loc: BASE + '/pages/editorial-policy.html', pri: '0.5', cf: 'monthly' },
    { loc: BASE + '/pages/price-observatory.html', pri: '0.7', cf: 'daily' },
  ];
  for (let p = 2; p <= (info.homePages || 1); p++) urls.push({ loc: `${BASE}/page/${p}`, pri: '0.5', cf: 'daily' });
  info.catPageInfo.forEach(c => {
    urls.push({ loc: `${BASE}/category/${c.id}`, pri: '0.7', cf: 'daily' });
    for (let p = 2; p <= c.total; p++) urls.push({ loc: `${BASE}/category/${c.id}/${p}`, pri: '0.4', cf: 'weekly' });
  });
  // 국내 특별기획(domestic)은 우선순위 상향(트래픽 핵심)
  metas.filter(m => m.theme === 'domestic' || m.indexable !== false).forEach(m => urls.push({ loc: `${BASE}/articles/${m.slug}`, pri: m.theme === 'domestic' ? '0.9' : '0.8', cf: 'monthly', last: m.updated }));
  const body = urls.map(u =>
    `  <url><loc>${u.loc}</loc><lastmod>${String(u.last || today).slice(0, 10)}</lastmod><changefreq>${u.cf}</changefreq><priority>${u.pri}</priority></url>`).join('\n');
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`);
}

function rebuildAll() {
  if (fs.existsSync(ART)) fs.readdirSync(ART).filter(f => f.endsWith('.json')).forEach(f => buildOne(f.replace(/\.json$/, '')));
  if (fs.existsSync(SPECIALS)) fs.readdirSync(SPECIALS).filter(f => f.endsWith('.json') && !f.endsWith('.hotels.json')).forEach(f => buildSpecial(f.replace(/\.json$/, '')));
  // 특별 기획(국내)은 홈 상단에 고정 노출(최신순), 그 아래 자동 큐레이션(최신순)
  const specials = specialMetas().sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
  const metas = [...specials, ...articleMetas()];
  const info = regenAll(metas);
  regenSearchIndex(metas);
  regenSitemap(metas, info);
  console.log(`✓ rebuildAll: ${metas.length}개 글 · 홈 ${info.homePages}p · 카테고리 ${info.activeCats.length}개 · articles.json/sitemap 갱신`);
  return metas;
}

if (require.main === module) rebuildAll();
module.exports = { rebuildAll, articleMetas };
