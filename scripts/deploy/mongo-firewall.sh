#!/bin/sh
# MongoDB(27017) 원격 접근 차단 (#179).
#
# 왜 필요한가: mongodb 컨테이너가 포트를 `0.0.0.0:27017` 로 게시하고 **인증이 없다**.
# 붙기만 하면 전체 DB 읽기·쓰기가 된다. 그런데 도커가 게시한 포트는 자기 iptables 규칙을
# 직접 넣기 때문에 **ufw 를 그냥 지나간다** — ufw 로는 막을 수 없다.
#
# 도커가 그 목적으로 비워 두는 자리가 `DOCKER-USER` 체인이다. FORWARD 의 첫 점프이고,
# 게시 포트로 들어오는 **원격** 트래픽이 반드시 여기를 지난다(호스트 자신에서 오는 것은
# 포워딩이 아니라 안 지나지만, 호스트에 들어온 사람은 이미 더 큰 권한을 가진 것이라 무관).
#
# 예외 둘:
#   127.0.0.0/8   — 사이트(next-server)가 mongodb://127.0.0.1 로 붙는다.
#   172.16.0.0/12 — 컨테이너들(fiftyone 이 호스트 IP 로 붙는다). 어차피 컨테이너는 게시 포트를
#                   거치지 않고 컨테이너 IP 로 직접 갈 수 있으므로, 여기서 막아 봐야 의미가 없다.
#
# 순서가 전부다 — 예외 RETURN 두 줄이 DROP 보다 **위**에 있어야 한다. 아래에서 위로 넣는다.
#
# 중복 없이 여러 번 돌 수 있게, 우리 규칙만 지우고 다시 넣는다(체인 전체를 비우지 않는다 —
# 남의 규칙까지 날아간다).
set -e

PORT=27017

drop_v4="-p tcp --dport ${PORT} -j DROP"
ret_lo="-s 127.0.0.0/8 -p tcp --dport ${PORT} -j RETURN"
ret_docker="-s 172.16.0.0/12 -p tcp --dport ${PORT} -j RETURN"

# 이미 있으면 지운다(없으면 조용히 넘어간다).
# shellcheck disable=SC2086
for rule in "$ret_lo" "$ret_docker" "$drop_v4"; do
  while iptables -C DOCKER-USER $rule 2>/dev/null; do
    iptables -D DOCKER-USER $rule
  done
done
while ip6tables -C DOCKER-USER $drop_v4 2>/dev/null; do
  ip6tables -D DOCKER-USER $drop_v4
done

# 아래에서 위로 — 최종 순서는 [루프백 RETURN, 도커 RETURN, DROP] 이 된다.
# shellcheck disable=SC2086
iptables -I DOCKER-USER 1 $drop_v4
# shellcheck disable=SC2086
iptables -I DOCKER-USER 1 $ret_docker
# shellcheck disable=SC2086
iptables -I DOCKER-USER 1 $ret_lo

# IPv6 — 지금 이 호스트엔 전역 IPv6 가 없지만, 생기는 날 조용히 뚫리지 않게 함께 막는다.
# 컨테이너 IPv6 는 꺼져 있어 예외가 필요 없다.
# shellcheck disable=SC2086
ip6tables -I DOCKER-USER 1 $drop_v4

echo "mongo-firewall: DOCKER-USER 에 ${PORT} 차단 규칙 적용"
iptables -S DOCKER-USER
