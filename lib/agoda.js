/**
 * Agoda 어필리에이트 링크 빌더 (howcartful)
 * CID는 공개값(1925461) — data/affiliate.json에서 로드.
 * 발행되는 모든 호텔/도시 링크에 ?cid=가 붙어야 수수료가 추적됩니다.
 */
const fs = require('fs');
const path = require('path');

const cfg = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'data', 'affiliate.json'), 'utf8')
).agoda;

const CID = cfg.cid;
const DEFAULT_LANG = cfg.defaultLang || 'ko-kr';

/** 추적용 cid 쿼리스트링을 안전하게 덧붙인다(기존 쿼리 보존, 중복 방지). */
function withCid(url, cid = CID) {
  const u = new URL(url);
  u.searchParams.set('cid', cid);
  return u.toString();
}

/** 호텔 상세 어필리에이트 링크. 예: hotelLink('hotel-museo-cheongju','cheongju-si-kr') */
function hotelLink(hotelSlug, citySlug, lang = DEFAULT_LANG) {
  return `https://www.agoda.com/${lang}/${hotelSlug}/hotel/${citySlug}.html?cid=${CID}`;
}

/** 도시 검색 어필리에이트 링크. 예: cityLink('cheongju-si-kr') */
function cityLink(citySlug, lang = DEFAULT_LANG) {
  return `https://www.agoda.com/${lang}/city/${citySlug}.html?cid=${CID}`;
}

/** 도시 ID(숫자) 기반 검색 링크. 예: citySearchById(9590) → 오사카 */
function citySearchById(cityId, lang = DEFAULT_LANG) {
  return `https://www.agoda.com/${lang}/search?cid=${CID}&city=${cityId}`;
}

/** 아고다 propertyPage 경로(예: "/ko-kr/hotel-x/hotel/osaka-jp.html")로 cid 링크 생성.
 *  수집기가 가져온 실제 호텔 URL을 그대로 쓰므로 slug 재구성보다 안전. */
function propertyLink(propertyPath, cid = CID) {
  if (!propertyPath) return '';
  const url = propertyPath.startsWith('http') ? propertyPath : 'https://www.agoda.com' + propertyPath;
  return withCid(url, cid);
}

/** 발행 HTML <a>에 쓸 표준 속성(제휴 고지/SEO 안전). */
const ANCHOR_REL = 'noopener sponsored nofollow';

module.exports = { CID, DEFAULT_LANG, withCid, hotelLink, cityLink, citySearchById, propertyLink, ANCHOR_REL };

// 직접 실행 시 데모 출력: `node lib/agoda.js`
if (require.main === module) {
  console.log('CID =', CID);
  console.log('hotelLink :', hotelLink('hotel-museo-cheongju', 'cheongju-si-kr'));
  console.log('cityLink  :', cityLink('cheongju-si-kr'));
  console.log('byId(9590):', citySearchById(9590));
  console.log('withCid   :', withCid('https://www.agoda.com/ko-kr/search?city=14690'));
}
