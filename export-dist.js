#!/usr/bin/env node
/**
 * 배포 출력(dist/) 생성 — 공개할 파일만 화이트리스트로 복사
 *  소스(.js 스크립트·lib·data·templates·.github 등)가 사이트에서 다운로드되지 않도록
 *  Cloudflare Pages 설정: Build command = node export-dist.js / Build output directory = dist
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'dist');

// 공개 대상: 빌드된 HTML·정적 자산·크롤러용 파일만
const FILES = ['index.html', '404.html', 'favicon.svg', 'ads.txt', 'robots.txt', 'sitemap.xml', 'articles.json', '_headers', '_redirects'];
const DIRS = ['articles', 'category', 'page', 'pages', 'assets'];
const PATTERNS = [/^naver[0-9a-f]+\.html$/, /^google[0-9a-f]+\.html$/]; // 검색엔진 소유 확인 파일

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let n = 0;
const copy = (rel) => {
  const src = path.join(ROOT, rel);
  if (!fs.existsSync(src)) return;
  fs.cpSync(src, path.join(OUT, rel), {
    recursive: true,
    filter: s => !/(^|\/)\.[^/]+$/.test(s) || s === src, // .gitkeep 등 숨김 파일 제외
  });
  n++;
};

for (const f of FILES) copy(f);
for (const d of DIRS) copy(d);
for (const f of fs.readdirSync(ROOT)) if (PATTERNS.some(re => re.test(f))) copy(f);

console.log(`✓ dist/ 생성: ${n}개 항목`);
