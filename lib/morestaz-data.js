/**
 * morestayz 전용 데이터 모듈
 *  - 아고다 리뷰 스니펫의 demographicName(여행자 유형) + reviewRating을 집계
 *  - 성별 데이터는 아고다가 제공하지 않으므로 다루지 않음(데이터 없는 시각화 금지)
 *  - 여행자 유형(커플/가족/혼행/친구/그룹/출장) 분포·유형별 평점만 실데이터로 산출
 */
const af = require('./agoda-fetch');

// 여행자 유형 정규화: demographicName(한/영 혼재) → 표준 키 + 한글 라벨
const TYPE_DEFS = [
  { key: 'couple',   label: 'Couples',   match: /couple|커플|연인/i },
  { key: 'family',   label: 'Families',  match: /family|가족|자녀|아이|children|kid/i },
  { key: 'solo',     label: 'Solo',      match: /solo|혼자|1인|개인 ?여행/i },
  { key: 'friends',  label: 'Friends',   match: /friend|친구|동료/i },
  { key: 'group',    label: 'Groups',    match: /group|그룹|단체|일행/i },
  { key: 'business', label: 'Business',  match: /business|비즈니스|출장|업무/i },
];

function normType(name) {
  const s = String(name || '');
  for (const d of TYPE_DEFS) if (d.match.test(s)) return d;
  return null;
}

function rawSnippets(p) {
  const cr = p?.content?.reviews?.contentReview;
  const arr = Array.isArray(cr) ? cr : (cr ? [cr] : []);
  return arr.flatMap(c => c?.summaries?.snippets || []);
}

// 여행자 유형 분포 + 유형별 평점 (실데이터 기반)
function travelerTypes(p) {
  const snips = rawSnippets(p);
  const acc = {};
  for (const s of snips) {
    const d = normType(s.demographicName);
    if (!d) continue;
    const a = acc[d.key] || (acc[d.key] = { key: d.key, label: d.label, count: 0, rSum: 0, rN: 0 });
    a.count++;
    const r = Number(s.reviewRating);
    if (Number.isFinite(r)) { a.rSum += r; a.rN++; }
  }
  const groups = Object.values(acc);
  const total = groups.reduce((n, g) => n + g.count, 0);
  if (!total) return null;
  const order = TYPE_DEFS.map(d => d.key);
  groups.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  const distribution = groups.map(g => ({
    key: g.key, label: g.label, count: g.count,
    pct: Math.round((g.count / total) * 100),
    rating: g.rN ? Math.round((g.rSum / g.rN) * 10) / 10 : null,
  }));
  const top = distribution.slice().sort((a, b) => b.count - a.count)[0];
  return { total, distribution, topType: top.key, topLabel: top.label, topPct: top.pct };
}

// 특정 유형 선호도 점수(0~100): 그 유형 리뷰 비중 + 유형 평점 보정 → 테마 적합 호텔 선별용
function affinityFor(typeKey, tt) {
  if (!tt) return 0;
  const g = tt.distribution.find(d => d.key === typeKey);
  if (!g) return 0;
  const ratingBoost = g.rating != null ? (g.rating / 10) : 0.75;
  return Math.round(g.pct * (0.7 + 0.3 * ratingBoost));
}

// mapProperty + 여행자 유형 결합
function mapPropertyRich(p, lang) {
  const base = af.mapProperty(p, lang);
  base.travelerTypes = travelerTypes(p);
  return base;
}

module.exports = { TYPE_DEFS, normType, rawSnippets, travelerTypes, affinityFor, mapPropertyRich };
