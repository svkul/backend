# syntax=docker/dockerfile:1
# Pnpm version comes from package.json "packageManager" (Corepack).
ARG NODE_VERSION=20

FROM node:${NODE_VERSION}-bookworm-slim AS base
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

FROM base AS builder
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && corepack prepare --activate
COPY prisma.config.ts ./
COPY prisma ./prisma/
COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src/
RUN pnpm install --frozen-lockfile
RUN pnpm run build

FROM base AS runner
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && corepack prepare --activate
COPY prisma.config.ts ./
COPY prisma ./prisma/
COPY --from=builder /app/dist ./dist
RUN pnpm install --frozen-lockfile --prod
EXPOSE 3000
CMD ["pnpm", "run", "start:prod"]
