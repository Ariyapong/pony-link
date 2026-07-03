# ---- build: install workspace deps, build the SPA ----
FROM oven/bun:1 AS build
WORKDIR /repo
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN bun install --frozen-lockfile
COPY apps ./apps
RUN cd apps/web && bun run build   # emits apps/api/public/app

# ---- runtime: api + baked SPA only ----
FROM oven/bun:1-slim
WORKDIR /repo
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/api ./apps/api
WORKDIR /repo/apps/api
ENV NODE_ENV=production
EXPOSE 3000
CMD ["bun", "src/index.ts"]
