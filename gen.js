#!/usr/bin/env node
/**
 * morestayz 글 생성기 — 테마(오디언스×시즌) × 도시
 *   node gen.js <themeId> <cityId> <citySlug> [yyyy-mm] [N]
 *   예) node gen.js couple 9590 osaka-namba 2026-08 6
 *
 *  - 선행발행: yyyy-mm(여행 시점) 미지정 시 '현재월+1'을 타깃 → 그 시점 가격으로 수집
 *  - 선별: 테마 preferType(커플/가족/혼행/친구) 적합도 + 가성비
 *  - 시각화 데이터: 여행자 유형 분포·유형별 평점(실데이터)
 * 결과: data/articles/<slug>.json  →  node build.js <slug>
 */
const fs = require('fs');
const path = require('path');
const af = require('./lib/agoda-fetch');
const md = require('./lib/morestaz-data');
const agoda = require('./lib/agoda');
const { qualityForHotel, validateArticle } = require('./lib/content-quality');

const ROOT = __dirname;
const THEMES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/themes.json'), 'utf8'));
const CITIES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/cities.json'), 'utf8'));
const REGIONS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/regions.json'), 'utf8'));
const MIN_REVIEWS = 30;
// 럭셔리 기준(절대 완화하지 않음): 5성급 + 세금 포함 1박 하한가 + 가격 확인된 숙소만
const MIN_STAR = 5;
const MIN_PRICE_USD = Number(process.env.MIN_PRICE_USD) || 250;
const PAGES = Number(process.env.PAGES) || 5;

const [themeId, cityId, citySlug, ymArg, nArg] = process.argv.slice(2);
const N = Number(nArg) || 6;
if (!themeId || !cityId || !citySlug) {
  console.error('사용법: node gen.js <themeId> <cityId> <citySlug> [yyyy-mm] [N]');
  process.exit(1);
}
const theme = THEMES.themes.find(t => t.id === themeId);
if (!theme) { console.error('알 수 없는 테마: ' + themeId + ' (가능: ' + THEMES.themes.map(t => t.id).join(', ') + ')'); process.exit(1); }

const pad = n => String(n).padStart(2, '0');

// 타깃 여행월
function targetMonth(ym) {
  if (ym && /^\d{4}-\d{2}$/.test(ym)) { const [y, m] = ym.split('-').map(Number); return { y, m }; }
  const d = new Date(); d.setMonth(d.getMonth() + 1);
  return { y: d.getFullYear(), m: d.getMonth() + 1 };
}
function daysUntilMid(y, m) {
  const mid = new Date(Date.UTC(y, m - 1, 15, 12));
  const diff = Math.ceil((mid - Date.now()) / 86400000);
  return Math.max(14, Math.min(330, diff)); // 아고다 가격 조회 가능 범위 내
}
function seasonFor(m) {
  const matches = THEMES.seasons.filter(s => s.months.includes(m));
  if (!matches.length) return null;
  matches.sort((a, b) => a.months.length - b.months.length); // 더 구체적인(연휴 등) 우선
  return matches[0];
}
function pick(arr, i) { return arr[((i % arr.length) + arr.length) % arr.length]; }
const shortName = s => String(s).split('(')[0].trim();

