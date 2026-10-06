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
const readJson = (rel, fb) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); } catch (_) { return fb; } };
const CITIES = readJson('data/cities.json', []);
const REGIONS = readJson('data/regions.json', []);
const GUIDES = readJson('data/destinations.json', {});
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cityOf = slug => CITIES.find(c => c.slug === slug) || null;
const regionLabel = id => (REGIONS.find(r => r.id === id) || {}).label || id;
const BASE = `https://${SITE.domain}`;

// 카테고리 정의(테마 순서 = 노출 순서). 실제 글이 있는 카테고리만 노출.
// '국내 특별 여행지'(domestic)는 자동 테마가 아닌 에디토리얼 기획 카테고리로 맨 앞에 노출.
const SPECIALS = path.join(ROOT, 'data/specials');
const CATS = [{ id: 'destinations', label: 'Destination Guides', emoji: '🧭' }, ...THEMES.themes.map(t => ({ id: t.id, label: t.audience, emoji: t.emoji }))];

// 특별기획 글은 이미지가 없으므로 지역명 타이포 카드(SVG data-URI)를 썸네일로 사용
function specialCardImg(region) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6f8f67"/><stop offset="1" stop-color="#365a78"/></linearGradient></defs><rect width="600" height="400" fill="url(#g)"/><text x="50%" y="45%" fill="#ffffff" font-family="sans-serif" font-size="66" font-weight="800" text-anchor="middle">${region}</text><text x="50%" y="61%" fill="rgba(255,255,255,0.9)" font-family="sans-serif" font-size="20" font-weight="700" letter-spacing="5" text-anchor="middle">FEATURED</text></svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}
function specialMetas() {
  if (!fs.existsSync(SPECIALS)) return [];
  return fs.readdirSync(SPECIALS).filter(f => f.endsWith('.json') && !f.endsWith('.hotels.json')).map(f => {
    const d = JSON.parse(fs.readFileSync(path.join(SPECIALS, f), 'utf8'));
    const side = readJson('data/specials/' + f.replace(/\.json$/, '.hotels.json'), null);
    const img = (side?.hotels || []).find(h => h.img)?.img;
    return {
      slug: d.slug, theme: d.category || 'destinations', title: d.title, description: d.metaDescription || '',
      audience: d.categoryLabel || 'Destination Guides', emoji: d.emoji || '🧭',
      city: d.region || '', region: d.regionId || '', citySlugs: d.citySlugs || [], special: true,
      season: 'Featured', travelMonthLabel: 'Destination guide',
      heroImg: img || specialCardImg(d.region || d.slug), updated: d.updated || '', indexable: true,
      nHotels: (side?.hotels || []).length, nCities: (d.cities || []).length,
    };
  });
}

function articleMetas() {
  if (!fs.existsSync(ART)) return [];
  return fs.readdirSync(ART).filter(f => f.endsWith('.json')).map(f => {
    const d = JSON.parse(fs.readFileSync(path.join(ART, f), 'utf8'));
    return {
      slug: d.slug, theme: d.theme, title: editorialTitle(d), description: editorialDescription(d), audience: d.audience, emoji: d.emoji,
      city: d.city, citySlug: d.citySlug, region: d.region || cityOf(d.citySlug)?.region || '', citySlugs: [d.citySlug],
      season: d.season || '', travelMonthLabel: d.travelMonthLabel || '',
      heroImg: d.heroImg || '', updated: d.updated || (d._meta && d._meta.fetchedAt) || '', indexable: isCurrentOrFuture(d),
      fromUSD: Math.min(...(d.hotels || []).map(h => h.priceUSD).filter(Boolean)) || null,
      topScore: Math.max(...(d.hotels || []).map(h => Number(h.score) || 0)) || null, nHotels: (d.hotels || []).length,
    };
  }).sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
}

function cardHtml(m) {
  const data = m.special
    ? [m.nHotels ? `<span><b>${m.nHotels}</b> five-star stays</span>` : '', m.nCities > 1 ? `<span><b>${m.nCities}</b> destinations</span>` : '', '<span>Editor\'s guide</span>']
    : [m.fromUSD && isFinite(m.fromUSD) ? `<span>From <b>$${Number(m.fromUSD).toLocaleString('en-US')}</b></span>` : '', m.topScore ? `<span>Top <b>★ ${m.topScore}</b></span>` : '', m.nHotels ? `<span><b>${m.nHotels}</b> hotels</span>` : ''];
  return `      <a class="card" href="/articles/${m.slug}">
        <div class="cthumb"><img src="${m.heroImg}" alt="${String(m.title || '').replace(/"/g, '&quot;')}" loading="lazy"><span class="ctag">${m.audience}</span></div>
        <div class="cbody"><span class="cmeta">${[m.city, m.special ? 'Destination guide' : m.travelMonthLabel].filter(Boolean).join(' · ')}</span><h2>${m.title}</h2><div class="cdata">${data.filter(Boolean).join('')}</div></div>
      </a>`;
}

