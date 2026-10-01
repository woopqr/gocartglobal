/**
 * 아고다 citySearch 수집 모듈 (howcartful)
 *  - 공개 GraphQL 엔드포인트(www.agoda.com/graphql/search) 호출
 *  - 기존 검증 파이프라인의 쿼리/요청구조 재사용 (lib/agoda-search-query.js)
 *  - 개인 세션(쿠키·IP·userId)은 코드에 박지 않음 → 필요 시 process.env.AGODA_COOKIE
 *  - Node 18+ 내장 fetch 사용 (의존성 없음)
 */
const crypto = require('crypto');
const QUERY = require('./agoda-search-query');
const agoda = require('./agoda');

const ENDPOINT = 'https://www.agoda.com/graphql/search';
const CID = Number(agoda.CID);

const uuid = () => crypto.randomUUID();
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function getSearchDates(daysAhead = 30, los = 1) {
  const ci = new Date(Date.now() + daysAhead * 86400000);
  const co = new Date(ci.getTime() + los * 86400000);
  const ciY = ymd(ci), coY = ymd(co);
  return {
    bookingDate: new Date().toISOString(),
    // DateTime(시간포함) 필드
    checkIn: `${ciY}T15:00:00.000Z`,
    checkout: `${coY}T15:00:00.000Z`,
    checkInDate: `${ciY}T15:00:00.000Z`,
    // 로컬 날짜(YYYY-MM-DD) 필드
    localCheckInDate: ciY, localCheckoutDate: coY,
  };
}

