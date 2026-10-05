#!/usr/bin/env bash
# Нейросети «Спектра» на том же сервере: озвучка (Piper: английский и русские голоса) и чат-помощники (Qwen2.5-3B в llama.cpp).
# Оба сервиса слушают только 127.0.0.1 — снаружи к ним не достучаться, ходит только сайт.
# Запуск (с sudo): bash deploy/install-ai.sh
set -euo pipefail
AI=/opt/spectr-ai
OWNER="${SUDO_USER:-deploy}"
MODEL=qwen2.5-3b-instruct-q4_k_m.gguf
VOICE=en_GB-jenny_dioco-medium

mkdir -p "$AI/models" "$AI/voices" "$AI/tts-cache"
chown -R "$OWNER:$OWNER" "$AI"
# кеш озвучки пишет сам сайт (пользователь spectr-school)
id spectr-school >/dev/null 2>&1 && chown -R spectr-school:spectr-school "$AI/tts-cache"

echo "==> ffmpeg и venv"
DEBIAN_FRONTEND=noninteractive apt-get install -y -q ffmpeg python3-venv >/dev/null

echo "==> модель чата"
[ -s "$AI/models/$MODEL" ] || sudo -u "$OWNER" curl -sSfL -o "$AI/models/$MODEL" "https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/$MODEL"

echo "==> голоса"
for f in "$VOICE.onnx" "$VOICE.onnx.json"; do
  [ -s "$AI/voices/$f" ] || sudo -u "$OWNER" curl -sSfL -o "$AI/voices/$f" "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/jenny_dioco/medium/$f"
done
# русские голоса комментаторов: мужской (Матвей, Фотон, Байт) и женский (Лина)
for v in dmitri irina ruslan denis; do
  for ext in onnx onnx.json; do
    [ -s "$AI/voices/ru_RU-$v-medium.$ext" ] || sudo -u "$OWNER" curl -sSfL -o "$AI/voices/ru_RU-$v-medium.$ext" "https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/$v/medium/ru_RU-$v-medium.$ext"
  done
done

echo "==> Piper"
[ -x "$AI/piper-venv/bin/python" ] || sudo -u "$OWNER" python3 -m venv "$AI/piper-venv"
sudo -u "$OWNER" "$AI/piper-venv/bin/pip" install -q 'piper-tts[http]' flask

cat > /etc/systemd/system/spectr-tts.service <<EOF
[Unit]
Description=Spectr TTS (Piper)
After=network.target

[Service]
User=$OWNER
WorkingDirectory=$AI
ExecStart=$AI/piper-venv/bin/python -m piper.http_server -m $AI/voices/$VOICE.onnx --data-dir $AI/voices --host 127.0.0.1 --port 8091
Restart=always
RestartSec=3
MemoryMax=900M
CPUQuota=100%

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now spectr-tts
systemctl restart spectr-tts

echo "==> llama.cpp"
docker pull -q ghcr.io/ggml-org/llama.cpp:server >/dev/null
docker rm -f spectr-llm >/dev/null 2>&1 || true
docker run -d --name spectr-llm --restart unless-stopped \
  -p 127.0.0.1:8090:8080 --memory 2900m --cpus 2 \
  -v "$AI/models:/models:ro" \
  ghcr.io/ggml-org/llama.cpp:server \
  -m "/models/$MODEL" -c 16384 -t 2 --parallel 4 -ctk q8_0 -ctv q8_0 --flash-attn on --host 0.0.0.0 --port 8080 >/dev/null
# 4 слота: у каждого помощника (Лина, Матвей, Фотон, Байт) своя закешированная шпаргалка

# сайту — адреса нейросетей
ENV=/opt/spectr-school/.env
grep -q '^LLM_URL=' "$ENV" || echo 'LLM_URL="http://127.0.0.1:8090"' >> "$ENV"
grep -q '^TTS_URL=' "$ENV" || echo 'TTS_URL="http://127.0.0.1:8091"' >> "$ENV"
grep -q '^TTS_CACHE=' "$ENV" || echo "TTS_CACHE=\"$AI/tts-cache\"" >> "$ENV"
systemctl restart spectr-school
echo "Готово: озвучка на 127.0.0.1:8091, чат на 127.0.0.1:8090"
