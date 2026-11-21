FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM build AS production-dependencies
RUN npm prune --omit=dev --ignore-scripts

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN mkdir -p /var/lib/tempel && chown node:node /var/lib/tempel
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=production-dependencies /app/node_modules ./node_modules
# next start loads next.config.ts again during startup.
COPY --from=build /app/node_modules/typescript ./node_modules/typescript
COPY --from=build /app/next.config.ts /app/package.json /app/tsconfig.json ./
USER node
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0"]
