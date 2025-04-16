# Use Node.js LTS (18.x) slim image for a smaller footprint
FROM node:18-slim

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json (if exists) to install dependencies
COPY package*.json ./

# Install dependencies
RUN npm install

# Install PostgreSQL client for database connectivity
RUN apt-get update && apt-get install -y postgresql-client && rm -rf /var/lib/apt/lists/*

# Copy application code
COPY . .

# Expose port (will be set via .env)
EXPOSE ${PORT:-3000}

# Command to start the server
CMD ["node", "server.js"]