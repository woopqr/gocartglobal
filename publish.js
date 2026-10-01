#!/usr/bin/env node
/**
 * morestayz 발행 — 하루 1회 묶음 배포(빌드 절약: 1 push = 1 build)
 *  1) auto-fetch.refill 로 신규 글 BATCH개 생성
 *  2) build-all.rebuildAll 로 전체 재빌드 + index/sitemap 갱신
 *  GitHub Actions가 변경분을 1커밋으로 push → Cloudflare 빌드 1회
 *
 *  env: BATCH(기본 3) — 하루 발행 수
 */
const { execSync } = require('child_process');
const { refill } = require('./auto-fetch');
const { rebuildAll } = require('./build-all');

const parsedBatch = Number(process.env.BATCH);
const BATCH = Number.isFinite(parsedBatch) ? Math.max(0, parsedBatch) : 0;

(async function main() {
  const made = refill({ count: BATCH });
  try { await require('./observe-prices').observe(); }
  catch (e) { console.error('가격 관찰 실패(기존 데이터 유지): ' + String(e.message).slice(0, 160)); }
  // 특별기획(국내) 숙소 실시간 수집 — cityId 있는 특별글만, 실패해도 계속
  try { execSync('node gen-special.js', { cwd: __dirname, stdio: 'inherit', timeout: 180000 }); }
  catch (e) { console.error('특별기획 수집 실패(건너뜀): ' + String(e.message).slice(0, 120)); }
  const metas = rebuildAll();
  console.log(`✓ publish 완료: 신규 ${made}개 · 전체 ${metas.length}개`);
})().catch(e => { console.error(e); process.exit(1); });
