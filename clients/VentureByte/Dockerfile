FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

# Uploads y datos del tracker se persisten aquí. Si querés que
# sobrevivan redeploys, montá volúmenes en Coolify a /app/uploads
# y /app/data
RUN mkdir -p /app/uploads /app/data

ENV NODE_ENV=production
# PORT lo define Coolify en runtime (suele inyectar 80). Si no lo
# define, server.js cae a 3000.
EXPOSE 80
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD wget -qO- "http://localhost:${PORT:-3000}/healthz" || exit 1

CMD ["node", "server.js"]
