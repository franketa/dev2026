FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy source code
COPY . .

# Create data directory
RUN mkdir -p /app/data/uploads

# Environment
ENV PORT=3001
ENV DATA_DIR=/app/data

# Expose port
EXPOSE 3001

# Start server
CMD ["node", "server.js"]
