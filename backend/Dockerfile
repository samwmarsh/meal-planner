FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./

# Development — hot reload via node --watch
FROM base AS development
RUN npm install
COPY . .
EXPOSE 5000
CMD ["node", "--watch", "src/server.js"]

# Production
FROM base AS production
RUN npm ci --omit=dev
COPY . .
EXPOSE 5000
CMD ["node", "src/server.js"]
