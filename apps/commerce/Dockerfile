FROM node:24-alpine AS build

WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}

RUN corepack enable

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @yantresh/commerce build

FROM node:24-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/apps/commerce/.medusa/server ./
COPY --from=build /app/apps/commerce/node_modules ./node_modules

EXPOSE 9000

CMD ["node", "src/main.js"]
