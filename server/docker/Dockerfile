FROM node:22-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY docker/package.json ./
RUN npm install

COPY docker/tsconfig.json ./
COPY docker/src ./src
COPY shared /shared
COPY shared ./shared

RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app

RUN apk add --no-cache python3 make g++

ENV NODE_ENV=production
ENV PORT=29988
ENV DB_PATH=/data/narciph_rbac.db
ENV JWT_SECRET=narciph_docker_production_jwt_secret_secure_key

COPY docker/package.json ./
RUN npm install --omit=dev && \
    apk del python3 make g++

COPY --from=builder /app/dist ./dist
COPY shared/schema.sql ./schema.sql
COPY shared/schema.sql /app/schema.sql

EXPOSE 29988
VOLUME ["/data"]

CMD ["node", "dist/index.js"]
