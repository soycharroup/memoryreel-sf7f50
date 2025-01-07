# Stage 1: Build stage
FROM node:18-alpine AS builder

# Set environment variables
ENV NODE_ENV=production \
    VITE_API_URL=/api \
    VITE_TV_PLATFORM=true

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git

# Set working directory
WORKDIR /app

# Copy package files for layer caching
COPY src/web/package*.json ./

# Install production dependencies
RUN npm ci --only=production --no-audit \
    && npm cache clean --force

# Copy source code and configuration files
COPY src/web/tsconfig*.json ./
COPY src/web/vite.config.ts ./
COPY src/web/src ./src
COPY src/web/public ./public

# Build production bundle
RUN npm run build

# Stage 2: Production stage
FROM nginx:1.24-alpine

# Create non-root user for nginx
RUN adduser -D -H -u 101 -s /sbin/nologin nginx-user

# Copy nginx configuration
COPY infrastructure/docker/web/nginx.conf /etc/nginx/nginx.conf
COPY infrastructure/docker/web/default.conf /etc/nginx/conf.d/default.conf

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Set up security headers and gzip configuration
RUN echo 'add_header X-Frame-Options "SAMEORIGIN";' > /etc/nginx/conf.d/security-headers.conf \
    && echo 'add_header X-Content-Type-Options "nosniff";' >> /etc/nginx/conf.d/security-headers.conf \
    && echo 'add_header X-XSS-Protection "1; mode=block";' >> /etc/nginx/conf.d/security-headers.conf \
    && echo 'add_header Content-Security-Policy "default-src '\''self'\''; script-src '\''self'\'' '\''unsafe-inline'\'' '\''unsafe-eval'\''; style-src '\''self'\'' '\''unsafe-inline'\''; img-src '\''self'\'' data: https:; font-src '\''self'\'' data:; connect-src '\''self'\'' https:;";' >> /etc/nginx/conf.d/security-headers.conf \
    && echo 'add_header Strict-Transport-Security "max-age=31536000; includeSubDomains";' >> /etc/nginx/conf.d/security-headers.conf

# Configure gzip compression
RUN echo 'gzip on;' > /etc/nginx/conf.d/gzip.conf \
    && echo 'gzip_vary on;' >> /etc/nginx/conf.d/gzip.conf \
    && echo 'gzip_min_length 10240;' >> /etc/nginx/conf.d/gzip.conf \
    && echo 'gzip_proxied expired no-cache no-store private auth;' >> /etc/nginx/conf.d/gzip.conf \
    && echo 'gzip_types text/plain text/css text/xml text/javascript application/javascript application/x-javascript application/xml application/json;' >> /etc/nginx/conf.d/gzip.conf \
    && echo 'gzip_disable "MSIE [1-6]\.";' >> /etc/nginx/conf.d/gzip.conf

# Set up cache control for static assets
RUN echo 'location ~* \.(jpg|jpeg|png|gif|ico|css|js|woff2)$ {' > /etc/nginx/conf.d/cache-control.conf \
    && echo '    expires 1y;' >> /etc/nginx/conf.d/cache-control.conf \
    && echo '    add_header Cache-Control "public, no-transform";' >> /etc/nginx/conf.d/cache-control.conf \
    && echo '}' >> /etc/nginx/conf.d/cache-control.conf

# Create health check endpoint
RUN echo 'location /health {' > /etc/nginx/conf.d/health-check.conf \
    && echo '    access_log off;' >> /etc/nginx/conf.d/health-check.conf \
    && echo '    return 200 "healthy\n";' >> /etc/nginx/conf.d/health-check.conf \
    && echo '}' >> /etc/nginx/conf.d/health-check.conf

# Set permissions
RUN chown -R nginx-user:nginx-user /usr/share/nginx/html \
    && chmod -R 755 /usr/share/nginx/html \
    && chown -R nginx-user:nginx-user /var/cache/nginx \
    && chown -R nginx-user:nginx-user /var/log/nginx \
    && chown -R nginx-user:nginx-user /etc/nginx/conf.d \
    && touch /var/run/nginx.pid \
    && chown -R nginx-user:nginx-user /var/run/nginx.pid

# Switch to non-root user
USER nginx-user

# Expose port
EXPOSE 80

# Configure health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:80/health || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]