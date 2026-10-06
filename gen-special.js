#!/usr/bin/env node
/**
 * GoCart Global 특별기획(Destination Guides) 숙소 수집
 *  data/specials/<slug>.json 의 cities[] 마다 아고다에서 5성급 럭셔리 호텔을 수집해
 *  <slug>.hotels.json(사이드카)로 저장 — 빌드 시 글에 실시간 호텔 목록으로 붙는다.
 *  - 안전장치: 반환 지명이 cityNameMatch(정규식)와 맞을 때만 저장(엉뚱한 도시 방지)
 *  - luxury: { minStar, minScore, minReviews, minPriceUSD, excludeName, pages, perCity }
 *    → 성급·평점·리뷰·확인된 가격·이름 필터 후 가격 높은 순(정식 호텔만, 개인 렌탈·시크릿딜 제외)
 *  node gen-special.js [slug]
 */
const fs = require('fs');
const path = require('path');
const af = require('./lib/agoda-fetch');
const md = require('./lib/morestaz-data');

const ROOT = __dirname;
const DIR = path.join(ROOT, 'data/specials');
const MAX = 40;

const isSecretDeal = h => /^\d(\.\d)?-star\b/i.test(h.name) || /\bin the .+ neighborhood\b/i.test(h.name);

function toCard(h, i, label) {
  return {
    rank: i + 1,
    name: h.name,
    agodaUrl: h.agodaUrl,
    img: h.img ? 'https:' + h.img.replace(/^https?:/, '') : '',
    score: h.score,
    reviewCountFmt: Number(h.reviewCount || 0).toLocaleString('en-US') + ' reviews',
    priceUSD: h.priceUSD || null,
    priceText: h.priceUSD ? `from $${Number(h.priceUSD).toLocaleString('en-US')}/night` : '',
    star: h.star || null,
    badge: [h.star ? `${h.star}-star` : '', label || ''].filter(Boolean).join(' · '),
    refLabel: h.refLandmark || '',
    walkMin: h.walkMin || null,
  };
}

function luxuryFilter(lux) {
  const ex = lux.excludeName ? new RegExp(lux.excludeName, 'i') : null;
  return h => (h.star || 0) >= (lux.minStar || 5)
    && h.score >= (lux.minScore || 8.5)
    && (h.reviewCount || 0) >= (lux.minReviews || 100)
    && h.priceUSD && h.priceUSD >= (lux.minPriceUSD || 250)
    && h.propertyType === 'Hotel' && !h.isHostListing && h.resultType === 'NormalProperty'
    && !isSecretDeal(h) && !/[^\u0000-ɏ -⁯\s]/.test(h.name)
    && !(ex && ex.test(h.name));
}

async function collectCity(c, lux) {
  const pages = lux.pages || 3;
  let cityName = '';
  const seen = new Set(), props = [];
  for (let page = 1; page <= pages; page++) {
    try {
      const cs = await af.fetchCitySearch(Number(c.cityId), { page, daysAhead: 45 });
      if (page === 1) cityName = cs?.searchResult?.searchInfo?.objectInfo?.cityName || '';
      (cs.properties || []).map(p => md.mapPropertyRich(p)).forEach(h => {
        if (seen.has(h.propertyId)) return;
        seen.add(h.propertyId); props.push(h);
      });
    } catch (e) { if (page === 1) throw e; }
  }
  const re = c.cityNameMatch ? new RegExp(c.cityNameMatch, 'i') : null;
  if (re && !re.test(cityName)) throw new Error(`반환 지명 "${cityName}"가 "${c.cityNameMatch}"와 불일치 → 저장 안 함(안전)`);
  const hotels = props.filter(h => h.name && h.agodaUrl && h.score != null).filter(luxuryFilter(lux))
    .sort((a, b) => (b.priceUSD - a.priceUSD) || (b.score - a.score))
    .slice(0, lux.perCity || 8);
  return { cityName, hotels };
}

async function genOne(file) {
  const d = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
  const cities = d.cities || (d.cityId ? [{ cityId: d.cityId, cityNameMatch: d.cityNameMatch }] : []);
  if (!cities.length) { console.log(`- ${file}: cityId 없음, 건너뜀`); return; }
  const lux = d.luxury || {};
  const side = path.join(DIR, file.replace(/\.json$/, '.hotels.json'));
  if (!process.env.FORCE && fs.existsSync(side)) {
    try { const prev = JSON.parse(fs.readFileSync(side, 'utf8')); if (Date.now() - Date.parse(prev.fetchedAt || 0) < 20 * 3600000) { console.log(`- ${file}: 최근 갱신(20시간 이내) — 건너뜀`); return; } } catch (_) {}
  }
  const names = [];
  let cards = [];
  for (const c of cities) {
    const { cityName, hotels } = await collectCity(c, lux);
    names.push(c.label || cityName);
    cards = cards.concat(hotels.map(h => ({ h, label: cities.length > 1 ? (c.label || cityName) : '' })));
    console.log(`  · ${cityName}: ${hotels.length}곳`);
  }
  const hotels = cards.slice(0, MAX).map(({ h, label }, i) => toCard(h, i, label));
  if (!hotels.length) { console.warn(`✗ ${file}: 조건에 맞는 숙소 0곳 → 기존 사이드카 유지`); return; }
  const outFile = file.replace(/\.json$/, '.hotels.json');
  fs.writeFileSync(path.join(DIR, outFile), JSON.stringify({
    cityName: names.join(' · '), count: hotels.length, updated: new Date().toISOString().slice(0, 10),
    fetchedAt: new Date().toISOString(), basis: 'USD per room/night incl. taxes & fees · 2 adults · 1 night · check-in ~45 days out', hotels,
  }, null, 2));
  console.log(`✓ ${outFile}: ${names.join(' · ')} 숙소 ${hotels.length}곳 저장`);
}

(async () => {
  if (!fs.existsSync(DIR)) return;
  const only = process.argv[2];
  const files = fs.readdirSync(DIR).filter(f => f.endsWith('.json') && !f.endsWith('.hotels.json'))
    .filter(f => !only || f === only || f === only + '.json');
  for (const f of files) {
    try { await genOne(f); }
    catch (e) { console.error(`✗ ${f}: ${String(e.message).slice(0, 160)}`); }
  }
})();
