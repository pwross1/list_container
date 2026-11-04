FROM node:20-alpine

# Required for compiling better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3000

VOLUME ["/app/data"]

CMD ["node", "server.js"]