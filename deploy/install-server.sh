#!/usr/bin/env bash
# Установка «Спектра» на сервер. Запускать на самом сервере от root.
#
# Что делает:
#   - ставит проект в НОВУЮ папку /opt/spectr-school (другие папки и проекты не трогает);
#   - Node.js 22 кладёт внутрь этой же папки, системный Node и пакеты не меняет;
#   - запускает отдельный сервис spectr-school на своём порту (по умолчанию 8088),
#     nginx, Apache и чужие сервисы не перенастраивает и не перезапускает;
#   - только если включён ufw, открывает в нём этот порт.
# Повторный запуск обновляет проект, база и загруженные фото сохраняются.
#
# Использование:  bash install-server.sh /путь/к/spectr-src.tar.gz [порт]
set -euo pipefail

SRC_TAR="${1:-}"
PORT="${2:-${SPECTR_PORT:-8088}}"
APP_DIR="${SPECTR_DIR:-/opt/spectr-school}"
SERVICE="spectr-school"
RUN_USER="spectr-school"
NODE_VERSION="${NODE_VERSION:-22.22.2}"

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[31mОшибка: %s\033[0m\n' "$*" >&2; exit 1; }
listening() { ss -ltnH 2>/dev/null | awk '{print $4}'; }

[ "$(id -u)" = "0" ] || die "запустите от root (или через sudo)"
[ -f "$SRC_TAR" ] || die "укажите архив с проектом: bash install-server.sh spectr-src.tar.gz"
command -v systemctl >/dev/null || die "нужен systemd"
command -v curl >/dev/null || die "нужен curl"
command -v tar >/dev/null || die "нужен tar"
command -v xz >/dev/null || die "нужен xz (apt install xz-utils)"

say "Что уже есть на сервере (только смотрим, ничего не меняем)"
echo "Занятые порты:"
listening | sort -u | head -30 | sed 's/^/  /'
if [ -d /opt ]; then echo "Папки в /opt:"; ls -1 /opt | sed 's/^/  /'; fi

UPDATING=0
if [ -f "/etc/systemd/system/$SERVICE.service" ]; then UPDATING=1; fi
if [ "$UPDATING" = "0" ] && listening | grep -qE "[:.]${PORT}$"; then
  die "порт $PORT уже занят другой программой. Выберите свободный: bash install-server.sh $SRC_TAR 8099"
fi
if [ "$UPDATING" = "0" ] && [ -e "$APP_DIR" ] && [ -n "$(ls -A "$APP_DIR" 2>/dev/null)" ]; then
  die "папка $APP_DIR уже существует и не пуста, а сервиса $SERVICE нет. Чтобы не затереть чужое, выберите другую: SPECTR_DIR=/opt/spectr-school-2 bash install-server.sh ..."
fi

say "Папка проекта: $APP_DIR, порт: $PORT"
id "$RUN_USER" >/dev/null 2>&1 || useradd --system --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$RUN_USER"
mkdir -p "$APP_DIR/runtime" "$APP_DIR/data/uploads" "$APP_DIR/app"

say "Node.js $NODE_VERSION внутри $APP_DIR/runtime"
case "$(uname -m)" in
  x86_64) ARCH=x64 ;;
  aarch64|arm64) ARCH=arm64 ;;
  *) die "неизвестная архитектура $(uname -m)" ;;
esac
if [ ! -x "$APP_DIR/runtime/bin/node" ] || ! "$APP_DIR/runtime/bin/node" -v | grep -q "^v22"; then
  curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${ARCH}.tar.xz" -o /tmp/spectr-node.tar.xz
  rm -rf "$APP_DIR/runtime" && mkdir -p "$APP_DIR/runtime"
  tar -xJf /tmp/spectr-node.tar.xz -C "$APP_DIR/runtime" --strip-components=1
  rm -f /tmp/spectr-node.tar.xz
fi
export PATH="$APP_DIR/runtime/bin:$PATH"
node -v

say "Исходники"
rm -rf "$APP_DIR/app.new" && mkdir -p "$APP_DIR/app.new"
tar -xzf "$SRC_TAR" -C "$APP_DIR/app.new"
rm -rf "$APP_DIR/app.old"
if [ -d "$APP_DIR/app" ]; then mv "$APP_DIR/app" "$APP_DIR/app.old"; fi
mv "$APP_DIR/app.new" "$APP_DIR/app"
rm -rf "$APP_DIR/app/apps/api/uploads"
ln -s "$APP_DIR/data/uploads" "$APP_DIR/app/apps/api/uploads"

say "Настройки"
public_ip() { curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}'; }
if [ ! -f "$APP_DIR/.env" ]; then
  IP="$(public_ip)"
  cat > "$APP_DIR/.env" <<ENV
DATABASE_URL="file:$APP_DIR/data/spectr.db"
JWT_SECRET="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
PORT=$PORT
WEB_ORIGIN="http://$IP:$PORT"
SERVE_WEB=1
TELEGRAM_BOT_TOKEN=""
VK_APP_SECRET=""
ENV
  chmod 600 "$APP_DIR/.env"
fi
ln -sf "$APP_DIR/.env" "$APP_DIR/app/apps/api/.env"

say "Зависимости и сборка (несколько минут)"
cd "$APP_DIR/app"
npm ci --no-audit --no-fund
npm run build

say "База данных"
cd "$APP_DIR/app/apps/api"
FIRST=0
[ -f "$APP_DIR/data/spectr.db" ] || FIRST=1
set -a; . "$APP_DIR/.env"; set +a
npx prisma db push
if [ "$FIRST" = "1" ]; then
  npx tsx prisma/seed.ts
fi

chown -R "$RUN_USER":"$RUN_USER" "$APP_DIR/data" "$APP_DIR/app"
chown "$RUN_USER":"$RUN_USER" "$APP_DIR/.env"

say "Сервис $SERVICE"
cat > "/etc/systemd/system/$SERVICE.service" <<UNIT
[Unit]
Description=Spectr online school
After=network.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$APP_DIR/app/apps/api
EnvironmentFile=$APP_DIR/.env
ExecStart=$APP_DIR/runtime/bin/node dist/server.js
Restart=always
RestartSec=3
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null
systemctl restart "$SERVICE"

if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
  say "ufw включён: открываю порт $PORT/tcp (больше ничего в правилах не меняю)"
  ufw allow "$PORT/tcp" >/dev/null
fi

say "Проверка"
OK=0
for i in $(seq 1 25); do
  if curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then OK=1; break; fi
  sleep 1
done
if [ "$OK" != "1" ]; then
  journalctl -u "$SERVICE" -n 30 --no-pager || true
  die "сервис не ответил, лог выше"
fi
rm -rf "$APP_DIR/app.old"
printf '\n\033[32mГотово.\033[0m Сайт: http://%s:%s\n' "$(public_ip)" "$PORT"
echo "Демо-вход: student@spectr.school / spectr-student, admin@spectr.school / spectr-admin"
echo "Логи: journalctl -u $SERVICE -f    Перезапуск: systemctl restart $SERVICE"