function buildVariables(cityId, dates, page = 1) {
  const userId = uuid(), searchId = uuid();
  return {
    CitySearchRequest: {
      cityId,
      searchRequest: {
        searchCriteria: {
          isAllowBookOnRequest: true, bookingDate: dates.bookingDate,
          checkInDate: dates.checkInDate, localCheckInDate: dates.localCheckInDate,
          los: 1, rooms: 1, adults: 1, children: 0, childAges: [], ratePlans: [],
          featureFlagRequest: { fetchNamesForTealium: true, showUnAvailable: true, showRemainingProperties: true, isMultiHotelSearch: false, isFlexibleMultiRoomSearch: true, flags: [] },
          isUserLoggedIn: false, currency: 'USD', travellerType: 'Couple',
          sorting: { sortField: 'Ranking', sortOrder: 'Desc', sortParams: null },
          requiredBasis: 'PRPN', requiredPrice: 'Exclusive', suggestionLimit: 0, synchronous: false,
          isRoomSuggestionRequested: false, isAPORequest: false, hasAPOFilter: false,
        },
        searchContext: {
          userId, memberId: 0, locale: 'en-us', cid: CID, origin: 'KR', platform: 1, deviceTypeId: 1,
          experiments: { forceByVariant: null, forceByExperiment: [{ id: 'JGCW-204', variant: 'B' }] },
          isRetry: false, showCMS: false, storeFrontId: 3, pageTypeId: 103, whiteLabelKey: null,
          endpointSearchType: 'CitySearch', trackSteps: null, searchId,
        },
        matrix: null,
        matrixGroup: [
          { matrixGroup: 'MetroSubwayStationLandmarkIds', size: 20 },
          { matrixGroup: 'TrainStationLandmarkIds', size: 20 },
          { matrixGroup: 'BusStationLandmarkIds', size: 20 },
          { matrixGroup: 'LandmarkIds', size: 10 },
          { matrixGroup: 'CityCenterDistance', size: 100 },
          { matrixGroup: 'StarRating', size: 20 },
          { matrixGroup: 'ReviewScore', size: 100 },
        ],
        filterRequest: { idsFilters: [], rangeFilters: [], textFilters: [] },
        page: { pageSize: 45, pageNumber: page, pageToken: '' },
        apoRequest: { apoPageSize: 10 },
        searchHistory: [],
        searchDetailRequest: { priceHistogramBins: 50 },
        isTrimmedResponseRequested: false,
        rankingRequest: { isNhaKeywordSearch: false },
        featuredPulsePropertiesRequest: { numberOfPulseProperties: 15 },
      },
    },
    ContentSummaryRequest: {
      context: {
        rawUserId: userId, memberId: 0, userOrigin: 'KR', locale: 'en-us',
        forceExperimentsByIdNew: [{ key: 'JGCW-204', value: 'B' }], apo: false,
        searchCriteria: { cityId }, platform: { id: 1 }, storeFrontId: 3, cid: String(CID),
        occupancy: { numberOfAdults: 1, numberOfChildren: 0, travelerType: 3, checkIn: dates.checkIn },
        deviceTypeId: 1, whiteLabelKey: '', correlationId: '',
      },
      summary: { highlightedFeaturesOrderPriority: null, includeHotelCharacter: true },
      reviews: {
        commentary: null,
        demographics: { providerIds: null, filter: { defaultProviderOnly: true } },
        summaries: { providerIds: null, apo: true, limit: 30, travellerType: 3 },
        cumulative: { providerIds: null }, filters: null,
      },
      images: { page: null, maxWidth: 0, maxHeight: 0, imageSizes: null, indexOffset: null },
      rooms: { showRoomSize: true, showRoomFacilities: true, showRoomName: false, includeMissing: false, includeSoldOut: false, includeDmcRoomId: false, featureLimit: 0, filterCriteria: null, images: null, soldOutRoomCriteria: null },
      nonHotelAccommodation: true, engagement: true,
      highlights: { maxNumberOfItems: 0, images: { imageSizes: [{ key: 'full', size: { width: 0, height: 0 } }] } },
      personalizedInformation: true, localInformation: { images: null }, features: null,
      rateCategories: true, contentRateCategories: { escapeRateCategories: {} }, synopsis: true,
    },
    PricingSummaryRequest: {
      cheapestOnly: true,
      context: {
        isAllowBookOnRequest: true, abTests: [],
        clientInfo: { cid: CID, languageId: 9, languageUse: 1, origin: 'KR', platform: 1, searchId, storefront: 3, userId },
        experiment: [{ name: 'JGCW-204', variant: 'B' }],
        sessionInfo: { isLogin: false, memberId: 0, sessionId: 1 }, packaging: null,
      },
      isSSR: true,
      pricing: {
        bookingDate: dates.bookingDate, checkIn: dates.checkIn, checkout: dates.checkout,
        localCheckInDate: dates.localCheckInDate, localCheckoutDate: dates.localCheckoutDate,
        currency: 'USD',
        details: { cheapestPriceOnly: false, itemBreakdown: false, priceBreakdown: false },
        featureFlag: ['ClientDiscount', 'PriceHistory', 'PromosCumulative', 'EnableCashback'],
        features: {
          crossOutRate: false, isAPSPeek: false, isAllOcc: false, isApsEnabled: false,
          isIncludeUsdAndLocalCurrency: false, isMSE: true, isRPM2Included: true, maxSuggestions: 0,
          isEnableSupplierFinancialInfo: false, isLoggingAuctionData: false, newRateModel: false,
          overrideOccupancy: false, filterCheapestRoomEscapesPackage: false, priusId: 0,
          synchronous: false, enableRichContentOffer: true, showCouponAmountInUserCurrency: false,
          disableEscapesPackage: false, enablePushDayUseRates: false, enableDayUseCor: false,
        },
        filters: { cheapestRoomFilters: [], filterAPO: false, ratePlans: [1], secretDealOnly: false, suppliers: [], nosOfBedrooms: [] },
        includedPriceInfo: false,
        occupancy: { adults: 1, children: 0, childAges: [], rooms: 1, childrenTypes: [] },
        supplierPullMetadata: { requiredPrecheckAccuracyLevel: 0 },
        mseHotelIds: [], mseClicked: '', ppLandingHotelIds: [], searchedHotelIds: [], paymentId: -1, externalLoyaltyRequest: null,
      },
      suggestedPrice: 'Exclusive',
    },
    PriceStreamMetaLabRequest: { attributesId: [8, 1, 18, 7, 11, 2, 3] },
  };
}

