# Usar uma imagem base leve do Node.js
FROM node:18-alpine

# Definir o diretório de trabalho dentro do container
WORKDIR /app

# Copiar arquivos do servidor
COPY server/package*.json ./
RUN npm ci --omit=dev

COPY server/server.js ./
COPY server/public/ ./public/

# Expor a porta padrão do servidor
EXPOSE 4040

# Definir variáveis de ambiente padrão (podem ser sobrescritas no Coolify)
ENV PORT=4040
ENV NODE_ENV=production

# Comando para iniciar o servidor
CMD ["node", "server.js"]

