# Claude Code Router - Implementation Guide

## Overview

This guide will help you implement and use claude-code-router to route Claude Code requests to different LLM providers and models.

---

## ✅ What's Already Done

1. ✅ **Project Built**: All code compiled successfully
2. ✅ **Router Installed**: `ccr` command is available globally (v1.0.70)
3. ✅ **Claude Code Installed**: Available at `/home/nara/.local/bin/claude`
4. ✅ **Configuration Created**: Basic config at `~/.claude-code-router/config.json`
5. ✅ **Security Fixes Applied**: All vulnerabilities patched

---

## 🚀 Quick Start (5 minutes)

### Step 1: Set Your API Key

Edit your `~/.bashrc` file and replace the placeholder with your actual Anthropic API key:

```bash
nano ~/.bashrc
# Find this line near the end:
export ANTHROPIC_API_KEY='your-api-key-here'
# Replace with:
export ANTHROPIC_API_KEY='sk-ant-api03-...'  # Your actual key

# Then reload:
source ~/.bashrc
```

**Alternative**: Set it temporarily for testing:
```bash
export ANTHROPIC_API_KEY='sk-ant-api03-...'
```

### Step 2: Start the Router

```bash
ccr start
```

You should see output like:
```
🔐 Admin token for this session: [long-random-token]
✅ Server started successfully
```

### Step 3: Test It Out

```bash
# Simple test
ccr code "Say hello and tell me which model you are"

# Or open the web UI
ccr ui
```

---

## 📋 Configuration Guide

### Current Configuration

Your config is at: `~/.claude-code-router/config.json`

**Current Setup**:
- **Default Model**: Claude 3.5 Sonnet (general tasks)
- **Background Model**: Claude 3.5 Haiku (fast, cheap tasks)
- **Think Model**: Claude Opus 4 (complex reasoning)
- **Long Context**: Claude 3.7 Sonnet (>60K tokens)

### Adding More Providers

You can add other LLM providers. Here are popular options:

#### OpenRouter (Access to Many Models)

Add to your `Providers` array:
```json
{
  "name": "openrouter",
  "api_base_url": "https://openrouter.ai/api/v1/chat/completions",
  "api_key": "$OPENROUTER_API_KEY",
  "models": [
    "anthropic/claude-sonnet-4",
    "google/gemini-2.5-pro-preview",
    "meta-llama/llama-3.3-70b-instruct"
  ],
  "transformer": {
    "use": ["openrouter"]
  }
}
```

Then set the env var:
```bash
export OPENROUTER_API_KEY='sk-or-v1-...'
```

#### DeepSeek (Cost-Effective)

```json
{
  "name": "deepseek",
  "api_base_url": "https://api.deepseek.com/chat/completions",
  "api_key": "$DEEPSEEK_API_KEY",
  "models": ["deepseek-chat", "deepseek-reasoner"],
  "transformer": {
    "use": ["deepseek"],
    "deepseek-chat": {
      "use": ["tooluse"]
    }
  }
}
```

#### Ollama (Local Models)

```json
{
  "name": "ollama",
  "api_base_url": "http://localhost:11434/v1/chat/completions",
  "api_key": "ollama",
  "models": ["qwen2.5-coder:latest", "llama3.2:latest"]
}
```

First install Ollama:
```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen2.5-coder:latest
```

### Updating Router Configuration

After adding providers, update your `Router` section:

```json
"Router": {
  "default": "anthropic,claude-3-5-sonnet-20241022",
  "background": "ollama,qwen2.5-coder:latest",  // Free local model
  "think": "deepseek,deepseek-reasoner",         // Great reasoning, cheap
  "longContext": "openrouter,google/gemini-2.5-pro-preview",
  "longContextThreshold": 60000,
  "webSearch": "openrouter,perplexity/llama-3.1-sonar-large-128k-online"
}
```

**After any config changes, restart**:
```bash
ccr restart
```

---

## 🎯 Usage Examples

### Basic Usage

```bash
# Start the router (only needed once)
ccr start

# Run a command through the router
ccr code "Write a Python function to calculate fibonacci"

# Check router status
ccr status

# Stop the router
ccr stop
```

### Model Selection

```bash
# Use the interactive model selector
ccr model

# Or switch models dynamically
ccr code "/model deepseek,deepseek-chat
Now write me a sorting algorithm"
```

### Using the Web UI

```bash
# Open the web interface
ccr ui
```

Features in the UI:
- Visual config editor with Monaco editor
- Log viewer (application and LLM requests)
- Activity monitor
- Budget tracking
- Provider/model management

### Shell Integration

For permanent activation:
```bash
eval "$(ccr activate)"
```

Add to `~/.bashrc` for persistence:
```bash
echo 'eval "$(ccr activate)"' >> ~/.bashrc
```

This allows you to use `claude` directly instead of `ccr code`.

---

## 🔧 Advanced Configuration

### Environment Variables

The config supports variable interpolation:

```json
{
  "Providers": [
    {
      "name": "custom-provider",
      "api_key": "$MY_CUSTOM_KEY"
    }
  ]
}
```

