# ── ENIGMA Firmware Simulator ─────────────────────────────────────────────
# Lightweight Python image; only needs requests + cryptography
FROM python:3.11-slim

WORKDIR /sim

ENV PIP_NO_CACHE_DIR=1 \
	PIP_DISABLE_PIP_VERSION_CHECK=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY simulate.py .

CMD ["python", "-u", "simulate.py"]
