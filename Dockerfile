# --- build stage ---
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- runtime stage ---
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# если валидируешь initData — пробросишь BOT_TOKEN через compose
COPY package*.json ./
RUN npm ci --omit=dev
COPY server.js ./server.js
COPY dist ./dist
EXPOSE 3000
CMD ["node", "server.js"]
