# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Commands

### Development
```bash
# Install dependencies
npm install

# Build the project (builds both CLI and UI)
npm run build

# Build only the UI
cd ui && npm run build
```

### Service Management
```bash
# Start the router server in background
ccr start

# Stop the router server
ccr stop

# Restart the server
ccr restart

# Check server status
ccr status
```

### Usage
```bash
# Run Claude Code through the router
ccr code "<your prompt>"

# Interactive model selection and configuration
ccr model

# Open web UI (starts service if not running)
ccr ui

# Set up environment variables for shell integration
eval "$(ccr activate)"
```

### Testing & Release
```bash
# Build and publish (requires appropriate npm permissions)
npm run release
```

## Architecture

### High-Level Overview
Claude Code Router is a **proxy server** that sits between Claude Code and various LLM providers. It routes requests to different models based on configurable rules and transforms request/response formats to ensure compatibility across providers.

**Core Flow**: Claude Code → CCR Server → Router → Provider-specific Transformer → LLM API → Response Transform → Claude Code

### Key Components

#### 1. Entry Points
- **CLI (`src/cli.ts`)**: Main command-line interface handling all `ccr` commands
- **Server (`src/index.ts`)**: Initializes and runs the Fastify-based server
- **Server Definition (`src/server.ts`)**: Defines HTTP endpoints and API routes

#### 2. Configuration System
- **Location**: `~/.claude-code-router/config.json`
- **Structure**: Contains Providers (API endpoints, models, transformers) and Router (routing rules)
- **Environment Variables**: Supports `$VAR_NAME` or `${VAR_NAME}` interpolation for secure credential management
- **Project-Specific Config**: Can have per-project overrides in `~/.claude-code-router/<project>/config.json`

#### 3. Router (`src/utils/router.ts`)
The router determines which provider/model combination to use:
- **Default Routes**: `default`, `background`, `think`, `longContext`, `webSearch`, `image`
- **Dynamic Switching**: Uses `/model provider,model` command in Claude Code
- **Long Context Detection**: Automatically switches to long context models when token count exceeds threshold (default: 60,000)
- **Subagent Routing**: Uses `<CCR-SUBAGENT-MODEL>provider,model</CCR-SUBAGENT-MODEL>` tags in system prompts
- **Custom Routers**: Supports custom JavaScript router files in `~/.claude-code-router/routers/` via `CUSTOM_ROUTER_PATH` config

#### 4. Transformers
Transformers adapt requests/responses for different provider APIs. Located in `@musistudio/llms` package:
- **Built-in**: `anthropic`, `deepseek`, `gemini`, `openrouter`, `groq`, `tooluse`, `maxtoken`, `reasoning`, `sampling`, `enhancetool`, `cleancache`, `vertex-gemini`
- **Custom**: Load via `transformers` array in config with `path` and `options`
- **Application**:
  - **Global**: Applied to all models in a provider
  - **Model-Specific**: Applied only to specific models
  - **With Options**: Pass configuration using nested array format: `["transformer", {options}]`

#### 5. Authentication Middleware (`src/middleware/auth.ts`)
- API key validation via `Authorization: Bearer <key>` or `x-api-key` header
- Only enforced when `APIKEY` is set in config
- If `APIKEY` is not set, `HOST` is forced to `127.0.0.1` for security

#### 6. Agents System (`src/agents/`)
Built-in agents that extend functionality:
- **Image Agent**: Handles image-related tasks
- **Agent Manager**: Registers and manages agents, consolidates tools
- Agents can provide custom tools that are injected into requests

#### 7. Session Management (`src/utils/cache.ts`)
- **Usage Tracking**: Tracks token usage per session with LRU cache
- **Budget Tracking** (`src/utils/budgetTracker.ts`): Monitors daily/monthly budgets
- **Session Cache**: Stores usage data to help with long context routing decisions

#### 8. Logging System
Two separate logging systems:
- **Server Logs**: HTTP/API calls via pino in `~/.claude-code-router/logs/ccr-*.log`
- **Application Logs**: Business logic in `~/.claude-code-router/claude-code-router.log`
- **LLM Request Logs**: Request/response logging in `~/.claude-code-router/logs/llm-requests.jsonl`
- **Log Sanitizer** (`src/utils/logSanitizer.ts`): Removes sensitive data from logs

