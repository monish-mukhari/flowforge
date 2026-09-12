FROM node:20-bookworm-slim AS build

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps ./apps
COPY packages ./packages
COPY turbo.json ./turbo.json

RUN npm ci --no-audit --no-fund
RUN npm run generate --workspace=@repo/db

ARG NEXT_PUBLIC_BACKEND_URL=http://localhost:3002
ARG NEXT_PUBLIC_HOOKS_URL=http://localhost:3001/hooks/catch
ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL
ENV NEXT_PUBLIC_HOOKS_URL=$NEXT_PUBLIC_HOOKS_URL
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY --from=build /app /app
ENV NODE_ENV=production
