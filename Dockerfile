# Auld World: one image for the api (server/api.js, the default command) and every hourly match (server/match.js, the command the api
# gives each match's Job). No npm packages: Node's own modules only. Built for linux/arm64 (the AWS t4g server) and linux/amd64 by CI.
#   docker build --build-arg VERSION=1.0.0 -t auld-world .
#   docker run -p 8080:8080 -e AUTH_DEV=1 auld-world        then open http://localhost:8080 (test sign-in on, everything in memory)
FROM node:22.20.0-alpine3.22
ARG VERSION=dev
LABEL org.opencontainers.image.title="Auld World" org.opencontainers.image.source="https://github.com/graemewales13/strategygame" org.opencontainers.image.version="${VERSION}"
# the base system's latest fixes; and no package managers: nothing is installed at run time, and npm, yarn and corepack bring their own
# libraries (and their vulnerabilities) for nothing
RUN apk upgrade --no-cache \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /opt/yarn-* /usr/local/bin/yarn /usr/local/bin/yarnpkg
WORKDIR /app
ENV NODE_ENV=production PORT=8080 AULD_VERSION=${VERSION}
# only what is served or run: the game's files and the servers (no tests, tools, notes or deployment files; see .dockerignore)
COPY package.json index.html style.css ./
COPY js ./js
COPY data ./data
COPY assets ./assets
COPY server ./server
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" >/dev/null || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server/api.js"]
