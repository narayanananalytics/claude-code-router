import { existsSync } from "fs";
import { writeFile } from "fs/promises";
import { homedir } from "os";
import path, { join } from "path";
import { initConfig, initDir, cleanupLogFiles } from "./utils";
import { createServer } from "./server";
import { router } from "./utils/router";
import { apiKeyAuth } from "./middleware/auth";
import { sanitizeHeaders, sanitizeLogData } from "./utils/logSanitizer";
import {
  cleanupPidFile,
  isServiceRunning,
  savePid,
} from "./utils/processCheck";
import { CONFIG_FILE } from "./constants";
import { createStream } from 'rotating-file-stream';
import { HOME_DIR } from "./constants";
import { sessionUsageCache } from "./utils/cache";
import {SSEParserTransform} from "./utils/SSEParser.transform";
import {SSESerializerTransform} from "./utils/SSESerializer.transform";
import {rewriteStream} from "./utils/rewriteStream";
import JSON5 from "json5";
import { IAgent } from "./agents/type";
import agentsManager from "./agents";
import { EventEmitter } from "node:events";
import { llmRequestLogger } from "./utils/llmRequestLogger";

const event = new EventEmitter()

async function initializeClaudeConfig() {
  const homeDir = homedir();
  const configPath = join(homeDir, ".claude.json");
  if (!existsSync(configPath)) {
    const userID = Array.from(
      { length: 64 },
      () => Math.random().toString(16)[2]
    ).join("");
    const configContent = {
      numStartups: 184,
      autoUpdaterStatus: "enabled",
      userID,
      hasCompletedOnboarding: true,
      lastOnboardingVersion: "1.0.17",
      projects: {},
    };
    await writeFile(configPath, JSON.stringify(configContent, null, 2));
  }
}

interface RunOptions {
  port?: number;
}

