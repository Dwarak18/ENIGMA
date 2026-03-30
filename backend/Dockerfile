# ══════════════════════════════════════════════════════════════════════════
# ENIGMA Backend – Python FastAPI
# ══════════════════════════════════════════════════════════════════════════

FROM python:3.11-slim

LABEL org.opencontainers.image.title="enigma-backend" \
      org.opencontainers.image.description="ENIGMA entropy verification and AES encryption backend with FastAPI"

# Install system dependencies (for OpenCV and psycopg2)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    libpq-dev \
    libopencv-dev \
    python3-opencv \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Create virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install Python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY app ./app

# Non-root user for security
RUN useradd -m -u 1000 enigma && chown -R enigma:enigma /app
USER enigma

EXPOSE 8000

# Healthcheck
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://127.0.0.1:8000/health').raise_for_status()" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
