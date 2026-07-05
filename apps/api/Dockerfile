FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json tsconfig.json ./
COPY packages/packages/ ./packages/
COPY apps/api/ ./apps/api/
COPY packages/database/ ./packages/database/
COPY packages/shared/ ./packages/shared/

RUN npm install --legacy-peer-deps
RUN npx prisma generate --schema=packages/database/prisma/schema.prisma
RUN npm run build --workspace=packages/database
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=apps/api

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api ./apps/api
COPY package*.json ./
EXPOSE 5001
CMD ["node", "apps/api/dist/apps/api/src/main.js"]
