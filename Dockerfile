# Auld World: the game and its online relay in one small container (no npm dependencies).
#   docker build -t auld-world .  &&  docker run -p 8080:8080 auld-world   then open http://localhost:8080
FROM node:22-alpine
WORKDIR /app
COPY . .
ENV PORT=8080 NODE_ENV=production
EXPOSE 8080
USER node
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" >/dev/null || exit 1
CMD ["node", "relay.js"]
