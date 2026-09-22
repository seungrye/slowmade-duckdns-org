# 보안 설정 — L7 남용 방어

2026-09 보안 점검에서 나온 지적을 실측으로 확인하고 고친 결과다 (#477).

## 무엇을 막고, 무엇을 못 막는가

**못 막는다: 볼류메트릭 DDoS.** 가정용 회선에 단일 호스트라 대역폭이 먼저 죽는다.
그건 서버 설정으로 어떻게 할 수 있는 층이 아니다 — 필요하면 Cloudflare 무료 프록시처럼
회선 앞에서 흡수하는 수밖에 없다(원본 IP 가 가려지는 부수 효과도 있다).

**막는다: L7 남용.** API 연타, 인증 콜백 남용, 스캐너, 느린 연결. 전부 열려 있었다.

## 1. nginx 레이트리밋

설정은 저장소 밖 호스트에 있다.

| 파일 | 역할 |
|---|---|
| `/etc/nginx/conf.d/ratelimit.conf` | zone 4종 + `limit_conn` zone 정의, 429 응답 |
| `/etc/nginx/sites-enabled/handmade.r-e.kr` | 각 location 에 `limit_req` 적용 |
| `/etc/nginx/sites-enabled/slowmade.duckdns.org` | 같음 |

**zone 은 정의만으로 아무 효과가 없다.** 전에 `zone=llm` 을 정의해 두고 어느 location 에서도
참조하지 않아 리밋이 전혀 걸리지 않았다(40연타가 전부 200 이었다). 지금은 아래처럼 건다.

| zone | rate | 적용 경로 | burst |
|---|---|---|---|
| `web` | 40r/s | `/`, `/s3/`, bevy-rogue 정적 | 200 / 100 |
| `api` | 20r/s | `/api/` | 60 |
| `auth` | 30r/m | `/api/auth/(callback\|signin\|signout)` | 10 |
| `upload` | 60r/m | 첨부·APK·롬 업로드 exact location 3곳 | 20 |

주의할 점 몇 가지:

- **`/api/auth/session`·`csrf` 는 `auth` zone 에 넣으면 안 된다.** 화면 전환마다 불리는
  정상 트래픽이라, 조이는 순간 로그인한 사용자가 429 를 맞는다. `api` zone 으로 충분하다.
- **exact-match(`= /api/...`) location 은 `/api/` 의 설정을 상속하지 않는다.** 업로드 경로
  3곳에 각각 따로 걸어야 한다.
- **`/netplay/`·`/socket.io/` 에는 걸지 않았다.** 대전 중 롱커넥션이고 `auth_request` 로
  이미 owner 전용이다.
- 로그인은 **Google OAuth 전용**이라 대입할 비밀번호가 없다. `auth` zone 은 브루트포스가
  아니라 연타로 인한 자원 낭비와 콜백 남용을 막는 용도다.

검증:

```bash
# auth zone — 11건 통과 후 429 여야 한다 (burst 10 + rate 1)
for i in $(seq 1 15); do
  curl -sk -o /dev/null -w "%{http_code} " https://handmade.r-e.kr/api/auth/signin
done; echo

# api zone — 120 병렬이면 일부가 429
seq 1 120 | xargs -P 30 -I{} curl -sk -o /dev/null -w "%{http_code}\n" \
  https://handmade.r-e.kr/api/auth/csrf | sort | uniq -c
```

## 2. Slowloris / 느린 연결

`/etc/nginx/nginx.conf` 의 `http` 블록.

```nginx
client_header_timeout 15s;
client_body_timeout   30s;
send_timeout          30s;
keepalive_timeout     30s;
reset_timedout_connection on;
```

이 값들은 **전체 소요 시간이 아니라 연속된 두 번의 읽기/쓰기 사이 간격**이다. 그래서
100MB 업로드나 큰 파일 다운로드도 데이터가 흐르는 한 끊기지 않는다. 헤더나 본문을 한
바이트씩 질질 흘리는 연결만 끊긴다.

`/netplay/`·`/socket.io/` 의 `proxy_read_timeout 1h` 는 **업스트림 쪽** 타임아웃이라 위
값들과 별개다 — 대전 롱커넥션은 그대로다.

동시 연결 여유도 방어력이라 `worker_connections` 을 768 → 4096 으로 올리고
`worker_rlimit_nofile 16384` 를 함께 넣었다(systemd 가 soft 1024 로 주기 때문에 필요하다).

## 3. fail2ban

`/etc/fail2ban/jail.d/nginx.local`. 전에는 `sshd` jail 하나뿐이었다.

| jail | 로그 | maxretry / findtime | bantime |
|---|---|---|---|
| `nginx-limit-req` | error.log | 30 / 10m | 1h |
| `nginx-botsearch` | access.log + error.log | 5 / 10m | 24h |
| `nginx-forbidden` | error.log | 10 / 10m | 12h |

nginx 가 429 로 한 건씩 튕기고, 반복 위반 IP 는 여기서 통째로 차단된다 — 둘이 물려 돈다.

**`ignoreip` 를 반드시 둔다** (`127.0.0.1/8 ::1 192.168.0.0/24`). 이게 없으면 리밋을
실측하다가 스스로를 잠그고 SSH 까지 막힌다. 이 파일은 `jail.local` 다음에 읽히므로
`[DEFAULT]` 키를 덮어써서 sshd 를 포함한 모든 jail 에 적용된다.

필터가 실제 로그에 맞는지 확인:

```bash
sudo fail2ban-regex /var/log/nginx/error.log  /etc/fail2ban/filter.d/nginx-limit-req.conf
sudo fail2ban-regex /var/log/nginx/access.log /etc/fail2ban/filter.d/nginx-botsearch.conf
sudo fail2ban-client status nginx-limit-req
```

## 4. Node-RED

`adminAuth` 가 주석 처리돼 있어 `/flows` 가 인증 없이 200 을 주고 있었다. Node-RED 는
function 노드로 임의 코드를 돌릴 수 있어 사실상 RCE 경로다. bcrypt 해시로 잠갔다.

```bash
# 비밀번호 변경
docker exec node-red node -e 'console.log(require("bcryptjs").hashSync("새비번",8))'
# 출력 해시를 settings.js 의 adminAuth.users[0].password 에 넣고
docker restart node-red
# 확인 — 401 이어야 한다
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:1880/flows
```

설정 파일: `/var/lib/docker/volumes/node-red_node-red-data/_data/settings.js`

## 5. CSP — 외부 CDN 제거

`src/middleware.ts` 가 CSP 를 만든다. Pretendard 폰트를 jsdelivr 에서 받느라 `style-src`·
`font-src` 는 물론 **`script-src` 까지** CDN 에 열려 있었다. 폰트에 script 권한은 필요 없고,
CDN 이 털리면 그게 곧 임의 JS 실행 경로다.

폰트를 `public/fonts/pretendard-variable.woff2` 로 자체 호스팅하고(D2Coding 과 같은 방식)
CSP 에서 jsdelivr 을 전부 걷어냈다. 외부 CSS 가 사라지니 그게 끌고 오던
`sourceMappingURL` 요청(connect-src 위반)과 브라우저 추적방지 경고도 같이 없어진다.

`middleware.test.ts` 에 **어느 지시어에도 jsdelivr 이 없어야 한다**는 테스트를 넣어 되살아나는
걸 막는다.

## 6. 의존성

`pnpm.overrides` 로 transitive 취약점을 올린다. 운영 기준 21건(high 11) → 2건(high 0).

| override | 출처 |
|---|---|
| `ws`, `protobufjs` | `@google/genai`, `firebase`→`@grpc` |
| `postcss`, `nanoid@^3`, `sharp`, `immutable` | `next` |
| `@tiptap/core` | tiptap 확장들과 버전을 맞추려고 — `pnpm update "@tiptap/*"` 도 함께 |

**남긴 2건과 그 이유** — 둘 다 고치는 쪽이 더 위험하다:

- `stream-json` (minio → `jsonl/Parser`): 패치 버전 3.x 가 **ESM 전용**이라 minio 의
  `require("stream-json/jsonl/Parser.js")` 가 깨진다. 취약점은 `pick/ignore/filter/replace`
  필터의 O(depth²) 인데 minio 는 그 필터를 쓰지 않아 우리 경로에는 해당이 없다.
- `decode-uri-component` (minio → query-string): 0.5.0 이 **ESM 전용**이라 CJS 인
  query-string 7 이 깨진다. minio 최신이 8.0.7 = 현재 버전이라 업스트림 해결도 아직 없다.

둘 다 minio 가 의존성을 올리면 풀린다. 확인:

```bash
pnpm audit --prod        # 남은 2건만 나와야 한다
pnpm view minio version  # 8.0.7 보다 높아지면 재시도
```

## 롤백

앱 쪽은 git 으로 되돌린다. 호스트 설정은 저장소 밖이라 백업에서 되돌린다.

```bash
# nginx — 변경 전 사본
sudo cp /etc/nginx/config-backups/sec-<타임스탬프>/nginx.conf            /etc/nginx/
sudo cp /etc/nginx/config-backups/sec-<타임스탬프>/handmade.r-e.kr       /etc/nginx/sites-enabled/
sudo cp /etc/nginx/config-backups/sec-<타임스탬프>/slowmade.duckdns.org  /etc/nginx/sites-enabled/
sudo rm /etc/nginx/conf.d/ratelimit.conf
sudo nginx -t && sudo nginx -s reload

# fail2ban — 추가한 파일만 지우면 sshd 만 남는 원래 상태
sudo rm /etc/fail2ban/jail.d/nginx.local
sudo systemctl restart fail2ban

# Node-RED
S=/var/lib/docker/volumes/node-red_node-red-data/_data/settings.js
sudo cp "$S.bak.sec-<타임스탬프>" "$S" && docker restart node-red
```

## 손대지 않은 것

- **MongoDB 인증** — 계정이 0개다. 다만 `mongo-firewall.service` 가 `DOCKER-USER` 체인에서
  외부 접근을 이미 DROP 하고 있어(127.0.0.0/8·172.16/12 만 허용) 인터넷에는 닫혀 있다.
  남은 위험은 컨테이너 간 측면이동이다. 인증을 켜려면 webapp 의 `MONGO_URI` 4곳과
  **`fiftyone` 컨테이너**(`mongodb://192.168.0.11:27017` 로 붙는다)를 함께 바꿔야 해서
  서비스 중단을 동반한다.
- **Cloudflare 프록시** — DNS 이관이 필요해 사람이 결정할 일이다.
