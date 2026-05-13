FROM node:24.15.0-bookworm-slim AS base

WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod 0755 /usr/local/bin/docker-entrypoint.sh

FROM base AS deps

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --include=dev

FROM deps AS builder

COPY . .

RUN npx prisma generate
RUN npm run build

FROM base AS runtime

COPY --from=builder --chown=node:node /app /app

USER node

EXPOSE 3000

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "run", "start"]

FROM runtime AS migrate

CMD ["npx", "prisma", "migrate", "deploy"]
