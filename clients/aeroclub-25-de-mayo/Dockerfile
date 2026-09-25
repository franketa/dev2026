FROM node:22-slim
WORKDIR /app
ENV TZ=America/Argentina/Buenos_Aires
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p data
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "server/index.js"]