(async () => {
  const tm = targetMonth(ymArg);
  const daysAhead = daysUntilMid(tm.y, tm.m);
  const season = seasonFor(tm.m);
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const travelMonthLabel = `${MONTHS[tm.m - 1]} ${tm.y}`;
  console.log(`▶ ${theme.audience} · ${citySlug} · 여행시점 ${travelMonthLabel}(D+${daysAhead}) · top ${N}`);

  // 5성급만·가격 높은 순으로 PAGES페이지 수집
  const cs = await af.fetchCitySearch(Number(cityId), { daysAhead });
  const q = cs._query;
  const rawProps = [...(cs.properties || [])];
  for (let pg = 2; pg <= PAGES; pg++) {
    try { rawProps.push(...((await af.fetchCitySearch(Number(cityId), { daysAhead, page: pg })).properties || [])); }
    catch (e) { console.warn(`  (page ${pg} 실패 — 1페이지만 사용)`); }
  }
  const rawCityName = cs?.searchResult?.searchInfo?.objectInfo?.cityName || '';
  const cityDef = CITIES.find(c => c.slug === citySlug);
  const city = cityDef?.name || rawCityName.split('/')[0].trim() || citySlug;

  const seenIds = new Set();
  const props = rawProps.map(p => md.mapPropertyRich(p)).filter(h => !seenIds.has(h.propertyId) && seenIds.add(h.propertyId));
  // 시크릿 딜(호텔명 비공개)·비라틴 이름(개인 빌라 등) 제외
  const isSecretDeal = h => /^\d(\.\d)?-star\b/i.test(h.name) || /\bin the .+ neighborhood\b/i.test(h.name);
  const eligible = props.filter(h => h.name && h.score != null && h.agodaUrl && h.reviewCount >= MIN_REVIEWS
    && (h.star || 0) >= MIN_STAR && h.priceUSD && h.priceUSD >= MIN_PRICE_USD
    && h.propertyType === 'Hotel' && !h.isHostListing && h.resultType === 'NormalProperty' // 정식 호텔·리조트만(개인 렌탈·매진·시크릿딜 제외)
    && !isSecretDeal(h) && !/[^\u0000-\u024F\u2000-\u206F\s]/.test(h.name));
  if (eligible.length < 3) throw new Error(`5성급·$${MIN_PRICE_USD}+ 숙소 부족(${eligible.length}곳) — 건너뜀`);

  // 어메니티 필터: 테마가 특정 시설을 요구하면 실제 보유 숙소만 선정(부정확한 글 방지)
  function featureMatch(h, req) {
    if (req === 'pool') return !!h.hasKidsPool;
    if (req === 'pet') return (h.featureTitles || []).some(t => /pet|반려|애견|강아지|dog|animal/i.test(String(t)));
    return true;
  }
  let candidates = eligible;
  if (theme.requireFeature) {
    const matched = eligible.filter(h => featureMatch(h, theme.requireFeature));
    if (matched.length < 3) throw new Error(`'${theme.requireFeature}' 보유 숙소 부족(${matched.length}곳) — 건너뜀`);
    candidates = matched;
  }

  // ★ 럭셔리 선정: 최고가 우선 + 리뷰 많은순 + 5성 + 리조트/풀빌라 우선
  const isLux = h => /resort|villa|pool ?villa|리조트|빌라|풀빌라|스위트|suite/i.test(
    `${h.accommodationType || ''} ${h.propertyType || ''} ${h.name || ''}`);
  const text = h => `${h.name || ''} ${(h.featureTitles || []).join(' ')}`;
  // 테마별 가중치 — 같은 도시라도 카테고리마다 다른 숙소가 상위에 오도록(중복 콘텐츠 방지)
  const THEME_BIAS = {
    honeymoon: h => (/villa|pool/i.test(text(h)) ? 450000 : 0) + (isLux(h) ? 200000 : 0) + md.affinityFor('couple', h.travelerTypes) * 6000,
    anniversary: h => Math.log10((h.reviewCount || 0) + 1) * 260000 + (h.score || 0) * 30000,
    wellness: h => (/spa|wellness|retreat|sanctuary|healing|onsen|thermal/i.test(text(h)) ? 700000 : 0) + (isLux(h) ? 150000 : 0),
    golf: h => (/golf|country club|links/i.test(text(h)) ? 900000 : 0) + md.affinityFor('friends', h.travelerTypes) * 4000,
    ultra: h => (h.priceUSD || 0) * 700,
  };
  // 같은 도시·같은 여행월의 다른 카테고리 글에 이미 실린 숙소는 강하게 감점
  const siblingUse = new Map();
  for (const f of fs.readdirSync(path.join(ROOT, 'data/articles')).filter(f => f.endsWith('.json'))) {
    try {
      const a = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/articles', f), 'utf8'));
      if (a.citySlug !== citySlug || a.theme === theme.id || a._meta?.targetMonth !== `${tm.y}-${pad(tm.m)}`) continue;
      for (const h of a.hotels || []) siblingUse.set(h.propertyId, (siblingUse.get(h.propertyId) || 0) + 1);
    } catch (_) {}
  }
  const score = h => {
    const price = (h.priceUSD || 0) * 1400;              // 최고가 우선(지배적)
    const revs = Math.log10((h.reviewCount || 0) + 1);   // 리뷰 많은순(1~5)
    const star = h.star || 0;
    const aff = md.affinityFor(theme.preferType, h.travelerTypes); // 테마 적합(부가)
    return price * 1.0
      + revs * 130000
      + star * 150000
      + (isLux(h) ? 250000 : 0)
      + (h.score || 0) * 15000
      + aff * 1500
      + (THEME_BIAS[theme.id] ? THEME_BIAS[theme.id](h) : 0)
      - (siblingUse.get(h.propertyId) || 0) * 3000000;
  };
  const picked = candidates.sort((a, b) => score(b) - score(a)).slice(0, N).map((h, i) => ({ ...h, rank: i + 1, isLux: isLux(h) }));

  // 영어 사이트: 리뷰 원문(영어) 유지 — 번역하지 않음

  // 집계 여행자 유형(이 글의 숙소 전체)
  const aggAcc = {};
  for (const h of picked) for (const d of (h.travelerTypes?.distribution || [])) {
    const a = aggAcc[d.key] || (aggAcc[d.key] = { key: d.key, label: d.label, count: 0 });
    a.count += d.count;
  }
  const aggArr = Object.values(aggAcc);
  const aggTotal = aggArr.reduce((n, g) => n + g.count, 0);
  const aggregate = aggTotal ? {
    total: aggTotal,
    distribution: aggArr.map(g => ({ ...g, pct: Math.round(g.count / aggTotal * 100) }))
      .sort((a, b) => b.count - a.count),
  } : null;

  // 제목/메타/본문
  const hook = pick(theme.hooks, Number(cityId) + tm.m);
  const title = theme.titlePattern.replace('{city}', city).replace('{hook}', hook);
  const top = picked[0];
  const topPrice = (top.priceText.split('·')[1] || '').trim();
  const themeShareTxt = aggregate
    ? (() => { const g = aggregate.distribution.find(d => d.key === theme.preferType); return g ? `About ${g.pct}% of the review sample for these stays comes from ${String(g.label).toLowerCase()} travelers. ` : ''; })()
    : '';
  const verdict = `${themeShareTxt}Our #1 pick is <b>${shortName(top.name)}</b> — rating ${top.score}, ${Number(top.reviewCount).toLocaleString('en-US')} reviews${topPrice ? `, from ${topPrice.trim()}` : ''}. ${theme.viewpoint}`;

  const hotels = picked.map(h => {
    const tt = h.travelerTypes;
    const tags = [];
    if (h.priceUSD) tags.push('💰 $' + Number(h.priceUSD).toLocaleString('en-US') + '/night');
    tags.push('📝 ' + Number(h.reviewCount).toLocaleString('en-US') + ' reviews');
    if (h.star) tags.push('⭐ ' + h.star + '-star');
    if (h.isLux) tags.push('🏝️ Resort / Villa');
    if (tt?.topLabel) tags.push('👥 Loved by ' + tt.topLabel);
    const refLabel = h.refLandmark || 'city center';
    const tg = tt ? tt.distribution.find(d => d.key === theme.preferType) : null;
    const typeTxt = tg ? `${tg.pct}% of sampled reviews from ${String(tg.label).toLowerCase()}` : '';
    const walkTxt = h.walkMin && h.walkMin <= 20 ? ` ${h.walkMin} min walk to ${refLabel}.` : '';
    const blurb = `Rating ${h.score} · ${Number(h.reviewCount).toLocaleString('en-US')} reviews.${walkTxt} ${h.priceText}.${typeTxt ? ' ' + typeTxt + '.' : ''}`;
    const hotel = {
      rank: h.rank, name: h.name, agodaUrl: h.agodaUrl,
      img: h.img ? 'https:' + h.img.replace(/^https?:/, '') : '',
      score: h.score, reviewCount: h.reviewCount,
      reviewCountFmt: Number(h.reviewCount).toLocaleString('en-US') + ' reviews',
      priceText: h.priceText, walkMin: h.walkMin, refLabel,
      star: h.star || null,
      propertyId: h.propertyId,
      priceUSD: h.priceUSD || null,
      priceStatus: h.priceUSD ? 'live' : 'price unavailable',
      distanceM: h.distanceM ?? null,
      locationStatus: h.distanceM != null && h.refLandmark ? 'verified' : 'approx.',
      facilities: h.featureTitles || [],
      blurb, metaTags: tags,
      travelerTypes: tt ? { topLabel: tt.topLabel, topPct: tt.topPct, distribution: tt.distribution } : null,
      reviews: (h.reviews || []).map(r => ({
        text: r.text, score: r.rating != null ? String(r.rating) : '★',
        country: r.country || '', date: r.date || '', translated: !!r.translated,
      })),
    };
    hotel.quality = qualityForHotel(hotel);
    return hotel;
  });

  const heroImg = hotels[0].img || '';
  const slug = `${theme.id}-${citySlug}-${tm.y}-${pad(tm.m)}`;
  const data = {
    slug, theme: theme.id, audience: theme.audience, emoji: theme.emoji,
    city, citySlug, cityId: Number(cityId),
    country: cityDef?.country || '', region: cityDef?.region || '', regionLabel: (REGIONS.find(r => r.id === cityDef?.region) || {}).label || '',
    cityUrl: agoda.citySearchById(Number(cityId)),
    season: season?.label || '', seasonNote: season?.note || '',
    travelMonthLabel,
    title,
    metaDescription: `The ${hotels.length} finest ${theme.audience.toLowerCase()} stays in ${city} — the highest-priced, best-reviewed five-star hotels, resorts and private villas, ranked with real Agoda guest data. Compare and book.`,
    intro: theme.intro, viewpoint: theme.viewpoint, verdict,
    aggregate,
    heroImg, heroAlt: `${city} ${theme.audience}`,
    updated: new Date().toISOString().slice(0, 10),
    hotels,
    methodology: {
      source: 'Agoda citySearch response',
      fetchedAt: new Date().toISOString(),
      searchCondition: `5-star only · ${q.adults} adults · 1 room · 1 night · check-in ${q.checkIn} · USD, taxes & fees included`,
      checkIn: q.checkIn, adults: q.adults,
      sampleNotice: 'Traveler-type shares are aggregated from the review snippets included in the search response, not from the full review set.',
    },
    _meta: { fetchedAt: new Date().toISOString(), source: 'agoda citySearch', daysAhead, targetMonth: `${tm.y}-${pad(tm.m)}`, count: hotels.length },
  };

  const validation = validateArticle(data);
  data._meta.quality = validation;
  if (!validation.ok) throw new Error('품질 검증 실패: ' + validation.errors.join(' / '));

  const outPath = path.join(ROOT, 'data/articles', slug + '.json');
  // 재생성(가격 갱신) 시 최초 발행일 유지
  try { const prev = JSON.parse(fs.readFileSync(outPath, 'utf8')); data._meta.firstPublished = prev._meta?.firstPublished || prev.updated; } catch (_) { data._meta.firstPublished = data.updated; }
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
  console.log(`✓ data/articles/${slug}.json (${hotels.length}곳, 테마=${theme.id}, city="${city}")`);
  console.log('  다음: node build.js ' + slug);
})().catch(e => { console.error('✗ ' + e.message); process.exit(1); });
