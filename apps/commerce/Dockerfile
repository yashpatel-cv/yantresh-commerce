FROM node:24-alpine AS build

WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}

RUN corepack enable

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @yantresh/commerce build
# pnpm node_modules are symlinks into the workspace store; deploy makes a self-contained prod copy.
RUN pnpm --filter @yantresh/commerce deploy --prod --legacy /out \
 && cp -r apps/commerce/.medusa/server/. /out/

FROM node:24-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /out ./

EXPOSE 9000

CMD ["node_modules/.bin/medusa", "start"]
