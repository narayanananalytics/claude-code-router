# Groq API Setup Guide

## ✅ What Was Added

Groq has been successfully added to your claude-code-router configuration!

### Configuration Summary

**Provider**: Groq
**API Endpoint**: `https://api.groq.com/openai/v1/chat/completions`
**Transformer**: `groq`

### Available Models

1. **llama-3.3-70b-versatile** - Latest Llama 3.3 70B model (recommended)
2. **llama-3.1-70b-versatile** - Llama 3.1 70B for general tasks
3. **llama-3.1-8b-instant** - Fast 8B model for quick responses
4. **mixtral-8x7b-32768** - Mixtral with 32K context window
5. **gemma2-9b-it** - Google's Gemma 2 9B instruction-tuned

### Router Configuration

Groq is now configured for:
- **Background Tasks**: `llama-3.1-8b-instant` (ultra-fast, free tier friendly)
- **Long Context**: `llama-3.3-70b-versatile` (128K context window)

---

## 🚀 Quick Setup

### Step 1: Get Your Groq API Key

1. Go to [https://console.groq.com/](https://console.groq.com/)
2. Sign up or log in
3. Navigate to **API Keys** section
4. Click **Create API Key**
5. Copy your key (starts with `gsk_...`)

### Step 2: Set the API Key

Edit your `~/.bashrc`:
```bash
nano ~/.bashrc

# Find this line and replace with your actual key:
export GROQ_API_KEY='gsk_...'  # Your actual Groq API key

# Save and reload
source ~/.bashrc
```

### Step 3: Verify

```bash
# Check the environment variable is set
echo $GROQ_API_KEY

# Should show your key, not empty
```

### Step 4: Restart Router

```bash
ccr restart
```

---

## 🎯 Why Groq?

### Advantages

✅ **Extremely Fast**: Groq's LPU™ inference is significantly faster than GPU-based inference
✅ **Free Tier**: Generous free tier for testing and development
✅ **Open Source Models**: Access to Llama, Mixtral, and Gemma models
✅ **Low Latency**: Sub-second response times for most queries
✅ **Large Context**: Up to 128K tokens for llama-3.3-70b

### Best Use Cases

- **Background Tasks**: Use `llama-3.1-8b-instant` for non-critical tasks
- **Cost-Effective Alternative**: Save money on simple queries
- **Speed-Critical Apps**: When response time matters more than quality
- **Long Context**: Use `llama-3.3-70b-versatile` for document analysis

---

## 📊 Model Comparison

| Model | Speed | Quality | Context | Best For |
|-------|-------|---------|---------|----------|
| llama-3.3-70b-versatile | ⚡⚡⚡ | ⭐⭐⭐⭐ | 128K | Complex tasks, long context |
| llama-3.1-70b-versatile | ⚡⚡⚡ | ⭐⭐⭐⭐ | 128K | General purpose |
| llama-3.1-8b-instant | ⚡⚡⚡⚡⚡ | ⭐⭐⭐ | 128K | Background, quick tasks |
| mixtral-8x7b-32768 | ⚡⚡⚡ | ⭐⭐⭐⭐ | 32K | Code generation |
| gemma2-9b-it | ⚡⚡⚡⚡ | ⭐⭐⭐ | 8K | Simple instructions |

---

## 🧪 Testing Groq

### Test Background Model

```bash
# This should use Groq's llama-3.1-8b-instant (super fast!)
ccr code "Count to 10"
```

### Test Long Context Model

```bash
# For large contexts (>60K tokens), Groq's llama-3.3-70b will be used
ccr code "Analyze this large document: [paste large text]"
```

### Force Specific Groq Model

```bash
ccr code "/model groq,llama-3.3-70b-versatile
Explain quantum computing"
```

---

## 💡 Cost Optimization Tips

### Recommended Routing Strategy

```json
"Router": {
  "default": "anthropic,claude-3-5-sonnet-20241022",  // Best quality
  "background": "groq,llama-3.1-8b-instant",          // Free/cheap & fast
  "think": "anthropic,claude-opus-4-20250514",        // Premium reasoning
  "longContext": "groq,llama-3.3-70b-versatile"       // Free long context
}
```

### When to Use Groq

✅ **Use Groq for**:
- Simple queries (translations, summaries)
- Code formatting/linting
- Background processing
- Non-critical tasks
- Long documents that don't need premium reasoning

❌ **Don't Use Groq for**:
- Complex reasoning requiring Claude's capabilities
- Tasks requiring tool use (Groq has limited tool support)
- Mission-critical production code
- Tasks requiring specific Claude features

---

## 🔧 Advanced Configuration

### Custom Routing Based on Task

Create a custom router at `~/.claude-code-router/routers/groq-optimizer.js`:

```javascript
module.exports = async function router(req, config) {
  const userMessage = req.body.messages.find(m => m.role === "user")?.content;
  
  // Simple tasks -> Groq's fast model
  if (userMessage && (
    userMessage.includes("translate") ||
    userMessage.includes("count") ||
    userMessage.includes("list") ||
    userMessage.length < 200  // Short queries
  )) {
    return "groq,llama-3.1-8b-instant";
  }
  
  // Code generation -> Mixtral
  if (userMessage && (
    userMessage.includes("write code") ||
    userMessage.includes("function") ||
    userMessage.includes("class")
  )) {
    return "groq,mixtral-8x7b-32768";
  }
  
  // Long documents -> Groq's 70B
  if (req.tokenCount && req.tokenCount > 50000) {
    return "groq,llama-3.3-70b-versatile";
  }
  
  // Default to Claude for everything else
  return null;
};
```

Enable in config:
```json
{
  "CUSTOM_ROUTER_PATH": "/home/nara/.claude-code-router/routers/groq-optimizer.js"
}
```

### Per-Model Timeout

Groq is very fast, so you might want shorter timeouts:

```json
{
  "API_TIMEOUT_MS": 30000  // 30 seconds instead of 600
}
```

---

## 📈 Rate Limits & Free Tier

### Groq Free Tier (as of 2025)

- **Requests Per Day**: Generous (check current limits)
- **Requests Per Minute**: 30
- **Tokens Per Minute**: 14,400 for 70B models

**Tip**: The free tier is usually sufficient for development and testing!

### Handling Rate Limits

If you hit rate limits, the router will automatically fall back to your default provider (Anthropic).

---

## 🐛 Troubleshooting

### "Invalid API Key"

```bash
# Check if key is set
echo $GROQ_API_KEY

# Should show: gsk_...

# If empty, reload bashrc
source ~/.bashrc
```

### "Rate Limit Exceeded"

- Wait a minute and try again
- Consider upgrading to Groq's paid tier
- Adjust routing to use Groq less frequently

### "Model Not Found"

Make sure model names match exactly:
- ✅ `llama-3.3-70b-versatile`
- ❌ `llama-3.3-70b` (missing "-versatile")

### Check Groq Status

```bash
# Test Groq API directly
curl https://api.groq.com/openai/v1/models \
  -H "Authorization: Bearer $GROQ_API_KEY"
```

---

## 🎓 Next Steps

1. **Get Your API Key**: [https://console.groq.com/keys](https://console.groq.com/keys)
2. **Set the Environment Variable**: Edit `~/.bashrc`
3. **Reload Environment**: `source ~/.bashrc`
4. **Restart Router**: `ccr restart`
5. **Test**: `ccr code "Say hello"`

---

## 📚 Additional Resources

- **Groq Console**: [https://console.groq.com/](https://console.groq.com/)
- **Groq Documentation**: [https://console.groq.com/docs](https://console.groq.com/docs)
- **Model Playground**: [https://groq.com/](https://groq.com/)
- **Speed Benchmarks**: Groq is typically 10-20x faster than traditional GPU inference

---

## 💰 Cost Comparison

For 1M tokens:

| Provider | Model | Cost |
|----------|-------|------|
| Anthropic | Claude 3.5 Sonnet | ~$3-15 |
| Groq (Free) | Llama 3.3 70B | $0 (with limits) |
| Groq (Paid) | Llama 3.3 70B | ~$0.50-1.00 |

**Savings**: Using Groq for background tasks can reduce your LLM costs by 50-80%!

---

**Ready to use Groq? Set your API key and enjoy ultra-fast, cost-effective LLM inference!** ⚡