function headers(cityId, cookie) {
  const h = {
    'accept': '*/*', 'accept-language': 'ko-KR,ko;q=0.9,en;q=0.8',
    'ag-language-locale': 'en-us', 'ag-page-type-id': '103',
    'ag-request-id': crypto.randomUUID(), 'ag-correlation-id': crypto.randomUUID(),
    'content-type': 'application/json', 'origin': 'https://www.agoda.com',
    'referer': `https://www.agoda.com/en-us/search?city=${cityId}&cid=${CID}&locale=en-us&currency=USD`,
    'sec-ch-ua': '"Chromium";v="129", "Google Chrome";v="129", "Not=A?Brand";v="8"',
    'sec-ch-ua-mobile': '?0', 'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty', 'sec-fetch-mode': 'cors', 'sec-fetch-site': 'same-origin',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  };
  if (cookie) h['cookie'] = cookie;
  return h;
}

async function fetchCitySearch(cityId, { page = 1, daysAhead = 30, cookie = process.env.AGODA_COOKIE } = {}) {
  const dates = getSearchDates(daysAhead);
  const body = { operationName: 'citySearch', variables: buildVariables(cityId, dates, page), query: QUERY };
  const res = await fetch(ENDPOINT, { method: 'POST', headers: headers(cityId, cookie), body: JSON.stringify(body) });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Agoda ${res.status} ${res.statusText}\n--- 전체 응답 ---\n${txt}`);
  }
  const json = await res.json();
  const cs = json?.data?.citySearch;
  if (!cs) throw new Error('citySearch 응답 없음: ' + JSON.stringify(json).slice(0, 200));
  return cs;
}

// ── 파싱 헬퍼 ──────────────────────────────────────────────
// 랜드마크 이름 정리: 괄호 이후(불완전 괄호 포함) 잘라내고 공백 정돈
function cleanLandmark(s) {
  return String(s || '').replace(/\s*[\(（].*$/, '').replace(/\s+/g, ' ').trim();
}
function nearestLandmark(landmarks = {}) {
  const pick = v => {
    const arr = Array.isArray(v) ? v : v ? [v] : [];
    return arr.filter(x => x && x.distanceInM != null).sort((a, b) => a.distanceInM - b.distanceInM)[0];
  };
  const station = pick(landmarks.transportation);
  if (station) return { kind: 'station', name: cleanLandmark(station.landmarkName), m: station.distanceInM };
  const top = pick(landmarks.topLandmark);
  if (top) return { kind: 'landmark', name: cleanLandmark(top.landmarkName), m: top.distanceInM };
  const beach = pick(landmarks.beach);
  if (beach) return { kind: 'beach', name: cleanLandmark(beach.landmarkName), m: beach.distanceInM };
  return null;
}
function parsePriceKRW(p) {
  if (p == null) return null;
  const n = Number(String(p).replace(/[^\d]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}
function priceBand(usd) {
  if (usd == null) return 3;
  if (usd <= 100) return 1; if (usd <= 250) return 2; if (usd <= 500) return 3; if (usd <= 1000) return 4; return 5;
}
function priceText(usd, band) {
  const sym = '$'.repeat(band <= 1 ? 1 : band >= 4 ? 3 : 2);
  if (usd == null) return `${sym} · price varies`;
  return `${sym} · ~$${Number(usd).toLocaleString('en-US')}/night`;
}
function bayesian(score, count, prior = 7.5, weight = 30) {
  if (!count) return score || prior;
  return (score * count + prior * weight) / (count + weight);
}
function extractPrice(pricing) {
  try {
    for (const offer of pricing?.offers || []) {
      for (const ro of offer?.roomOffers || []) {
        for (const pr of ro?.room?.pricing || []) {
          const candidates = [
            pr?.price?.perRoomPerNight?.inclusive?.display,
            pr?.price?.perRoomPerNight?.exclusive?.display,
            pr?.price?.perNight?.inclusive?.display,
            pr?.price?.perNight?.exclusive?.display,
          ];
          for (const value of candidates) {
            const n = parsePriceKRW(value);
            if (n) return n;
          }
        }
      }
    }
  } catch (_) {}
  return null;
}

// 실제 아고다 리뷰 스니펫 추출 (응답 내 데이터, 추가 API 불필요)
// 한국어 리뷰 > 한국 작성자 > 그 외 순으로 우선 노출
function extractReviews(p, max = 5) {
  const cr = p?.content?.reviews?.contentReview;
  const arr = Array.isArray(cr) ? cr : (cr ? [cr] : []);
  const raw = arr.flatMap(c => (c?.summaries?.snippets) || []);
  const hasHangul = t => /[가-힣]/.test(t || '');
  const isKR = s => s.countryCode === 'KR' || /대한민국|South Korea/.test(s.countryName || '');
  const prio = s => hasHangul(s.snippet) ? 0 : (isKR(s) ? 1 : 2);
  const snippets = raw.map((s, i) => ({ s, i })).sort((a, b) => prio(a.s) - prio(b.s) || a.i - b.i).map(x => x.s);
  const out = [], seen = new Set();
  for (const s of snippets) {
    let text = (s.snippet || '').replace(/\s+/g, ' ').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    if (text.length > 140) text = text.slice(0, 140).trim() + '…';
    const dm = /^(\d{4})-(\d{2})/.exec(s.date || '');
    out.push({
      text,
      rating: s.reviewRating != null ? s.reviewRating : null,
      country: s.countryName || '',
      date: dm ? `${dm[1]}.${dm[2]}` : '',
    });
    if (out.length >= max) break;
  }
  return out;
}

function mapProperty(p, lang = 'en-us') {
  const info = p?.content?.informationSummary || {};
  const rev = p?.content?.reviews?.cumulative || p?.content?.reviews?.contentReview?.[0]?.cumulative || {};
  const img = p?.content?.images?.hotelImages?.[0]?.urls?.find(u => u.value)?.value || null;
  const near = nearestLandmark(p?.content?.localInformation?.landmarks);
  const krw = extractPrice(p?.pricing);
  const band = priceBand(krw);
  const score = rev.score != null ? Number(rev.score) : null;
  const count = rev.reviewCount != null ? Number(rev.reviewCount) : 0;
  const adj = score != null ? bayesian(score, count) : null;
  const valueIndex = adj != null ? Math.round((adj / (1 + (band - 1) * 0.18)) * 10) / 10 : null;
  return {
    propertyId: p.propertyId,
    name: info.displayName || '',
    propertyUrl: info.propertyLinks?.propertyPage || '',
    agodaUrl: agoda.propertyLink(info.propertyLinks?.propertyPage, CID),
    star: info.rating ?? null,
    score, reviewCount: count,
    priceKRW: krw, priceBand: band, priceText: priceText(krw, band),
    valueIndex,
    accommodationType: info.accommodationType || '',
    propertyType: info.propertyType || '',
    refKind: near?.kind || null, refLandmark: near?.name || null, distanceM: near?.m ?? null,
    walkMin: near?.m != null ? Math.max(1, Math.round(near.m / 80)) : null,
    img,
    geo: info.geoInfo || null,
    hasKidsPool: !!((p?.content?.familyFeatures || p?.familyFeatures || {}).hasKidsPool),
    hasKidsClub: !!((p?.content?.familyFeatures || p?.familyFeatures || {}).hasKidsClub),
    isFamilyRoom: !!((p?.content?.familyFeatures || p?.familyFeatures || {}).isFamilyRoom),
    featureTitles: [
      ...((((p?.content?.highlight || p?.highlight || {}).favoriteFeatures?.features) || []).map(f => f && f.title)),
      ...((p?.enrichment?.roomInformation?.facilities || []).map(f => f && f.propertyFacilityName)),
    ].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i),
    reviews: extractReviews(p),
  };
}

// 무료 구글 번역(키 불필, $0) — 실패 시 null 반환(호출측에서 원문 fallback)
async function translateToKo(text) {
  if (!text) return null;
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ko&dt=t&q=${encodeURIComponent(text)}`;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ac.signal, headers: { 'user-agent': 'Mozilla/5.0' } });
    if (!res.ok) return null;
    const j = await res.json();
    const out = (j[0] || []).map(seg => seg && seg[0]).filter(Boolean).join('').trim();
    return out || null;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

module.exports = { CID, fetchCitySearch, mapProperty, nearestLandmark, parsePriceKRW, priceBand, priceText, bayesian, getSearchDates, buildVariables, translateToKo };
