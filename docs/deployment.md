# 배포 가이드 — 무중단 Blue/Green

nginx upstream 스왑 + systemd 템플릿 유닛 기반 무중단 배포.

## 구성 요약

```
                 ┌──────────────────────────────┐
  사용자 ──HTTPS─▶  nginx (slowmade.duckdns.org)  │
                 └──────────────┬───────────────┘
                                │ proxy_pass http://webapp;
                  upstream webapp { server 127.0.0.1:<active>; }
                                │
                ┌───────────────┴────────────────┐
                ▼                                ▼
       systemd: webapp@3010              systemd: webapp@3011
       NEXT_DISTDIR=.next-3010           NEXT_DISTDIR=.next-3011
       (활성 — 트래픽 받음)               (다음 배포 대상)
```

배포 시 비활성 포트로 빌드 → 기동 → 헬스체크 → upstream 스왑 → nginx reload → 구 인스턴스 stop.

## 최초 1회 셋업

### 1. systemd 템플릿 유닛 설치

```bash
sudo install -m 0644 /home/seungrye/site/scripts/deploy/webapp@.service \
    /etc/systemd/system/webapp@.service
sudo systemctl daemon-reload
```

`webapp@.service` 의 `Environment=PATH=...` 가 `which node && which pnpm` 결과와 일치하는지
확인. 다르면 유닛 파일을 수정한 뒤 다시 install.

### 2. nginx upstream 파일 배치

```bash
sudo install -m 0644 /home/seungrye/site/scripts/deploy/webapp-upstream.conf \
    /etc/nginx/conf.d/webapp-upstream.conf
```

### 3. 기존 nginx 사이트 설정 변경

`/etc/nginx/sites-enabled/slowmade.duckdns.org` 의 `proxy_pass` 를 변경:

```diff
  location / {
-     proxy_pass http://localhost:3010;
+     proxy_pass http://webapp;
      ...
  }
```

```bash
sudo nginx -t && sudo nginx -s reload
```

### 4. 현재 실행 중인 screen 프로세스 → systemd 인스턴스로 전환

기존 `screen` 안의 `pnpm start` 가 3010 포트를 점유 중이므로 systemd 인스턴스가 충돌한다.
순서대로 진행:

```bash
# 4-1. 새 distDir 로 빌드
cd /home/seungrye/site/webapp
NEXT_DISTDIR=.next-3011 pnpm install --frozen-lockfile
NEXT_DISTDIR=.next-3011 pnpm build

# 4-2. 3011 인스턴스 기동 (screen 의 3010 은 그대로 둔다)
sudo systemctl start webapp@3011
sudo systemctl enable webapp@3011

# 4-3. 헬스체크
curl -fsS http://127.0.0.1:3011/api/health

# 4-4. upstream 을 3011 로 스왑 + nginx reload (트래픽 전환, 무중단)
sudo sed -i 's/127\.0\.0\.1:3010/127.0.0.1:3011/' /etc/nginx/conf.d/webapp-upstream.conf
sudo nginx -t && sudo nginx -s reload

# 4-5. screen 의 3010 프로세스 종료 (이제 트래픽 없음)
screen -r  # Ctrl-C 로 종료
# 또는 외부에서:  kill <기존 next-server pid>

# 4-6. 다음 배포부터는 3010 도 systemd 로 관리되도록 enable
sudo systemctl enable webapp@3010
```

이후부터는 `scripts/deploy/deploy.sh` 한 번이면 된다.

### 5. (권장) sudoers NOPASSWD 등록

`deploy.sh` 가 비대화식으로 `systemctl` / `nginx` / `install` 을 호출하므로 비밀번호를
요구하지 않게 한다.

```bash
sudo visudo -f /etc/sudoers.d/webapp-deploy
```

