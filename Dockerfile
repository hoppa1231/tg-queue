# --- build stage ---
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build    # <= тут появится /app/dist

# --- runtime stage ---
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY package*.json ./
RUN npm ci --omit=dev
COPY server.js ./server.js

# ВАЖНО: копируем dist из предыдущего слоя, а не из контекста
COPY --from=build /app/dist ./dist

EXPOSE 3000
CMD ["node", "server.js"]
