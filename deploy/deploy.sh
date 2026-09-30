#!/usr/bin/env bash
# Заливка «Спектра» на сервер одной командой с вашего компьютера.
# Нужны: git, ssh, scp. Пароль сервера спросит сам ssh, в файлах он не хранится.
#
#   ./deploy/deploy.sh avtomatik                    # имя сервера из ~/.ssh/config, порт 8088
#   ./deploy/deploy.sh root@31.77.12.134 8099       # или user@адрес, и другой порт
#
# Если вход идёт не под root, установка запускается через sudo (пароль спросит sudo).
set -euo pipefail
HOST="${1:?укажите сервер: ./deploy/deploy.sh avtomatik  (или user@адрес)}"
PORT="${2:-8088}"
cd "$(git rev-parse --show-toplevel)"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
git archive --format=tar.gz -o "$TMP/spectr-src.tar.gz" HEAD
scp "$TMP/spectr-src.tar.gz" deploy/install-server.sh "$HOST:/tmp/"
ssh -t "$HOST" "if [ \"\$(id -u)\" = 0 ]; then S=; else S=sudo; fi; \$S bash /tmp/install-server.sh /tmp/spectr-src.tar.gz $PORT; rm -f /tmp/spectr-src.tar.gz /tmp/install-server.sh"
