# syntax=docker/dockerfile:1

# ── 1. Build the Next.js site (apps/web) as static files ─────────────────────
FROM node:22-alpine AS web
WORKDIR /web
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY apps/web/ ./
ARG NEXT_PUBLIC_REPO_URL=""
ARG NEXT_PUBLIC_SITE_URL="http://localhost:8000"
ENV NEXT_PUBLIC_REPO_URL=$NEXT_PUBLIC_REPO_URL NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── 2. The FastAPI service (apps/api), which also serves the exported site ───
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 APP_ENV=production
WORKDIR /app
COPY apps/api/requirements.txt apps/api/requirements.txt
RUN pip install --no-cache-dir -r apps/api/requirements.txt
COPY apps/api/app apps/api/app
COPY apps/api/examples apps/api/examples
COPY --from=web /web/out apps/web/out
WORKDIR /app/apps/api
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
