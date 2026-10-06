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

// 생성 우선순위: 가까운 달 → 라운드로빈(지역·도시·테마가 연속으로 겹치지 않게 교차)
//  - 도시별 허용 테마(cities.json themes)만 생성
function interleaveByRegion(cities) {
  const groups = {};
  cities.forEach(c => (groups[c.region || 'other'] = groups[c.region || 'other'] || []).push(c));
  const lists = Object.values(groups), out = [];
  for (let i = 0; out.length < cities.length; i++) lists.forEach(l => { if (l[i]) out.push(l[i]); });
  return out;
}
function combos() {
  const out = [];
  const themeIds = new Set(THEMES.themes.map(t => t.id));
  for (const tm of targetMonths()) {
    // 계절 감각: 그 달이 베스트 시즌인 여행지를 먼저(선행 소개), 나머지는 뒤로
    const inSeason = c => (c.bestMonths || []).includes(tm.m);
    const order = [...interleaveByRegion(CITIES.filter(inSeason)), ...interleaveByRegion(CITIES.filter(c => !inSeason(c)))];
    const maxThemes = Math.max(...order.map(c => (c.themes || []).length));
    for (let r = 0; r < maxThemes; r++)
      order.forEach((c, i) => {
        const ts = (c.themes || [...themeIds]).filter(t => themeIds.has(t));
        if (r >= ts.length) return;
        const t = ts[(i + r) % ts.length];
        out.push({ theme: t, city: c, ym: `${tm.y}-${pad(tm.m)}`, slug: `${t}-${c.slug}-${tm.y}-${pad(tm.m)}` });
      });
  }
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
