FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc
HEALTHCHECK --interval=5s --timeout=3s CMD wget -q --spider http://localhost:4000/api/health || exit 1
CMD ["node", "dist/index.js"]
