FROM node:20-slim
WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig.json drizzle.config.ts ./
COPY src/ ./src/
RUN npx tsc
RUN npm prune --omit=dev
HEALTHCHECK --interval=5s --timeout=3s CMD wget -q --spider http://localhost:4000/api/health || exit 1
CMD ["node", "dist/index.js"]