async function run(options: RunOptions = {}) {
  // Check if service is already running
  const isRunning = await isServiceRunning()
  if (isRunning) {
    console.log("✅ Service is already running in the background.");
    return;
  }

  await initializeClaudeConfig();
  await initDir();
  // Clean up old log files, keeping only the 10 most recent ones
  await cleanupLogFiles();
  const config = await initConfig();


  let HOST = config.HOST || "127.0.0.1";

  if (config.HOST && !config.APIKEY) {
    HOST = "127.0.0.1";
    console.warn("⚠️ API key is not set. HOST is forced to 127.0.0.1.");
  }

  const port = config.PORT || 3456;

  // Validate port to prevent SSRF attacks
  if (typeof port !== 'number' || port < 1024 || port > 65535) {
    console.error(`Invalid PORT: ${port}. Must be between 1024-65535`);
    process.exit(1);
  }

  // Save the PID of the background process
  savePid(process.pid);

  // Setup comprehensive signal handling for graceful shutdown
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGQUIT'] as const;
  let isShuttingDown = false;

  const gracefulShutdown = async (signal: string) => {
    if (isShuttingDown) {
      console.log('Already shutting down...');
      return;
    }

    isShuttingDown = true;
    console.log(`\nReceived ${signal}, starting graceful shutdown...`);

    try {
      // Stop accepting new connections
      if (server && server.app) {
        await server.app.close();
        console.log('Server closed successfully');
      }

      // Clean up PID file
      cleanupPidFile();

      // Clean up reference count file if exists
      const REFERENCE_COUNT_FILE = join(HOME_DIR, '.reference_count');
      if (existsSync(REFERENCE_COUNT_FILE)) {
        const fs = await import('fs');
        fs.unlinkSync(REFERENCE_COUNT_FILE);
      }

      console.log('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  };

  // Register signal handlers
  signals.forEach(signal => {
    process.on(signal, () => gracefulShutdown(signal));
  });

  // Use port from environment variable if set (for background process)
  const servicePort = process.env.SERVICE_PORT
    ? parseInt(process.env.SERVICE_PORT)
    : port;

  // Configure logger based on config settings
  const pad = num => (num > 9 ? "" : "0") + num;
  const generator = (time, index) => {
    if (!time) {
      time = new Date()
    }

    var month = time.getFullYear() + "" + pad(time.getMonth() + 1);
    var day = pad(time.getDate());
    var hour = pad(time.getHours());
    var minute = pad(time.getMinutes());

    return `./logs/ccr-${month}${day}${hour}${minute}${pad(time.getSeconds())}${index ? `_${index}` : ''}.log`;
  };
  const loggerConfig =
    config.LOG !== false
      ? {
          level: config.LOG_LEVEL || "debug",
          stream: createStream(generator, {
            path: HOME_DIR,
            maxFiles: 3,
            interval: "1d",
            compress: false,
            maxSize: "50M"
          }),
        }
      : false;

  const server = createServer({
    jsonPath: CONFIG_FILE,
    initialConfig: {
      // ...config,
      providers: config.Providers || config.providers,
      HOST: HOST,
      PORT: servicePort,
      LOG_FILE: join(
        homedir(),
        ".claude-code-router",
        "claude-code-router.log"
      ),
    },
    logger: loggerConfig,
  });

  // Configure rate limiting to prevent abuse
  const rateLimit = await import('@fastify/rate-limit');
  await server.app.register(rateLimit.default, {
    max: 100, // 100 requests
    timeWindow: '1 minute',
    cache: 10000,
    allowList: ['127.0.0.1', '::1'], // Whitelist localhost
    skipOnError: true,
    keyGenerator: (req: any) => {
      // Use IP address for rate limiting
      return req.headers['x-forwarded-for'] || req.ip || 'unknown';
    },
    errorResponseBuilder: (req: any, context: any) => {
      return {
        code: 429,
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Retry after ${Math.ceil(context.ttl / 1000)} seconds.`,
        retryAfter: Math.ceil(context.ttl / 1000),
      };
    },
    // More restrictive limits for sensitive endpoints
    nameSpace: 'global',
  });

  // Add global error handlers to prevent the service from crashing
  process.on("uncaughtException", (err) => {
    server.logger.error("Uncaught exception:", err);
  });

  process.on("unhandledRejection", (reason, promise) => {
    server.logger.error("Unhandled rejection at:", promise, "reason:", reason);
  });
  // Generate admin token for this session or use environment variable
  const crypto = await import("crypto");
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN || crypto.randomBytes(64).toString('hex');
  
  if (config.LOG !== false) {
    if (process.env.ADMIN_TOKEN) {
      console.log('\n🔐 Using ADMIN_TOKEN from environment variable');
      console.log('Set this as x-admin-token header for admin operations (update/restart)\n');
    } else {
      console.log(`\n🔐 Admin token for this session: ${ADMIN_TOKEN}`);
      console.log('Set this as x-admin-token header for admin operations (update/restart)');
      console.log('Tip: Set ADMIN_TOKEN environment variable to use a persistent token\n');
    }
  }

  // Add async preHandler hook for authentication
  server.addHook("preHandler", async (req, reply) => {
    return new Promise((resolve, reject) => {
      const done = (err?: Error) => {
        if (err) reject(err);
        else resolve();
      };
      // Call the async auth function
      apiKeyAuth(config)(req, reply, done).catch(reject);
    });
  });

  // Add admin access control for critical operations
  server.addHook("preHandler", async (req, reply) => {
    const adminEndpoints = ["/api/update/perform", "/api/restart"];

    if (adminEndpoints.some(ep => req.url.startsWith(ep))) {
      const adminToken = req.headers["x-admin-token"];

      if (!adminToken || adminToken !== ADMIN_TOKEN) {
        reply.status(403).send("Admin access required. Check server logs for admin token.");
        throw new Error('Admin access denied');
      }

      (req as any).accessLevel = "full";
    } else {
      (req as any).accessLevel = "restricted";
    }
  });

  // Add request logging with sanitization
  server.addHook("onRequest", async (req, reply) => {
    if (config.LOG !== false) {
      const sanitizedHeaders = sanitizeHeaders(req.headers as Record<string, any>);
      req.log.debug({
        url: req.url,
        method: req.method,
        headers: sanitizedHeaders,
      }, 'Incoming request');
    }
  });

  // Add response logging with sanitization
  server.addHook("onResponse", async (req, reply) => {
    if (config.LOG !== false) {
      req.log.debug({
        url: req.url,
        method: req.method,
        statusCode: reply.statusCode,
        responseTime: reply.getResponseTime(),
      }, 'Request completed');
    }
  });

  server.addHook("preHandler", async (req, reply) => {
    if (req.url.startsWith("/v1/messages") && !req.url.startsWith("/v1/messages/count_tokens")) {
      const useAgents = []

      for (const agent of agentsManager.getAllAgents()) {
        if (agent.shouldHandle(req, config)) {
          // 设置agent标识
          useAgents.push(agent.name)

          // change request body
          agent.reqHandler(req, config);

          // append agent tools
          if (agent.tools.size) {
            if (!req.body?.tools?.length) {
              req.body.tools = []
            }
            req.body.tools.unshift(...Array.from(agent.tools.values()).map(item => {
              return {
                name: item.name,
                description: item.description,
                input_schema: item.input_schema
              }
            }))
          }
        }
      }

      if (useAgents.length) {
        req.agents = useAgents;
      }
      await router(req, reply, {
        config,
        event
      });

      // Log LLM request after routing is complete
      if (req.body?.model) {
        const [provider, model] = req.body.model.includes(',')
          ? req.body.model.split(',')
          : [undefined, req.body.model];
        llmRequestLogger.logRequest(req, provider, model);
        // Store start time for duration calculation
        (req as any).llmRequestStartTime = Date.now();
      }
    }
  });
  server.addHook("onError", async (request, reply, error) => {
    event.emit('onError', request, reply, error);

    // Log LLM errors
    if (request.url.startsWith("/v1/messages") && !request.url.startsWith("/v1/messages/count_tokens")) {
      const [provider, model] = request.body?.model?.includes(',')
        ? request.body.model.split(',')
        : [undefined, request.body?.model];
      llmRequestLogger.logError(request, error, provider, model);
    }
  })
  server.addHook("onSend", (req, reply, payload, done) => {
    if (req.sessionId && req.url.startsWith("/v1/messages") && !req.url.startsWith("/v1/messages/count_tokens")) {
      if (payload instanceof ReadableStream) {
        if (req.agents) {
          const abortController = new AbortController();
          const eventStream = payload.pipeThrough(new SSEParserTransform())
          let currentAgent: undefined | IAgent;
          let currentToolIndex = -1
          let currentToolName = ''
          let currentToolArgs = ''
          let currentToolId = ''
          const toolMessages: any[] = []
          const assistantMessages: any[] = []
          // 存储Anthropic格式的消息体，区分文本和工具类型
          return done(null, rewriteStream(eventStream, async (data, controller) => {
            try {
              // 检测工具调用开始
              if (data.event === 'content_block_start' && data?.data?.content_block?.name) {
                const agent = req.agents.find((name: string) => agentsManager.getAgent(name)?.tools.get(data.data.content_block.name))
                if (agent) {
                  currentAgent = agentsManager.getAgent(agent)
                  currentToolIndex = data.data.index
                  currentToolName = data.data.content_block.name
                  currentToolId = data.data.content_block.id
                  return undefined;
                }
              }

              // 收集工具参数
              if (currentToolIndex > -1 && data.data.index === currentToolIndex && data.data?.delta?.type === 'input_json_delta') {
                currentToolArgs += data.data?.delta?.partial_json;
                return undefined;
              }

              // 工具调用完成，处理agent调用
              if (currentToolIndex > -1 && data.data.index === currentToolIndex && data.data.type === 'content_block_stop') {
                try {
                  const args = JSON5.parse(currentToolArgs);
                  assistantMessages.push({
                    type: "tool_use",
                    id: currentToolId,
                    name: currentToolName,
                    input: args
                  })
                  const toolResult = await currentAgent?.tools.get(currentToolName)?.handler(args, {
                    req,
                    config
                  });
                  toolMessages.push({
                    "tool_use_id": currentToolId,
                    "type": "tool_result",
                    "content": toolResult
                  })
                  currentAgent = undefined
                  currentToolIndex = -1
                  currentToolName = ''
                  currentToolArgs = ''
                  currentToolId = ''
                } catch (e) {
                  console.log(e);
                }
                return undefined;
              }

              if (data.event === 'message_delta' && toolMessages.length) {
                req.body.messages.push({
                  role: 'assistant',
                  content: assistantMessages
                })
                req.body.messages.push({
                  role: 'user',
                  content: toolMessages
                })
                // Validate port before making request
                const requestPort = config.PORT || 3456;
                if (requestPort < 1024 || requestPort > 65535) {
                  console.error(`Invalid PORT for agent request: ${requestPort}`);
                  return undefined;
                }

                const response = await fetch(`http://127.0.0.1:${requestPort}/v1/messages`, {
                  method: "POST",
                  headers: {
                    'x-api-key': config.APIKEY || '',
                    'content-type': 'application/json',
                  },
                  body: JSON.stringify(req.body),
                  signal: AbortSignal.timeout(30000), // 30 second timeout
                });

                if (!response.ok) {
                  console.error(`Agent request failed: ${response.status}`);
                  return undefined;
                }
                const stream = response.body!.pipeThrough(new SSEParserTransform())
                const reader = stream.getReader()
                while (true) {
                  try {
                    const {value, done} = await reader.read();
                    if (done) {
                      break;
                    }
                    if (['message_start', 'message_stop'].includes(value.event)) {
                      continue
                    }

                    // 检查流是否仍然可写
                    if (!controller.desiredSize) {
                      break;
                    }

                    controller.enqueue(value)
                  }catch (readError: any) {
                    if (readError.name === 'AbortError' || readError.code === 'ERR_STREAM_PREMATURE_CLOSE') {
                      abortController.abort(); // 中止所有相关操作
                      break;
                    }
                    throw readError;
                  }

                }
                return undefined
              }
              return data
            }catch (error: any) {
              console.error('Unexpected error in stream processing:', error);

              // 处理流提前关闭的错误
              if (error.code === 'ERR_STREAM_PREMATURE_CLOSE') {
                abortController.abort();
                return undefined;
              }

              // 其他错误仍然抛出
              throw error;
            }
          }).pipeThrough(new SSESerializerTransform()))
        }

        const [originalStream, clonedStream] = payload.tee();
        const read = async (stream: ReadableStream) => {
          const reader = stream.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              // Process the value if needed
              const dataStr = new TextDecoder().decode(value);
              if (!dataStr.startsWith("event: message_delta")) {
                continue;
              }
              const str = dataStr.slice(27);
              try {
                const message = JSON.parse(str);
                sessionUsageCache.put(req.sessionId, message.usage);
              } catch {}
            }
          } catch (readError: any) {
            if (readError.name === 'AbortError' || readError.code === 'ERR_STREAM_PREMATURE_CLOSE') {
              console.error('Background read stream closed prematurely');
            } else {
              console.error('Error in background stream reading:', readError);
            }
          } finally {
            reader.releaseLock();
          }
        }
        read(clonedStream);
        return done(null, originalStream)
      }
      sessionUsageCache.put(req.sessionId, payload.usage);
      if (typeof payload ==='object') {
        if (payload.error) {
          return done(payload.error, null)
        } else {
          return done(payload, null)
        }
      }
    }
    if (typeof payload ==='object' && payload.error) {
      return done(payload.error, null)
    }
    done(null, payload)
  });
  server.addHook("onSend", async (req, reply, payload) => {
    event.emit('onSend', req, reply, payload);

    // Log LLM response
    if (req.url.startsWith("/v1/messages") && !req.url.startsWith("/v1/messages/count_tokens")) {
      const startTime = (req as any).llmRequestStartTime;
      const duration = startTime ? Date.now() - startTime : undefined;

      const [provider, model] = req.body?.model?.includes(',')
        ? req.body.model.split(',')
        : [undefined, req.body?.model];

      // For streaming responses, we log what we have (usage will be in sessionUsageCache)
      if (payload instanceof ReadableStream) {
        llmRequestLogger.logResponse(req, { stream: true }, duration || 0, provider, model);
      } else if (typeof payload === 'object' && !payload.error) {
        llmRequestLogger.logResponse(req, payload, duration || 0, provider, model);
      }
    }

    return payload;
  })


  server.start();
}

export { run };
// run();
