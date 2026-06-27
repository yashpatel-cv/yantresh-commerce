FROM node:24-alpine AS build

WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}

RUN corepack enable

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @yantresh/storefront build

FROM node:24-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/apps/storefront/.next/standalone ./
COPY --from=build /app/apps/storefront/.next/static ./apps/storefront/.next/static

EXPOSE 3000

CMD ["node", "server.js"]
