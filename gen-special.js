#!/usr/bin/env node
/**
 * morestayz 특별기획 숙소 수집 — data/specials/<slug>.json 에 cityId가 있으면
 * 아고다에서 해당 지역 숙소를 수집해 <slug>.hotels.json(사이드카)로 저장.
 *  - 안전장치: 반환된 지명이 cityNameMatch(정규식)와 맞을 때만 저장(엉뚱한 도시 방지)
 *  - GitHub Actions에서 실행(샌드박스는 아고다 접속 불가)
 *  node gen-special.js            # 전체 특별글
 */
const fs = require('fs');
const path = require('path');
const af = require('./lib/agoda-fetch');
const md = require('./lib/morestaz-data');
const agoda = require('./lib/agoda');

const ROOT = __dirname;
const DIR = path.join(ROOT, 'data/specials');
const MAX = 40;

async function genOne(file) {
  const d = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
  if (!d.cityId) { console.log(`- ${file}: cityId 없음, 건너뜀`); return; }
  const cs = await af.fetchCitySearch(Number(d.cityId), { daysAhead: 30 });
  const cityName = cs?.searchResult?.searchInfo?.objectInfo?.cityName || '';
  const re = d.cityNameMatch ? new RegExp(d.cityNameMatch, 'i') : null;
  if (re && !re.test(cityName)) {
    console.warn(`✗ ${file}: 반환 지명 "${cityName}"가 "${d.cityNameMatch}"와 불일치 → 저장 안 함(안전)`);
    return;
  }
  const props = (cs.properties || []).map(p => md.mapPropertyRich(p));
  const eligible = props.filter(h => h.name && h.agodaUrl && h.score != null);
  const hotels = eligible.slice(0, MAX).map((h, i) => ({
    rank: i + 1,
    name: h.name,
    agodaUrl: h.agodaUrl,
    img: h.img ? 'https:' + h.img.replace(/^https?:/, '') : '',
    score: h.score,
    reviewCountFmt: Number(h.reviewCount || 0).toLocaleString('en-US') + '건',
    priceText: h.priceText || '',
    star: h.star || null,
    refLabel: h.refLandmark || '',
    walkMin: h.walkMin || null,
  }));
  const outFile = file.replace(/\.json$/, '.hotels.json');
  fs.writeFileSync(path.join(DIR, outFile), JSON.stringify({ cityName, count: hotels.length, updated: new Date().toISOString().slice(0, 10), hotels }, null, 2));
  console.log(`✓ ${outFile}: ${cityName} 숙소 ${hotels.length}곳 저장`);
}

(async () => {
  if (!fs.existsSync(DIR)) return;
  const files = fs.readdirSync(DIR).filter(f => f.endsWith('.json') && !f.endsWith('.hotels.json'));
  for (const f of files) {
    try { await genOne(f); }
    catch (e) { console.error(`✗ ${f}: ${String(e.message).slice(0, 120)}`); }
  }
})();
