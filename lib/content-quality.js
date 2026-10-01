const REQUIRED_HOTEL_FIELDS = ['name', 'agodaUrl', 'score', 'reviewCount'];

function hotelIssues(h) {
  const issues = REQUIRED_HOTEL_FIELDS.filter(k => h[k] == null || h[k] === '');
  if (!h.img) issues.push('img');
  if (!h.priceKRW) issues.push('price');
  if (h.distanceM == null || !h.refLabel) issues.push('location');
  if (!Array.isArray(h.reviews) || !h.reviews.length) issues.push('reviewSample');
  return [...new Set(issues)];
}

function qualityForHotel(h) {
  const issues = hotelIssues(h);
  const critical = issues.some(x => REQUIRED_HOTEL_FIELDS.includes(x));
  return {
    issues,
    critical,
    completeness: Math.round((1 - issues.length / 8) * 100),
    priceStatus: h.priceKRW ? 'confirmed' : 'unavailable',
    locationStatus: h.distanceM != null && h.refLabel ? 'confirmed' : 'unavailable',
  };
}

function validateArticle(data) {
  const errors = [], warnings = [];
  if (!data.slug || !data.title || !data.city || !data._meta?.fetchedAt) errors.push('article identity/source metadata');
  if (!Array.isArray(data.hotels) || data.hotels.length < 3) errors.push('at least 3 hotels');
  for (const h of data.hotels || []) {
    const q = qualityForHotel(h);
    if (q.critical) errors.push(`${h.name || 'unknown hotel'}: ${q.issues.join(', ')}`);
    else if (q.issues.length) warnings.push(`${h.name}: ${q.issues.join(', ')}`);
  }
  return { ok: errors.length === 0, errors, warnings };
}

module.exports = { hotelIssues, qualityForHotel, validateArticle };
