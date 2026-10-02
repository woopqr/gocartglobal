#!/usr/bin/env node
/**
 * 가격 최신화 — 기존 글을 최신 아고다 데이터로 다시 생성(가격·숙소 선정 모두 갱신)
 *  - fetchedAt이 MAX_AGE_H시간보다 오래된 글만 대상
 *  - 같은 도시·월 검색은 lib/agoda-fetch 캐시로 1회만 호출
 *  - 재생성 실패(5성급 기준 미달 등) 시 기존 글 유지하되 가격을 '확인 불가'로 내려 오래된 가격 노출 방지
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = __dirname;
const ART = path.join(ROOT, 'data/articles');
const CITIES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/cities.json'), 'utf8'));
const MAX_AGE_H = Number(process.env.PRICE_MAX_AGE_H) || 20;

function refreshPrices() {
  if (!fs.existsSync(ART)) return 0;
  let n = 0;
  for (const f of fs.readdirSync(ART).filter(f => f.endsWith('.json'))) {
    const file = path.join(ART, f);
    const a = JSON.parse(fs.readFileSync(file, 'utf8'));
    const age = (Date.now() - Date.parse(a._meta?.fetchedAt || 0)) / 3600000;
    if (age < MAX_AGE_H) continue;
    const city = CITIES.find(c => c.slug === a.citySlug);
    const ym = a._meta?.targetMonth;
    try {
      execSync(`node gen.js ${a.theme} ${city.cityId} ${city.slug} ${ym}`, { cwd: ROOT, stdio: 'pipe', timeout: 240000 });
      n++;
    } catch (e) {
      console.error(`  ↳ 갱신 실패: ${a.slug} — 가격 표시 중단`);
      for (const h of a.hotels || []) {
        h.priceUSD = null; h.priceStatus = 'price unavailable';
        h.priceText = String(h.priceText || '').replace(/\$[\d,]+\/night/, 'price unavailable');
        h.blurb = String(h.blurb || '').replace(/\$[\d,]+\/night/g, 'check live price');
        h.metaTags = (h.metaTags || []).filter(t => !/^💰/.test(t));
      }
      a.verdict = String(a.verdict || '').replace(/, from \$[\d,]+\/night/, '');
      fs.writeFileSync(file, JSON.stringify(a, null, 2));
    }
  }
  console.log(`✓ 가격 최신화: ${n}개 글 갱신`);
  return n;
}

if (require.main === module) refreshPrices();
module.exports = { refreshPrices };
