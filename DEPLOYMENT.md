# Claude Code Router - Deployment Guide

## Prerequisites

- Node.js 18+ installed
- npm or yarn package manager
- Git (if deploying from repository)

## Option 1: Install from Source

### 1. Clone and Build

```bash
# Clone the repository
git clone <repository-url>
cd claude-code-router

# Install dependencies
npm install

# Build the project
npm run build
```

### 2. Install Globally

```bash
# Install as global package
npm install -g .

# Or link for development
npm link
```

### 3. Verify Installation

```bash
# Check if ccr command is available
ccr --version

# Check help
ccr --help
```

## Option 2: Install from npm (When Published)

```bash
# Install globally
npm install -g @musistudio/claude-code-router

# Verify
ccr --version
```

## Configuration Setup

### 1. Create Configuration File

The router will automatically create a default config on first run at:
`~/.claude-code-router/config.json`

Or manually create it:

```bash
mkdir -p ~/.claude-code-router
cat > ~/.claude-code-router/config.json << 'EOF'
{
  "PORT": 3456,
  "APIKEY": "your-secure-api-key-here",
  "Providers": [
    {
      "name": "anthropic",
      "api_base_url": "https://api.anthropic.com",
      "api_key": "${ANTHROPIC_API_KEY}",
      "models": ["claude-sonnet-4", "claude-opus-4", "claude-haiku-4"]
    },
    {
      "name": "openai",
      "api_base_url": "https://api.openai.com/v1",
      "api_key": "${OPENAI_API_KEY}",
      "models": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"]
    }
  ],
  "Router": {
    "default": "anthropic,claude-sonnet-4",
    "background": "anthropic,claude-haiku-4",
    "think": "anthropic,claude-opus-4",
    "longContext": "anthropic,claude-sonnet-4",
    "longContextThreshold": 60000
  }
}
EOF
```

### 2. Set Environment Variables

```bash
# Add to ~/.bashrc or ~/.zshrc
export ANTHROPIC_API_KEY="your-anthropic-key"
export OPENAI_API_KEY="your-openai-key"

# Reload shell
source ~/.bashrc  # or source ~/.zshrc
```

### 3. Configure Budget Limits (Optional)

Create budget configuration:

```bash
cat > ~/.claude-code-router/budget.json << 'EOF'
{
  "daily": {
    "tokens": 1000000,
    "requests": 1000,
    "estimatedCost": 10.00
  },
  "monthly": {
    "tokens": 30000000,
    "requests": 30000,
    "estimatedCost": 300.00
  }
}
EOF
```

## Starting the Service

### Background Mode (Recommended)

```bash
# Start in background
ccr start

# Check status
ccr status

# Stop service
ccr stop
```

### Foreground Mode (For Debugging)

```bash
# Start with logging
ccr start --foreground

# Or with verbose logging
LOG_LEVEL=debug ccr start --foreground
```

## Accessing the UI

Once the service is running:

1. **Open Web UI**: `http://localhost:3456/ui`
2. **Login**: Use the APIKEY from your config.json

### UI Features

- **⚙️ Settings**: Configure providers, routing, transformers
- **📝 JSON Editor**: Direct config.json editing
- **📄 Log Viewer**: View application logs
- **📊 Activity**: View LLM request/response logs
- **💵 Budget Manager**: Configure and monitor budgets

## Using Claude Code Through the Router

```bash
# Use Claude Code with routing
ccr code "Your prompt here"

# Or if Claude Code is already installed
claude --api-url http://localhost:3456 "Your prompt here"
```

## Verify Deployment

### 1. Test Health Endpoint

```bash
curl http://localhost:3456/health
```

### 2. Test API Access

```bash
# Test with API key
curl -H "X-API-Key: your-api-key" http://localhost:3456/api/config
```

### 3. Check Logs

```bash
# View logs
ls -la ~/.claude-code-router/logs/

# Check LLM request logs
cat ~/.claude-code-router/logs/llm-requests.jsonl

# Check budget usage
cat ~/.claude-code-router/budget-usage.json
```

## Production Deployment

### 1. Use Process Manager (pm2)

```bash
# Install pm2
npm install -g pm2

# Create ecosystem file
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'claude-code-router',
    script: 'ccr',
    args: 'start --foreground',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3456
    }
  }]
}
EOF

# Start with pm2
pm2 start ecosystem.config.js

# Save process list
pm2 save

# Setup startup script
pm2 startup
```

### 2. Use systemd (Linux)

```bash
# Create service file
sudo cat > /etc/systemd/system/claude-code-router.service << 'EOF'
[Unit]
Description=Claude Code Router
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/home/your-username
Environment="PATH=/usr/local/bin:/usr/bin:/bin"
Environment="ANTHROPIC_API_KEY=your-key"
ExecStart=/usr/local/bin/ccr start --foreground
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Enable and start
sudo systemctl enable claude-code-router
sudo systemctl start claude-code-router

# Check status
sudo systemctl status claude-code-router

# View logs
sudo journalctl -u claude-code-router -f
```

