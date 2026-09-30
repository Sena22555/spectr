# Установка на сервер

Проект ставится в отдельную папку `/opt/spectr-school` и работает как отдельный сервис `spectr-school` на своём порту (по умолчанию 8088). Другие проекты на сервере, nginx и системный Node.js не затрагиваются, поэтому чистить ничего не нужно.

## Способ 1: с вашего компьютера, одной командой

Нужны git, ssh и scp (на Windows подойдёт Git Bash).

```bash
git clone https://github.com/Sena22555/spectr.git && cd spectr
git checkout claude/optimistic-edison-ldty0p
./deploy/deploy.sh avtomatik
```

Пароль спросит ssh. Через 5–10 минут скрипт напишет адрес сайта.

## Способ 2: вручную

```bash
git archive --format=tar.gz -o spectr-src.tar.gz HEAD      # на компьютере, в папке проекта
scp spectr-src.tar.gz deploy/install-server.sh root@31.77.12.134:/tmp/
ssh root@31.77.12.134 "bash /tmp/install-server.sh /tmp/spectr-src.tar.gz 8088"
```

## Что важно знать

- Скрипт сначала показывает занятые порты и папки. Он останавливается, если порт занят или папка `/opt/spectr-school` не пуста, а сервиса `spectr-school` нет.
- Настройки лежат в `/opt/spectr-school/.env` (секрет для входа создаётся случайный), база и фото в `/opt/spectr-school/data`. Повторный запуск обновляет проект и сохраняет данные.
- При первой установке в базу попадают демо-данные (`student@spectr.school` и другие, пароли в README). Перед показом клиентам их надо заменить через админку.
- Если на сервере включён `ufw`, скрипт открывает в нём только порт проекта. Облачный firewall в панели хостинга он не знает: порт откройте там сами, если сайт не открывается снаружи.
- Мини-приложениям Telegram и ВКонтакте нужен HTTPS. Для этого нужны домен и прокси (nginx или Caddy) перед портом 8088, лучше на отдельном поддомене. Существующий сайт на 80/443 при этом не меняется.
- Логи: `journalctl -u spectr-school -f`, перезапуск: `systemctl restart spectr-school`.
- Удаление, если понадобится: `systemctl disable --now spectr-school && rm /etc/systemd/system/spectr-school.service && rm -rf /opt/spectr-school`.
