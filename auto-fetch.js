#!/usr/bin/env node
/**
 * morestayz 자동 생성 — 다가오는 달 × 테마 × 도시 조합에서 아직 안 만든 글을 생성
 *  refill({ count }) : 신규 글 최대 count개 생성(슬러그 존재 시 건너뜀)
 *  슬러그 = <theme>-<citySlug>-<YYYY>-<MM>  → 파일 존재 여부가 곧 상태(별도 큐 불필요)
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = __dirname;
const THEMES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/themes.json'), 'utf8'));
const CITIES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/cities.json'), 'utf8'));
const ART = path.join(ROOT, 'data/articles');
const pad = n => String(n).padStart(2, '0');

function targetMonths() {
  const ahead = THEMES.calendar.monthsAhead || [1, 2];
  return ahead.map(a => { const d = new Date(); d.setMonth(d.getMonth() + a); return { y: d.getFullYear(), m: d.getMonth() + 1 }; });
}

// 생성 우선순위: 가까운 달 → 도시 → 테마(도시별로 테마를 번갈아 → 카테고리 다양성 확보)
function combos() {
  const out = [];
  for (const tm of targetMonths())
    for (const c of CITIES)
      for (const t of THEMES.themes)
        out.push({ theme: t.id, city: c, ym: `${tm.y}-${pad(tm.m)}`, slug: `${t.id}-${c.slug}-${tm.y}-${pad(tm.m)}` });
  return out;
}

function refill({ count = 3 } = {}) {
  if (count <= 0) { console.log('✓ refill: 신규 발행 없음(가격 관찰 모드)'); return 0; }
  if (!fs.existsSync(ART)) fs.mkdirSync(ART, { recursive: true });
  let made = 0;
  for (const k of combos()) {
    if (made >= count) break;
    if (fs.existsSync(path.join(ART, k.slug + '.json'))) continue;
    try {
      console.log(`▶ 생성: ${k.slug}`);
      execSync(`node gen.js ${k.theme} ${k.city.cityId} ${k.city.slug} ${k.ym}`, { cwd: ROOT, stdio: 'inherit', timeout: 120000 });
      if (fs.existsSync(path.join(ART, k.slug + '.json'))) made++;
    } catch (e) {
      console.error(`  ↳ 실패(건너뜀): ${k.slug} — ${String(e.message).slice(0, 120)}`);
    }
  }
  console.log(`✓ refill: 신규 ${made}개`);
  return made;
}

if (require.main === module) {
  const n = Number(process.argv[2]) || 3;
  refill({ count: n });
}
module.exports = { refill, combos, targetMonths };
