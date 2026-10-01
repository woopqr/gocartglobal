#!/bin/bash
# morestayz 안전 배포 — 커밋 → pull(충돌 자동해결) → 재빌드 → push
# 사용법:  bash push.sh "커밋 메시지"
cd "$(dirname "$0")" || exit 1
MSG="${1:-chore: update}"

git config merge.ours.driver true

echo "▶ 특별기획 숙소 수집…"
node gen-special.js || echo "  (특별기획 수집 실패 — 계속)"

echo "▶ 사이트 빌드…"
node build-all.js || { echo "✗ 빌드 실패"; exit 1; }

echo "▶ 로컬 변경 커밋…"
git add -A
git commit -m "$MSG" || echo "  (커밋할 변경 없음)"

echo "▶ 최신 변경 가져오기(자동 발행 봇 포함)…"
git pull --rebase || { echo "✗ pull 충돌 — 알려주세요"; exit 1; }

echo "▶ 봇 변경 반영해 재빌드…"
node gen-special.js || echo "  (특별기획 수집 실패 — 계속)"
node build-all.js || { echo "✗ 재빌드 실패"; exit 1; }
git add -A
git commit -m "$MSG (rebuild)" || echo "  (추가 변경 없음)"

echo "▶ 배포(push)…"
git push || { echo "✗ push 실패"; exit 1; }
echo "✓ 완료 — Cloudflare가 곧 재배포합니다."
