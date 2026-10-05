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

echo "==> Whisper (распознавание речи): сборка под процессор сервера"
[ -s "$AI/whisper/ggml-base.bin" ] || { mkdir -p "$AI/whisper"; sudo -u "$OWNER" curl -sSfL -o "$AI/whisper/ggml-base.bin" https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin; }
if [ ! -x "$AI/whisper-src/build/bin/whisper-server" ]; then
  [ -d "$AI/whisper-src" ] || sudo -u "$OWNER" git clone -q --depth 1 https://github.com/ggml-org/whisper.cpp "$AI/whisper-src"
  docker run --rm --cpus 2 -v "$AI/whisper-src:/src" -w /src ubuntu:24.04 bash -c "apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq build-essential cmake >/dev/null && cmake -B build -DGGML_NATIVE=ON -DBUILD_SHARED_LIBS=OFF -DWHISPER_BUILD_TESTS=OFF -DCMAKE_BUILD_TYPE=Release >/dev/null && cmake --build build -j2 --target whisper-server whisper-cli >/dev/null"
  chown -R "$OWNER:$OWNER" "$AI/whisper-src"
fi
cat > /etc/systemd/system/spectr-stt.service <<EOF
[Unit]
Description=Spectr STT (whisper.cpp)
After=network.target

[Service]
User=$OWNER
WorkingDirectory=$AI
ExecStart=$AI/whisper-src/build/bin/whisper-server -m $AI/whisper/ggml-base.bin --host 127.0.0.1 --port 8092 -t 2
Restart=always
RestartSec=3
MemoryMax=600M

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now spectr-stt
systemctl restart spectr-stt

echo "==> llama.cpp"
docker pull -q ghcr.io/ggml-org/llama.cpp:server >/dev/null
docker rm -f spectr-llm >/dev/null 2>&1 || true
# лимит с запасом: если модели тесно, система выгружает её куски на диск, и ответы «лагают»
docker run -d --name spectr-llm --restart unless-stopped \
  -p 127.0.0.1:8090:8080 --memory 3300m --cpus 2 \
  -v "$AI/models:/models:ro" \
  ghcr.io/ggml-org/llama.cpp:server \
  -m "/models/$MODEL" -c 18432 -t 2 --parallel 6 -ctk q8_0 -ctv q8_0 --flash-attn on --host 0.0.0.0 --port 8080 >/dev/null
# 6 слотов: у каждого помощника (Лина, Матвей, Фотон, Байт, разговорная практика) своя закешированная подсказка

# сайту — адреса нейросетей
ENV=/opt/spectr-school/.env
grep -q '^LLM_URL=' "$ENV" || echo 'LLM_URL="http://127.0.0.1:8090"' >> "$ENV"
grep -q '^TTS_URL=' "$ENV" || echo 'TTS_URL="http://127.0.0.1:8091"' >> "$ENV"
grep -q '^TTS_CACHE=' "$ENV" || echo "TTS_CACHE=\"$AI/tts-cache\"" >> "$ENV"
grep -q '^STT_URL=' "$ENV" || echo 'STT_URL="http://127.0.0.1:8092"' >> "$ENV"
# корневой сертификат Минцифры — нужен для GigaChat (если в .env добавить GIGACHAT_KEY)
[ -s "$AI/russian_trusted_root_ca.pem" ] || curl -sSfL -o "$AI/russian_trusted_root_ca.pem" https://gu-st.ru/content/lending/russian_trusted_root_ca_pem.crt || true
[ -s "$AI/russian_trusted_root_ca.pem" ] && { grep -q '^NODE_EXTRA_CA_CERTS=' "$ENV" || echo "NODE_EXTRA_CA_CERTS=\"$AI/russian_trusted_root_ca.pem\"" >> "$ENV"; }
systemctl restart spectr-school
echo "Готово: озвучка на 127.0.0.1:8091, чат на 127.0.0.1:8090"
