# Multi-stage build for Pharmly PMS
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Copy backend package manifests
COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm ci

# Copy source trees
WORKDIR /app
COPY backend ./backend
COPY frontend ./frontend

# Build backend NestJS application
WORKDIR /app/backend
RUN npm run build

# Production runtime stage
FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install production dependencies only
COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm ci --omit=dev

# Copy compiled artifacts, static frontend, and database
WORKDIR /app
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/pharmly.sqlite ./backend/pharmly.sqlite
COPY --from=builder /app/frontend ./frontend

WORKDIR /app/backend

EXPOSE 3000

CMD ["node", "dist/main"]
