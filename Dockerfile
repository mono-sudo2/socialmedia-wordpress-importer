# Stage 1: Builder
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files for dependency installation
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript project
RUN npm run build && \
    ls -la dist/ && \
    test -f dist/src/main.js

# Stage 2: Production
FROM node:20-alpine AS production

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001 -G nodejs && \
    chown nestjs:nodejs /app

USER nestjs

# Copy package files with correct ownership
COPY --chown=nestjs:nodejs package.json package-lock.json ./

# Install production dependencies only (files created with correct ownership)
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled output from builder
COPY --chown=nestjs:nodejs --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/src/main"]
