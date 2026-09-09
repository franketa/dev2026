FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p data uploads/products
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "server/index.js"]
