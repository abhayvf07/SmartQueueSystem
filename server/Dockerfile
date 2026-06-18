# ──────────────────────────────────────────────
# Smart Queue Management System — Backend Image
# ──────────────────────────────────────────────
FROM node:18-alpine

# Set working directory
WORKDIR /app

# ── Dependency layer (cached until package files change) ──
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── Application source ──
COPY . .

# Create logs directory (required by winston logger)
RUN mkdir -p logs && chown -R node:node /app

# Run as non-root for security
USER node

# Expose the backend server port
EXPOSE 5000

# Start the server
CMD ["node", "src/index.js"]
