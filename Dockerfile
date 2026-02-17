FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# Production image
FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

COPY --from=builder /app/dist ./dist

# Create data directory for SQLite
RUN mkdir -p /app/data

# Create non-root user
RUN groupadd -g 1001 premiarr && \
    useradd -u 1001 -g premiarr premiarr && \
    chown -R premiarr:premiarr /app/data

USER premiarr

CMD ["node", "dist/index.js"]
