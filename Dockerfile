# syntax=docker/dockerfile:1

# Debian slim (not alpine) — puppeteer/sharp need glibc, and apt gives us a
# real `chromium` package with all its shared-library dependencies pulled in
# automatically, which alpine's musl/chromium combo is notoriously flaky for.

# ---------- deps: install node_modules once, cached across builds ----------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
# Skip puppeteer's own ~300MB Chromium download at install time — the
# runtime stage installs a system `chromium` via apt instead (smaller, and
# reuses Debian's own dependency resolution instead of puppeteer's).
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY package.json package-lock.json ./
RUN npm ci

# ---------- builder: compile the Next.js app ----------
FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build-time env (DB host, SMTP, etc.) isn't needed here — `next build`
# only needs to compile; real env vars are supplied at container run time.
RUN npm run build

# ---------- runner: minimal image that actually serves the app ----------
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Chromium is used for warranty-certificate PDF-to-PNG rendering
# (lib/warrantyPdfRender.js) — --no-sandbox is already passed by that code,
# which is required when running as root inside a container.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/scripts ./scripts

# Uploaded files (contracts, invoices, logos) — mount this as a volume in
# docker-compose so they survive container recreation/redeploys.
RUN mkdir -p /app/uploads

EXPOSE 3011
CMD ["npm", "run", "start"]
