#!/usr/bin/env node
/** 하루 한 도시의 숙소 가격을 동일 조건으로 관찰해 무료 JSON 이력을 축적한다. */
const fs = require('fs');
const path = require('path');
const af = require('./lib/agoda-fetch');

const ROOT = __dirname;
const ART = path.join(ROOT, 'data/articles');
const OUT = path.join(ROOT, 'data/observatory.json');
const DAYS_AHEAD = Number(process.env.OBSERVE_DAYS_AHEAD) || 30;
const MAX_DAYS = 90;
const norm = s => String(s || '').toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^a-z0-9가-힣]/g, '');
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function loadArticles() {
  return fs.readdirSync(ART).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(ART, f), 'utf8')));
}
function loadStore() {
  if (!fs.existsSync(OUT)) return { version: 1, cursor: 0, observations: [] };
  try { return JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (_) { return { version: 1, cursor: 0, observations: [] }; }
}
function render(store) {
  const latest = new Map();
  for (const o of store.observations) for (const h of o.hotels) latest.set(`${o.citySlug}:${h.key}`, { ...h, city: o.city, observedAt: o.observedAt });
  const rows = [...latest.values()].filter(h => h.priceKRW).sort((a, b) => a.city.localeCompare(b.city, 'ko') || a.priceKRW - b.priceKRW).slice(0, 200);
  const body = rows.map(h => `<tr><td>${esc(h.city)}</td><td>${esc(h.name)}</td><td>${Number(h.priceKRW).toLocaleString('ko-KR')}원</td><td>${esc(h.observedAt.slice(0,10))}</td><td><a href="${esc(h.url)}" rel="sponsored nofollow noopener" target="_blank">현재가 확인</a></td></tr>`).join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Price Observatory | GoCart Global</title><meta name="description" content="Nightly price observations recorded under identical search conditions."><link rel="canonical" href="https://gocartglobal.com/pages/price-observatory.html"><link rel="stylesheet" href="/assets/css/article.css"></head><body><article class="post"><a class="backbar" href="/">← GoCart Global Home</a><h1>Price observatory</h1><p>A rotating daily record of nightly prices fetched under 1 adult · 1 room · 1 night · USD. These observations are not confirmed booking totals and can change with taxes, member rates and availability.</p><div class="databox"><strong>${store.observations.length} observations recorded</strong><p>When a price cannot be confirmed, we do not estimate it or substitute a prior value.</p></div><div style="overflow:auto"><table><thead><tr><th>City</th><th>Property</th><th>Observed price</th><th>Fetched</th><th>Source</th></tr></thead><tbody>${body}</tbody></table></div></article></body></html>`;
  fs.writeFileSync(path.join(ROOT, 'pages/price-observatory.html'), html);
}

async function observe() {
  const articles = loadArticles();
  const cityMap = new Map();
  for (const a of articles) if (!cityMap.has(a.citySlug)) cityMap.set(a.citySlug, { city: a.city, citySlug: a.citySlug, cityId: a.cityId, hotels: new Map() });
  for (const a of articles) for (const h of a.hotels || []) cityMap.get(a.citySlug)?.hotels.set(norm(h.name), h);
  const cities = [...cityMap.values()].filter(c => c.cityId);
  const store = loadStore();
  if (!cities.length) return 0;
  const city = cities[store.cursor % cities.length];
  const cs = await af.fetchCitySearch(Number(city.cityId), { daysAhead: DAYS_AHEAD });
  const found = (cs.properties || []).map(p => af.mapProperty(p));
  const hotels = [];
  for (const h of found) {
    const known = city.hotels.get(norm(h.name));
    if (!known) continue;
    hotels.push({ key: String(h.propertyId || norm(h.name)), name: h.name, priceKRW: h.priceKRW || null, priceStatus: h.priceKRW ? 'confirmed' : 'unavailable', url: h.agodaUrl });
  }
  store.observations.push({ city: city.city, citySlug: city.citySlug, cityId: city.cityId, observedAt: new Date().toISOString(), daysAhead: DAYS_AHEAD, condition: '1 adult, 1 room, 1 night, KRW', hotels });
  const cutoff = Date.now() - MAX_DAYS * 86400000;
  store.observations = store.observations.filter(o => Date.parse(o.observedAt) >= cutoff);
  store.cursor = (store.cursor + 1) % cities.length;
  fs.writeFileSync(OUT, JSON.stringify(store, null, 2));
  render(store);
  console.log(`✓ 가격 관찰: ${city.city} ${hotels.length}곳`);
  return hotels.length;
}

if (require.main === module) observe().catch(e => { console.error('✗ 가격 관찰 실패: ' + e.message); process.exit(1); });
module.exports = { observe, render };