```
seungrye ALL=(root) NOPASSWD: /bin/systemctl start webapp@*, \
                              /bin/systemctl stop webapp@*, \
                              /bin/systemctl is-active webapp@*, \
                              /usr/sbin/nginx -t, \
                              /usr/sbin/nginx -s reload, \
                              /usr/bin/install -m 0644 * /etc/nginx/conf.d/webapp-upstream.conf
```

(systemctl/nginx 의 절대 경로는 `which` 로 확인해서 맞춰 넣을 것.)

### 6. nginx sites 파일 코드화 (재해 복구)

`/etc/nginx/sites-enabled/` 의 **두 도메인 모두** *최신 내용* 을 `scripts/deploy/<도메인>.nginx` 로
git 추적한다 — `slowmade.duckdns.org` · `handmade.r-e.kr`. 새 도메인/cert/header/업로드 상한
변경 시 항상 둘을 함께 동기화.

> **한쪽만 고치지 말 것** (#146 에서 실제로 겪음). 업로드 상한을 slowmade 스냅샷에만 적어 두면
> 실서버에는 반영되지 않고, handmade 로 들어온 요청은 server 기본값에서 413 이 난다. 게다가
> 실패가 nginx 단이라 앱 로그에 아무것도 안 남아 원인을 찾기 어렵다.

```bash
# 변경 → git 으로 회수 (두 도메인)
for d in slowmade.duckdns.org handmade.r-e.kr; do
    sudo cp "/etc/nginx/sites-enabled/$d" "/home/seungrye/site/scripts/deploy/$d.nginx"
    sudo chown "$USER:$USER" "scripts/deploy/$d.nginx"
done
git add scripts/deploy/*.nginx && git commit

# 재해 복구 (서버 재구축)
for d in slowmade.duckdns.org handmade.r-e.kr; do
    sudo install -m 0644 "scripts/deploy/$d.nginx" "/etc/nginx/sites-enabled/$d"
done
sudo nginx -t && sudo nginx -s reload
```

**백업 파일을 `sites-enabled/` 안에 두지 말 것.** include 글롭이 `*.bak` 까지 읽어
`duplicate upstream` 으로 `nginx -t` 가 깨진다. 백업은 `/etc/nginx/config-backups/` 로.

ssl 경로 (`/etc/letsencrypt/...`) 는 표준 경로라 공개 안전. 실 인증서는 별도 systemd timer / certbot 으로 갱신.


### 7. MinIO 접근 제어 (#165)

버킷은 한때 익명에게 **읽기·목록·쓰기·삭제**를 모두 허용하고 있었고, nginx 가 버킷 전체를
프록시해 앱의 인증이 통째로 우회됐다. 두 겹으로 막는다.

1. **버킷 정책** — `scripts/deploy/minio-bucket-policy.json`. 익명에게는 공개 prefix
   (`painter-images/`·`thumbnails/`·`paper-fig-*`·루트 타임스탬프 파일)의 `GetObject` 만 준다.
   `ListBucket`·`PutObject`·`DeleteObject` 는 익명에서 제거했다.
   앱은 `seungrye`(readwrite)의 **서비스 계정**으로 붙으므로 이 정책과 무관하다.

   ```bash
   mc anonymous set-json scripts/deploy/minio-bucket-policy.json <alias>/handmade-site
   ```

   되돌리기: `minio-bucket-policy.before.json` 이 변경 전 정책이다.

2. **nginx** — `scripts/deploy/minio-guard.conf` 를 `/etc/nginx/conf.d/` 에 둔다.
   서명 헤더가 없는(익명) 요청만 버킷 목록·비공개 prefix 에서 404 로 돌린다.
   각 프록시 블록 안에서 `if ($minio_deny_anon) { return 404; }` 로 쓰며,
   **`rewrite … break` 보다 앞에** 둬야 한다(뒤에 두면 rewrite 모듈이 처리를 끊어 무시된다).

3. **MinIO 포트** — 컨테이너를 `127.0.0.1:9000`·`127.0.0.1:9090` 으로만 바인딩한다.
   앱은 `minio-api…:443`(nginx 경유)로 붙으므로 9000 을 밖에 열 이유가 없다.

   ```bash
   docker run -d --name minio-cloudstorage --restart unless-stopped \
     -p 127.0.0.1:9000:9000 -p 127.0.0.1:9090:9090 \
     -v /home/seungrye/minio-data:/data \
     -e MINIO_ROOT_USER=… -e MINIO_ROOT_PASSWORD=… -e MINIO_BROWSER_REDIRECT_URL=… \
     quay.io/minio/minio:latest server /data --console-address ":9090"
   ```

   데이터는 호스트 바인드 마운트(`/home/seungrye/minio-data`)라 컨테이너를 다시 만들어도
   영향이 없다. 그래도 바꾸기 전후로 객체 수·용량을 대조할 것.

## 일상 배포

```bash
cd /home/seungrye/site
git pull
./scripts/deploy/deploy.sh
```

스크립트가 자동으로:
1. 활성/비활성 포트 식별
2. 비활성 포트의 distDir 로 build
3. 비활성 인스턴스 systemctl start
4. `/api/health` 폴링 (60초 타임아웃)
5. upstream 스왑 + nginx -s reload
6. 구 인스턴스 stop

## 롤백

방금 한 배포가 잘못된 경우 — 두 인스턴스가 모두 살아있다면 upstream 만 되돌리면 된다.

```bash
# 현재 활성 포트 확인
grep 127.0.0.1 /etc/nginx/conf.d/webapp-upstream.conf

# 반대 포트로 다시 스왑 (구 인스턴스가 아직 살아있는 경우)
sudo sed -i 's/127\.0\.0\.1:3011/127.0.0.1:3010/' /etc/nginx/conf.d/webapp-upstream.conf
# (또는 3010 ↔ 3011 반대)
sudo nginx -t && sudo nginx -s reload
```

`deploy.sh` 는 마지막 단계에서 구 인스턴스를 stop 하므로, 배포 완료 후에는 위 즉시 롤백이
불가능하다. 이 경우 git revert 후 다시 `deploy.sh` 를 돌리는 것이 표준 절차.

## 주의 — DB 마이그레이션은 backward-compatible 해야 함

Blue/Green 전환 순간 두 버전이 같은 MongoDB 를 동시에 본다. 따라서:

- **금지**: 컬럼/필드 rename, type 축소, NOT NULL 추가 같은 breaking 변경을 한 번에.
- **권장 패턴**: expand → migrate → contract.
  1. 새 필드 추가 (구 코드는 무시)
  2. 새 코드 배포 (양쪽 필드를 모두 읽고 새 필드에 씀)
  3. 데이터 백필
  4. 다음 배포에서 구 필드 제거

## 트러블슈팅

| 증상 | 원인 / 조치 |
|------|-------------|
| `pnpm: command not found` (systemd 로그) | `webapp@.service` 의 `Environment=PATH=...` 에 nvm 경로 누락. `which pnpm` 결과 반영. |
| 헬스체크 60초 타임아웃 | DB/MinIO 연결 실패가 아닌 경우 빌드 산출물 손상 의심. `journalctl -u webapp@<port> -n 100`. |
| nginx reload 후 502 | `proxy_pass` 가 `http://webapp` 가 아닌 `localhost:3010` 으로 남아있는지 확인. |
| 두 인스턴스가 같은 `.next` 사용 | `NEXT_DISTDIR` 환경변수 누락. systemd 유닛 또는 deploy.sh 의 env 확인. |

## 관련 파일

- `scripts/deploy/webapp@.service` — systemd 템플릿 유닛
- `scripts/deploy/webapp-upstream.conf` — nginx upstream 정의 (활성 포트 단일 소스)
- `scripts/deploy/deploy.sh` — 배포 오케스트레이션
- `webapp/next.config.ts` — `distDir` 환경변수 인식
- `webapp/src/app/api/health/route.ts` — liveness 엔드포인트
