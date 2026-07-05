FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json tsconfig.json ./
COPY packages/database/ ./packages/database/
COPY packages/shared/ ./packages/shared/
COPY apps/dashboard/ ./apps/dashboard/

RUN npm install --legacy-peer-deps
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=apps/dashboard

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/dashboard ./apps/dashboard
COPY package*.json ./
EXPOSE 3000
CMD ["npm", "run", "start", "--workspace=apps/dashboard"]
