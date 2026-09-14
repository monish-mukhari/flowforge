FROM node:20-bookworm-slim AS build

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/hooks/package.json ./apps/hooks/package.json
COPY apps/primary-backend/package.json ./apps/primary-backend/package.json
COPY apps/sweeper/package.json ./apps/sweeper/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/eslint-config/package.json ./packages/eslint-config/package.json
COPY packages/typescript-config/package.json ./packages/typescript-config/package.json
COPY packages/ui/package.json ./packages/ui/package.json
RUN cp package-lock.json apps/web/package-lock.json

RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund --prefer-offline

COPY apps ./apps
COPY packages ./packages
COPY turbo.json ./turbo.json
RUN npm run generate --workspace=@repo/db

ARG NEXT_PUBLIC_HOOKS_URL=http://localhost:3001/hooks/catch
ENV NEXT_PUBLIC_HOOKS_URL=$NEXT_PUBLIC_HOOKS_URL
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY --from=build /app /app
ENV NODE_ENV=production
