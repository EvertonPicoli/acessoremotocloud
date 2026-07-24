# Dockerfile para implantação do Servidor no Coolify
FROM node:18-alpine

WORKDIR /app

# Copiar package.json do servidor e instalar dependências
COPY server/package*.json ./
RUN npm ci --omit=dev

# Copiar código fonte e arquivos estáticos do servidor
COPY server/server.js ./
COPY server/public/ ./public/

EXPOSE 4040

ENV PORT=4040
ENV NODE_ENV=production

CMD ["node", "server.js"]
