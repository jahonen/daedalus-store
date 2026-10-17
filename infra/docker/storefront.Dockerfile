# DAEDALUS storefront — Next.js 16 standalone on Cloud Run (europe-north1).
# Build context: repo root.

FROM node:22-slim AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/storefront/package.json apps/storefront/
COPY packages/shared/package.json packages/shared/
COPY services/functions/package.json services/functions/
# Install only the workspaces the storefront needs (plus root devDeps for build).
RUN npm ci --no-audit --no-fund
COPY packages/shared packages/shared
COPY tsconfig.base.json .
COPY apps/storefront apps/storefront
# No ADC inside docker build — short-circuit Firestore reads to fallbacks.
ENV NEXT_PRIVATE_SKIP_FIRESTORE=1
RUN npm run build -w @daedalus/shared && npm run build -w @daedalus/storefront

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=8080
COPY --from=build /repo/apps/storefront/.next/standalone ./
COPY --from=build /repo/apps/storefront/.next/static ./apps/storefront/.next/static
COPY --from=build /repo/apps/storefront/public ./apps/storefront/public
EXPOSE 8080
CMD ["node", "apps/storefront/server.js"]
