# Base Python image
FROM python:3.12-slim-bookworm

# Install required system packages (FFmpeg, Curl, and Chromium/Puppeteer dependencies)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    gnupg \
    wget \
    ca-certificates \
    libasound2 \
    libatk-bridge2.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js (20.x)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Set Working Directory
WORKDIR /app

# Copy Requirements
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy Backend codebase
COPY backend/ ./backend/

# Copy and initialize Hyperframes Studio
COPY hyperframes_studio/ ./hyperframes_studio/
WORKDIR /app/hyperframes_studio
# Ensure hyperframes is cached and ready without interactive prompts
RUN npx --yes hyperframes init .

# Setup Directories and Permissions
WORKDIR /app
RUN mkdir -p /app/backend/uploads && chmod -R 777 /app/backend/uploads
RUN chmod -R 777 /app/hyperframes_studio

# Set Environment Variables
ENV PYTHONUNBUFFERED=1
ENV PORT=8000
# Note: Puppeteer downloads its own Chromium during `npx hyperframes render`.
# The OS dependencies are provided above so it runs flawlessly.

# Expose Port
EXPOSE 8000

# Start FastAPI using uvicorn from backend directory
WORKDIR /app/backend
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port $PORT"]
