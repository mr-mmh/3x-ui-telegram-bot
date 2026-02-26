FROM oven/bun:1.3.5 AS base

WORKDIR /app

COPY package.json bun.lock ./


FROM base AS deps

RUN bun install --frozen-lockfile
COPY prisma ./prisma/
RUN bunx prisma generate

FROM base AS production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY --from=deps /app/generated/prisma ./generated/prisma
COPY . .
CMD ["bun", "run", "start"]
