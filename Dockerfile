# SCALive Quiz Arena — single container (API + Socket.IO + built React app)
FROM node:22-alpine
RUN apk add --no-cache openssl
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
COPY server/prisma server/prisma
RUN npm ci --include=dev

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000
# Applies pending migrations, then starts the server.
CMD ["npm", "start"]
