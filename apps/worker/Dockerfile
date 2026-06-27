FROM node:24-alpine AS build

WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}

RUN corepack enable

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @yantresh/worker build

FROM node:24-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/apps/worker/dist ./dist

CMD ["node", "dist/index.js"]