function regionTilesHtml(metas) {
  return REGIONS.map(r => {
    const n = new Set(metas.filter(m => m.region === r.id && !m.special).map(m => m.citySlug)).size;
    return n ? `<a href="/category/ultra/${r.id}"><b>${r.label}</b><small>${n} destination${n > 1 ? 's' : ''}</small></a>` : '';
  }).join('');
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
  activeCats.forEach(c => { html += chip(`/category/${c.id}`, c.label, currentId === c.id); });
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

function hubHeaderHtml(hub) {
  if (!hub) return '';
  const crumbs = hub.crumbs.map((c, i) => i === hub.crumbs.length - 1 ? `<span>${esc(c.name)}</span>` : `<a href="${c.url}">${esc(c.name)}</a>`).join(' <span>›</span> ');
  const chips = (hub.chips || []).map(c => `<a class="${c.on ? 'on' : ''}" href="${c.url}">${esc(c.label)}${c.count != null ? `<small>${c.count}</small>` : ''}</a>`).join('');
  return `<div class="hubhead"><nav class="crumb" aria-label="Breadcrumb">${crumbs}</nav><h1>${esc(hub.title || '')}</h1>${hub.intro ? `<p>${esc(hub.intro)}</p>` : ''}${chips ? `<div class="subchips">${chips}</div>` : ''}</div>`;
}

function writePages(shell, ctx, activeCats) {
  // ctx: { kind:'home'|'category', id, label, base, metas, hub? }
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
      opts.hubHtml = hubHeaderHtml(ctx.hub);
      opts.title = `${ctx.hub?.title || ctx.label}${p > 1 ? ` (page ${p})` : ''} | GoCart Global`;
      opts.description = ctx.hub?.description;
      opts.noindex = ctx.metas.length < 2 || p > 1;
    } else if (p > 1) {
      opts.title = `GoCart Global — page ${p} · The world's finest luxury stays`;
    }
    let html = applyShell(shell, opts);
    if (ctx.kind === 'category') html = html.replace(/<!--HERO_START-->[\s\S]*?<!--HERO_END-->/, '<!--HERO_START--><!--HERO_END-->').replace(/<!--REGIONS_START-->[\s\S]*?<!--REGIONS_END-->/, '<!--REGIONS_START--><!--REGIONS_END-->');
    else if (ctx.regionsHtml != null) html = html.replace(/<!--REGIONS_START-->[\s\S]*?<!--REGIONS_END-->/, `<!--REGIONS_START-->${ctx.regionsHtml}<!--REGIONS_END-->`);
    if (opts.hubHtml) html = html.replace('<div class="seclabel" id="seclabel">', opts.hubHtml + '<div class="seclabel" id="seclabel">');
    if (opts.description) html = html.replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(opts.description)}">`)
      .replace(/(<meta property="og:description" content=")[^"]*(">)/, `$1${esc(opts.description)}$2`);
    if (opts.title) html = html.replace(/(<meta property="og:title" content=")[^"]*(">)/, `$1${esc(opts.title)}$2`);
    if (opts.noindex) html = html.replace('<meta charset="UTF-8">', '<meta charset="UTF-8">\n<meta name="robots" content="noindex,follow">');
    if (ctx.kind === 'home') {
      if (p === 1) fs.writeFileSync(path.join(ROOT, 'index.html'), html);
      else { const d = path.join(ROOT, 'page'); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, `${p}.html`), html); }
    } else {
      const rel = ctx.base.replace(/^\//, '');
      const file = p === 1 ? path.join(ROOT, rel + '.html') : path.join(ROOT, rel, `${p}.html`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, html);
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
  const homePages = writePages(shell, { kind: 'home', base: '/', metas, regionsHtml: regionTilesHtml(metas) }, activeCats);

  // 카테고리 › 지역 › 도시 (허브 페이지)
  const catPageInfo = [];
  const hubs = [];
  const regionOrder = id => { const i = REGIONS.findIndex(r => r.id === id); return i < 0 ? 99 : i; };
  activeCats.forEach(c => {
    const list = byCat[c.id];
    const catLabel = c.label;
    const regionIds = [...new Set(list.map(m => m.region).filter(Boolean))].sort((a, b) => regionOrder(a) - regionOrder(b));
    const regionChips = cur => [{ label: 'All regions', url: `/category/${c.id}`, on: !cur }, ...regionIds.map(r => ({ label: regionLabel(r), url: `/category/${c.id}/${r}`, count: list.filter(m => m.region === r).length, on: cur === r }))];
    const catBase = `/category/${c.id}`;
    const total = writePages(shell, { kind: 'category', id: c.id, label: catLabel, base: catBase, metas: list, hub: {
      title: `${c.label} — Luxury Stays by Region`,
      description: `${c.label}: hand-picked five-star hotels, resorts and villas across ${regionIds.map(regionLabel).join(', ')} — ranked on live Agoda data.`,
      intro: `Browse ${c.label.toLowerCase()} picks by region, then by destination. Every list is limited to five-star properties with confirmed nightly prices.`,
      crumbs: [{ name: 'Home', url: '/' }, { name: c.label, url: catBase }], chips: regionChips(null) } }, activeCats);
    catPageInfo.push({ id: c.id, total });
    hubs.push({ url: catBase, total, count: list.length });

    regionIds.forEach(r => {
      const rList = list.filter(m => m.region === r);
      const citySlugs = [...new Set(rList.flatMap(m => m.citySlugs || []).filter(Boolean))].sort((a, b) => CITIES.findIndex(x => x.slug === a) - CITIES.findIndex(x => x.slug === b));
      const rBase = `${catBase}/${r}`;
      const cityChips = cur => [{ label: `All ${regionLabel(r)}`, url: rBase, on: !cur }, ...citySlugs.map(cs => ({ label: cityOf(cs)?.name || cs, url: `${rBase}/${cs}`, count: rList.filter(m => (m.citySlugs || []).includes(cs)).length, on: cur === cs }))];
      const rTotal = writePages(shell, { kind: 'category', id: c.id, label: `${catLabel} · ${regionLabel(r)}`, base: rBase, metas: rList, hub: {
        title: `${c.label} in ${regionLabel(r)} — Five-Star Stays`,
        description: `The finest ${c.label.toLowerCase()} stays in ${regionLabel(r)}: ${citySlugs.map(cs => cityOf(cs)?.name || cs).join(', ')}. Five-star only, ranked on live Agoda data.`,
        intro: `${regionLabel(r)} for ${c.label.toLowerCase()}: pick a destination below, or browse every ${regionLabel(r)} list.`,
        crumbs: [{ name: 'Home', url: '/' }, { name: c.label, url: catBase }, { name: regionLabel(r), url: rBase }], chips: cityChips(null) } }, activeCats);
      hubs.push({ url: rBase, total: rTotal, count: rList.length });

      citySlugs.forEach(cs => {
        const cList = rList.filter(m => (m.citySlugs || []).includes(cs));
        const cd = cityOf(cs), g = GUIDES[cs] || {};
        const cBase = `${rBase}/${cs}`;
        const cTotal = writePages(shell, { kind: 'category', id: c.id, label: `${catLabel} · ${cd?.name || cs}`, base: cBase, metas: cList, hub: {
          title: `${cd?.name || cs} ${c.label} — The Finest Five-Star Stays`,
          description: `${cd?.name || cs} ${c.label.toLowerCase()}: the best-reviewed five-star hotels, resorts and villas, with live Agoda prices and our destination notes.`,
          intro: (g.themes && g.themes[c.id]) || g.overview || '',
          crumbs: [{ name: 'Home', url: '/' }, { name: c.label, url: catBase }, { name: regionLabel(r), url: rBase }, { name: cd?.name || cs, url: cBase }], chips: cityChips(cs) } }, activeCats);
        hubs.push({ url: cBase, total: cTotal, count: cList.length });
      });
    });
  });

  return { homePages, activeCats, catPageInfo, hubs };
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
  (info.hubs || []).filter(h => h.count >= 2).forEach(h => urls.push({ loc: BASE + h.url, pri: h.url.split('/').length > 3 ? '0.6' : '0.7', cf: 'daily' }));
  // 국내 특별기획(domestic)은 우선순위 상향(트래픽 핵심)
  metas.filter(m => m.indexable !== false).forEach(m => urls.push({ loc: `${BASE}/articles/${m.slug}`, pri: m.special ? '0.9' : '0.8', cf: m.special ? 'weekly' : 'monthly', last: m.updated }));
  const body = urls.map(u =>
    `  <url><loc>${u.loc}</loc><lastmod>${String(u.last || today).slice(0, 10)}</lastmod><changefreq>${u.cf}</changefreq><priority>${u.pri}</priority></url>`).join('\n');
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`);
}

function regenLlms(metas) {
  const lines = [`# ${SITE.name}`, '', `> ${SITE.description}`, '',
    'GoCart Global publishes data-backed guides to five-star hotels, resorts and private villas worldwide. Every hotel list comes from live Agoda search data (five-star only, confirmed nightly price incl. taxes, 30+ reviews) and is refreshed regularly; prices are indicative at the time of the last check.', '',
    '## Destination guides'];
  metas.filter(m => m.special).forEach(m => lines.push(`- [${m.title}](${BASE}/articles/${m.slug}): ${m.description || ''}`));
  lines.push('', '## Collections');
  CATS.forEach(c => lines.push(`- [${c.label}](${BASE}/category/${c.id})`));
  lines.push('', '## Latest luxury picks');
  metas.filter(m => !m.special && m.indexable !== false).slice(0, 60).forEach(m => lines.push(`- [${m.title}](${BASE}/articles/${m.slug})`));
  lines.push('', '## About', `- [About](${BASE}/pages/about.html)`, `- [Methodology](${BASE}/pages/methodology.html)`, `- [Editorial policy](${BASE}/pages/editorial-policy.html)`, '');
  fs.writeFileSync(path.join(ROOT, 'llms.txt'), lines.join('\n'));
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
  regenLlms(metas);
  console.log(`✓ rebuildAll: ${metas.length}개 글 · 홈 ${info.homePages}p · 카테고리 ${info.activeCats.length}개 · articles.json/sitemap 갱신`);
  return metas;
}

if (require.main === module) rebuildAll();
module.exports = { rebuildAll, articleMetas };
