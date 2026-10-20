FROM node:20-alpine
WORKDIR /app
COPY package.json mcp-server.js notify.js ./
CMD ["node", "mcp-server.js"]