### 3. Docker Deployment

```bash
# Create Dockerfile
cat > Dockerfile << 'EOF'
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy built files
COPY dist/ ./dist/
COPY ui/dist/ ./ui/dist/

# Expose port
EXPOSE 3456

# Start service
CMD ["node", "dist/cli.js", "start", "--foreground"]
EOF

# Build image
docker build -t claude-code-router .

# Run container
docker run -d \
  --name claude-code-router \
  -p 3456:3456 \
  -v ~/.claude-code-router:/root/.claude-code-router \
  -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  -e OPENAI_API_KEY=$OPENAI_API_KEY \
  claude-code-router

# Check logs
docker logs -f claude-code-router
```

## Reverse Proxy Setup (Optional)

### Nginx

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3456;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### Caddy

```
your-domain.com {
    reverse_proxy localhost:3456
}
```

## Security Considerations

### 1. API Key Protection

```bash
# Generate strong API key
export APIKEY=$(openssl rand -hex 32)

# Add to config
echo "Set APIKEY in ~/.claude-code-router/config.json"
```

### 2. Firewall Rules

```bash
# Allow only localhost (most secure)
# In config.json, set HOST: "127.0.0.1"

# Or allow specific IPs
sudo ufw allow from 192.168.1.0/24 to any port 3456
```

### 3. HTTPS Setup

Use reverse proxy (nginx/caddy) with Let's Encrypt for HTTPS.

## Monitoring & Maintenance

### View Logs

```bash
# Application logs
tail -f ~/.claude-code-router/logs/ccr-*.log

# LLM request logs
tail -f ~/.claude-code-router/logs/llm-requests.jsonl

# Budget usage
cat ~/.claude-code-router/budget-usage.json | jq
```

### Backup Configuration

```bash
# Backup script
#!/bin/bash
BACKUP_DIR=~/claude-code-router-backups
mkdir -p $BACKUP_DIR
DATE=$(date +%Y%m%d_%H%M%S)

tar -czf $BACKUP_DIR/ccr-backup-$DATE.tar.gz \
  ~/.claude-code-router/config.json \
  ~/.claude-code-router/budget.json \
  ~/.claude-code-router/budget-usage.json

# Keep only last 7 backups
ls -t $BACKUP_DIR/ccr-backup-*.tar.gz | tail -n +8 | xargs rm -f
```

### Update/Upgrade

```bash
# Pull latest changes
git pull origin main

# Rebuild
npm run build

# Restart service
ccr stop
ccr start

# Or with pm2
pm2 restart claude-code-router
```

## Troubleshooting

### Service Won't Start

```bash
# Check if port is in use
lsof -i :3456

# Check logs
cat ~/.claude-code-router/logs/ccr-*.log

# Try with verbose logging
LOG_LEVEL=debug ccr start --foreground
```

### UI Not Accessible

```bash
# Verify service is running
ccr status

# Check if UI files exist
ls -la ~/.claude-code-router/dist/

# Test directly
curl http://localhost:3456/ui/
```

### API Key Issues

```bash
# Verify API key in config
cat ~/.claude-code-router/config.json | jq .APIKEY

# Test API access
curl -H "X-API-Key: your-key" http://localhost:3456/api/config
```

### Budget Not Tracking

```bash
# Check budget file exists
ls -la ~/.claude-code-router/budget*.json

# Check LLM request logs
tail ~/.claude-code-router/logs/llm-requests.jsonl

# Verify budget tracker is recording
curl http://localhost:3456/api/budget/usage
```

## Support

For issues and questions:
- GitHub Issues: [repository-url]/issues
- Documentation: [repository-url]/README.md
- Logs: `~/.claude-code-router/logs/`

## Environment Variables Reference

```bash
# Core Settings
PORT=3456                    # Server port
HOST=127.0.0.1              # Server host
APIKEY=your-key             # Admin API key

# Provider API Keys
ANTHROPIC_API_KEY=sk-...    # Anthropic Claude
OPENAI_API_KEY=sk-...       # OpenAI GPT
GROQ_API_KEY=...            # Groq
GEMINI_API_KEY=...          # Google Gemini

# Optional Settings
LOG_LEVEL=info              # Log level (debug, info, warn, error)
NODE_ENV=production         # Environment
CLAUDE_PATH=/path/to/claude # Custom Claude path
```

## Quick Reference

```bash
# Start/Stop
ccr start          # Start service
ccr stop           # Stop service
ccr restart        # Restart service
ccr status         # Check status

# Usage
ccr code "prompt"  # Run Claude Code through router

# UI Access
http://localhost:3456/ui  # Web interface

# Logs
~/.claude-code-router/logs/            # All logs
~/.claude-code-router/logs/llm-requests.jsonl  # LLM logs
~/.claude-code-router/budget-usage.json        # Budget usage
```
