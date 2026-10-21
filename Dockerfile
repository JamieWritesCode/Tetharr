# The packages the server needs at runtime, shared by the dev and production images
FROM node:24.21.0-alpine3.24 AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev

# Development: dev/compose.yml mounts the source in, and the server restarts whenever anything in it changes. Watching
# the folder rather than each file also catches editors that save by replacing the file
FROM deps AS dev
CMD ["node", "--watch-path=src", "--inspect=0.0.0.0:9229", "src/server/index.ts"]

# Build the web interface. It comes out the same on every architecture, so it's built on the machine's own one rather
# than emulated when building for another
FROM --platform=$BUILDPLATFORM node:24.21.0-alpine3.24 AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
RUN npm run build

# Production: run the server straight from its TypeScript source, serving the built interface, as the PUID and PGID
# user rather than root (see entrypoint.sh)
FROM deps
RUN apk add --no-cache su-exec
ENV NODE_ENV=production TETHARR_DB=/config/tetharr.db PORT=8787
COPY entrypoint.sh /entrypoint.sh
COPY src/server src/server
COPY src/schemas src/schemas
COPY --from=build /app/dist dist
VOLUME /config
EXPOSE 8787
HEALTHCHECK --interval=60s --timeout=5s CMD wget -qO- http://127.0.0.1:8787/api/health || exit 1
ENTRYPOINT ["/bin/sh", "/entrypoint.sh"]
CMD ["node", "src/server/index.ts"]