Whitelisted variables (see `src/utils/index.ts`):
- API Keys: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`, etc.
- System: `HOME`, `USER`, `PORT`, `HOST`
- Proxy: `HTTP_PROXY`, `HTTPS_PROXY`

### Custom Routers

Create advanced routing logic in `~/.claude-code-router/routers/custom-router.js`:

```javascript
module.exports = async function router(req, config) {
  const userMessage = req.body.messages.find(m => m.role === "user")?.content;
  
  // Route based on content
  if (userMessage && userMessage.includes("urgent")) {
    return "anthropic,claude-opus-4-20250514";  // Use fastest/best
  }
  
  if (userMessage && userMessage.includes("translate")) {
    return "deepseek,deepseek-chat";  // Use cheap model for simple tasks
  }
  
  // Use default router
  return null;
};
```

Enable in config:
```json
{
  "CUSTOM_ROUTER_PATH": "/home/nara/.claude-code-router/routers/custom-router.js"
}
```

### Budget Tracking

The router tracks token usage. View in the UI or check logs:

```bash
# View usage logs
cat ~/.claude-code-router/logs/llm-requests.jsonl
```

### Logging Configuration

```json
{
  "LOG": true,
  "LOG_LEVEL": "info"  // Options: fatal, error, warn, info, debug, trace
}
```

Logs are in:
- Application logs: `~/.claude-code-router/claude-code-router.log`
- Server logs: `~/.claude-code-router/logs/ccr-*.log`
- LLM requests: `~/.claude-code-router/logs/llm-requests.jsonl`

---

## 🔒 Security Best Practices

### 1. API Key Management

✅ **DO**:
- Store keys in environment variables
- Use `$VAR_NAME` syntax in config
- Add `.bashrc` to `.gitignore` if tracking dotfiles

❌ **DON'T**:
- Hardcode API keys in `config.json`
- Commit keys to git
- Share config files with keys

### 2. Admin Token

For production or shared systems:
```bash
export ADMIN_TOKEN='your-secure-64-char-random-token'
ccr start
```

The admin token is required for:
- `/api/restart`
- `/api/update/perform`

### 3. Custom Routers

⚠️ **Warning**: Custom routers execute with full process privileges.

Only use custom routers from trusted sources:
```bash
# Review before using
cat ~/.claude-code-router/routers/custom-router.js
```

---

## 🧪 Testing Your Setup

### 1. Basic Connectivity

```bash
ccr start
ccr code "Echo back: Hello World"
```

Expected: Response from the configured model.

### 2. Model Routing

```bash
# Test default model
ccr code "What model are you?"

# Test background model (Haiku should be used for simple tasks)
ccr code "Count to 5"

# Test think model (complex reasoning)
ccr code "Solve this logic puzzle: [puzzle]"
```

### 3. Check Logs

```bash
# Watch live logs
tail -f ~/.claude-code-router/claude-code-router.log

# Check for errors
grep ERROR ~/.claude-code-router/logs/ccr-*.log
```

---

## 🐛 Troubleshooting

### "Service not running"

```bash
ccr start
# If it fails, check logs:
cat ~/.claude-code-router/claude-code-router.log
```

### "Invalid API key"

```bash
# Check if env var is set
echo $ANTHROPIC_API_KEY

# Should show your key, not empty

# Reload environment
source ~/.bashrc
ccr restart
```

### "Failed to parse config"

```bash
# Validate JSON syntax
cat ~/.claude-code-router/config.json | jq .

# If jq not installed:
sudo apt install jq
```

### Port Already in Use

```bash
# Check what's using port 3456
lsof -i :3456

# Change port in config
nano ~/.claude-code-router/config.json
# Update "PORT": 3457

ccr restart
```

---

## 📊 Monitoring Usage

### View Statistics in UI

```bash
ccr ui
# Navigate to Activity tab
```

### Command Line Monitoring

```bash
# Real-time status
ccr statusline

# View request logs
tail -f ~/.claude-code-router/logs/llm-requests.jsonl | jq .
```

---

## 🎓 Next Steps

1. **Add More Providers**: Try DeepSeek, OpenRouter, or local Ollama
2. **Configure Routing**: Optimize which models handle which tasks
3. **Set Up Budget Limits**: Track and limit spending
4. **Explore Transformers**: Customize request/response handling
5. **Create Custom Routers**: Implement advanced routing logic

---

## 📚 Additional Resources

- **Full Documentation**: See `README.md`
- **Security Info**: See `SECURITY_SUMMARY.md`
- **Architecture Details**: See `WARP.md`
- **Example Config**: See `config.example.json`

---

## 🆘 Getting Help

### Check the Logs

Most issues can be diagnosed from logs:
```bash
# Application log
tail -50 ~/.claude-code-router/claude-code-router.log

# Server logs
ls -lt ~/.claude-code-router/logs/ | head -5
cat ~/.claude-code-router/logs/[latest-log-file]
```

### Common Issues

1. **API Key Issues**: Verify environment variables are set
2. **Port Conflicts**: Change PORT in config
3. **Network Issues**: Check proxy settings if behind firewall
4. **Model Not Found**: Ensure model name matches provider's list

---

## ✅ Quick Checklist

Before considering your setup complete:

- [ ] Router installed and `ccr -v` shows version
- [ ] API key(s) set in environment variables
- [ ] Config file created and validated (use `jq`)
- [ ] Router starts successfully (`ccr start`)
- [ ] Can execute a test prompt (`ccr code "test"`)
- [ ] Web UI accessible (`ccr ui`)
- [ ] Logs are being written
- [ ] Understand how to add new providers
- [ ] Know how to restart after config changes

---

**You're all set! Start with `ccr start` and try `ccr code "Hello!"` to begin using your router.**
