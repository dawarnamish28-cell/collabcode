FROM node:20-bullseye-slim

# Install all language runtimes needed for local code execution
RUN apt-get update -qq && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      gfortran \
      nasm \
      lua5.4 \
      tclsh \
      gawk \
      sqlite3 \
      php-cli \
      r-base \
      g++ \
      gcc \
      python3 \
      perl \
      ruby \
      bash \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Verify installs
RUN gfortran --version | head -1 && \
    nasm -v && \
    lua5.4 -v && \
    tclsh <(echo "puts [info patchlevel]; exit") 2>/dev/null || true && \
    awk 'BEGIN{print "awk ok"}' && \
    sqlite3 --version && \
    php --version | head -1 && \
    echo "All runtimes installed"

WORKDIR /app

# Copy server package files and install Node deps
COPY server/package*.json ./
RUN npm install --omit=dev --ignore-scripts

# Copy server source
COPY server/ ./

EXPOSE 10000

CMD ["node", "server.js"]
