FROM oven/bun:1.4.4

WORKDIR /app

COPY package.json bun.lock tsconfig.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN bun install --frozen-lockfile

COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts

ENV NODE_ENV=production
EXPOSE 3000

USER bun

CMD ["bun", "run", "start:api"]