#### 9. SSE Streaming
- **SSE Parser** (`src/utils/SSEParser.transform.ts`): Parses Server-Sent Events streams
- **SSE Serializer** (`src/utils/SSESerializer.transform.ts`): Serializes responses back to SSE format
- **Stream Rewriter** (`src/utils/rewriteStream.ts`): Modifies streaming responses in flight

#### 10. Web UI (`ui/`)
- **Stack**: React + TypeScript + Vite + TailwindCSS + Monaco Editor
- **Features**: Config editor, log viewer, activity monitor, budget manager, provider/model management
- **Build**: Compiled to single `dist/index.html` and served at `/ui/` endpoint
- **Security**: Requires API key if configured

### Key Design Patterns

#### Provider Configuration Pattern
```json
{
  "name": "provider-name",
  "api_base_url": "https://api.example.com/v1/chat/completions",
  "api_key": "$API_KEY_ENV_VAR",
  "models": ["model-1", "model-2"],
  "transformer": {
    "use": ["global-transformer"],
    "model-1": {
      "use": [["transformer-with-options", {"option": "value"}]]
    }
  }
}
```

#### Router Configuration Pattern
```json
{
  "default": "provider,model",
  "background": "provider,smaller-model",
  "think": "provider,reasoning-model",
  "longContext": "provider,long-context-model",
  "longContextThreshold": 60000,
  "webSearch": "provider,web-enabled-model",
  "image": "provider,vision-model"
}
```

### Process Management
- **PID File**: `~/.claude-code-router/.claude-code-router.pid`
- **Graceful Shutdown**: Handles SIGINT, SIGTERM, SIGHUP, SIGQUIT
- **Auto-start**: `ccr code` and `ccr ui` auto-start service if not running
- **Service Check** (`src/utils/processCheck.ts`): Validates service is running and responsive

### Security Considerations
- **API Key Auth**: Optional but recommended for non-localhost deployments
- **Host Binding**: Forced to `127.0.0.1` when no API key is set
- **Port Validation**: Restricts to 1024-65535 range
- **Path Traversal Protection**: Validates log file paths and custom router paths
- **Rate Limiting**: 100 requests per minute (configurable via Fastify middleware)
- **Config Validation**: Strict validation of all config fields before applying
- **Allowed Directories**: Custom routers must be in `~/.claude-code-router/routers/`

### Token Counting
Uses `tiktoken` (cl100k_base encoding) to calculate token counts for:
- Messages (text, tool_use, tool_result content)
- System prompts
- Tool definitions
Used for routing decisions (long context detection) and budget tracking

### Dependencies
- **@musistudio/llms**: Core LLM abstraction library (built on Fastify)
- **fastify**: High-performance web server
- **tiktoken**: Token counting
- **rotating-file-stream**: Log rotation
- **inquirer**: Interactive CLI prompts
- **esbuild**: Bundler for distribution

## Project-Specific Notes

### Building
- Build bundles both CLI (`src/cli.ts`) and UI (`ui/`)
- Copies `tiktoken_bg.wasm` to dist for token counting
- UI is built as single-file HTML for easy distribution
- Output is in `dist/` directory with `cli.js` as entry point

### Configuration File Locations
- **User Config**: `~/.claude-code-router/config.json`
- **Claude Config**: `~/.claude.json` (auto-initialized by CCR)
- **Project Configs**: `~/.claude-code-router/<project>/config.json`
- **Session Configs**: `~/.claude-code-router/<project>/<session-id>.json`

### NON_INTERACTIVE_MODE
When running in CI/CD (GitHub Actions, Docker), set `NON_INTERACTIVE_MODE: true` to:
- Set `CI=true` environment variable
- Configure `FORCE_COLOR=0`
- Adjust stdin handling to prevent process hanging

### Status Line Integration
CCR includes a statusline tool for monitoring:
- Usage: `echo '<json>' | ccr statusline`
- Displays current model, provider, token usage, budget status
- Can be integrated into shell prompts

### 无论如何都不能自动提交git
Never automatically commit to git under any circumstances.
