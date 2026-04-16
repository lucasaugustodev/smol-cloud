FROM node:20-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc
CMD ["node", "dist/index.js"]
