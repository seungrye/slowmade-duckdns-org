#!/usr/bin/env bash
# 검수용 DB 를 실서비스 DB 에서 새로 뜬다 (#검수환경).
#
# AI 가 만든 브랜치를 사람이 배포하기 전에 **실제로 눌러 보는** 인스턴스(webapp-staging@3012)가
# 쓸 DB 다. 실데이터를 써야 의미가 있다 — 이번에 D&D 패치 이름 겹침(`ddsomu.zip` 이 롬과 패치
# 양쪽 이름)도 실데이터로 돌려 보고서야 드러났다.
#
# **빼는 것 둘, 이유가 다르다.**
#
#   stockdailyprices  — 357만 건으로 DB 의 99% 다. UI·기능 검수에 쓸 일이 없다.
#                       빼면 500MB → 1MB 남짓이라 몇 초면 끝난다.
#   tradingaccounts   — 브로커 자격증명. 암호화돼 있지만 검수 인스턴스가 같은
#   tradingtokens       TRADING_SECRET_KEY 를 쓰므로 **복호가 된다.** 스케줄러를 꺼 두더라도
#                       코드 한 줄이 잘못 돌면 실계좌를 건드린다. 아예 복사하지 않는다.
#
# DB 를 갈라도 **바깥으로 나가는 것은 여전히 진짜**다 — 메일·MinIO·브로커 API.
# 그건 `.env.staging` 에서 꺼야 한다(webapp-staging@.service 주석 참고).
#
# 사용:
#   bash scripts/deploy/staging-db-refresh.sh            # handmade-site → handmade-site-staging
#   bash scripts/deploy/staging-db-refresh.sh --keep-prices   # 주가까지 복사(느리다)
set -euo pipefail

CONTAINER="${MONGO_CONTAINER:-mongodb}"
SRC_DB="${SRC_DB:-handmade-site}"
DST_DB="${DST_DB:-handmade-site-staging}"

EXCLUDE=(--excludeCollection=tradingaccounts --excludeCollection=tradingtokens)
if [[ "${1:-}" != "--keep-prices" ]]; then
    EXCLUDE+=(--excludeCollection=stockdailyprices)
fi

log() { printf '\033[1;34m[staging-db]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[staging-db]\033[0m %s\n' "$*" >&2; exit 1; }

docker inspect "$CONTAINER" >/dev/null 2>&1 || die "몽고 컨테이너를 찾을 수 없습니다: $CONTAINER"

log "원본 $SRC_DB → 검수용 $DST_DB"
log "제외: $(printf '%s ' "${EXCLUDE[@]}" | sed 's/--excludeCollection=//g')"

# 검수 DB 는 **매번 통째로 갈아엎는다.** 지난 검수의 흔적이 남으면 결과를 믿을 수 없다.
docker exec "$CONTAINER" mongosh --quiet --eval "db.getSiblingDB('$DST_DB').dropDatabase()" >/dev/null \
    || die "기존 검수 DB 를 지우지 못했습니다."

# 아카이브를 파이프로 넘긴다 — 중간 파일을 남기지 않는다(실데이터 사본이 디스크에 굴러다니지 않게).
docker exec "$CONTAINER" sh -c "
    mongodump --quiet --db='$SRC_DB' $(printf '%s ' "${EXCLUDE[@]}") --archive |
    mongorestore --quiet --archive --nsFrom='$SRC_DB.*' --nsTo='$DST_DB.*'
" || die "덤프/복원에 실패했습니다."

log "완료 — 검수 DB 내용:"
docker exec "$CONTAINER" mongosh --quiet --eval "
    const db2 = db.getSiblingDB('$DST_DB');
    const names = db2.getCollectionNames().sort();
    let total = 0;
    for (const n of names) { const c = db2.getCollection(n).countDocuments(); total += c;
        if (c > 0) print('  ' + n.padEnd(28) + c); }
    print('  ' + '합계'.padEnd(28) + total);
"

cat <<'NOTE'

  다음: 검수 인스턴스가 이 DB 를 보게 하려면 webapp/.env.staging 에
    MONGO_URI=mongodb://127.0.0.1:27017/handmade-site-staging
  그리고 반드시 함께:
    TRADING_SCHEDULER_ENABLED=false   ← 없으면 실제 주문이 중복으로 나갈 수 있다
NOTE
