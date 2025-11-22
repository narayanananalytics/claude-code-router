import Server from "@musistudio/llms";
import { readConfigFile, writeConfigFile, backupConfigFile } from "./utils";
import { checkForUpdates, performUpdate } from "./utils";
import { join, normalize, isAbsolute, relative } from "path";
import fastifyStatic from "@fastify/static";
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from "fs";
import { homedir } from "os";
import {calculateTokenCount} from "./utils/router";

/**
 * Validates configuration object structure and values
 * @param config - The configuration object to validate
 * @returns Validation result with any errors
 */
function validateConfig(config: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate PORT
  if (config.PORT !== undefined) {
    if (typeof config.PORT !== 'number' || config.PORT < 1024 || config.PORT > 65535) {
      errors.push('PORT must be a number between 1024 and 65535');
    }
  }

  // Validate HOST
  if (config.HOST !== undefined) {
    if (typeof config.HOST !== 'string') {
      errors.push('HOST must be a string');
    } else {
      // Validate it's a valid IP or hostname
      const validHost = /^(localhost|[\d.]+|[\w.-]+)$/.test(config.HOST);
      if (!validHost) {
        errors.push('HOST must be a valid hostname or IP address');
      }
    }
  }

  // Validate APIKEY
  if (config.APIKEY !== undefined && typeof config.APIKEY !== 'string') {
    errors.push('APIKEY must be a string');
  }

  // Validate Providers array
  if (config.Providers !== undefined) {
    if (!Array.isArray(config.Providers)) {
      errors.push('Providers must be an array');
    } else {
      config.Providers.forEach((provider: any, index: number) => {
        if (!provider.name || typeof provider.name !== 'string') {
          errors.push(`Provider[${index}] must have a name (string)`);
        }
        if (!provider.api_base_url || typeof provider.api_base_url !== 'string') {
          errors.push(`Provider[${index}] must have an api_base_url (string)`);
        } else {
          // Validate URL format
          try {
            new URL(provider.api_base_url);
          } catch {
            errors.push(`Provider[${index}] api_base_url must be a valid URL`);
          }
        }
        if (!Array.isArray(provider.models)) {
          errors.push(`Provider[${index}] must have models array`);
        }
        if (provider.api_key !== undefined && typeof provider.api_key !== 'string') {
          errors.push(`Provider[${index}] api_key must be a string`);
        }
      });
    }
  }

  // Validate Router
  if (config.Router !== undefined) {
    if (typeof config.Router !== 'object' || Array.isArray(config.Router)) {
      errors.push('Router must be an object');
    } else {
      // Validate router model strings
      const routerKeys = ['default', 'background', 'think', 'longContext', 'webSearch'];
      routerKeys.forEach(key => {
        if (config.Router[key] !== undefined && typeof config.Router[key] !== 'string') {
          errors.push(`Router.${key} must be a string`);
        }
      });

      // Validate longContextThreshold
      if (config.Router.longContextThreshold !== undefined) {
        if (typeof config.Router.longContextThreshold !== 'number' || config.Router.longContextThreshold < 0) {
          errors.push('Router.longContextThreshold must be a positive number');
        }
      }
    }
  }

  // Validate API_TIMEOUT_MS
  if (config.API_TIMEOUT_MS !== undefined) {
    if (typeof config.API_TIMEOUT_MS !== 'number' || config.API_TIMEOUT_MS < 1000 || config.API_TIMEOUT_MS > 600000) {
      errors.push('API_TIMEOUT_MS must be a number between 1000 and 600000');
    }
  }

  // Validate CUSTOM_ROUTER_PATH
  if (config.CUSTOM_ROUTER_PATH !== undefined) {
    if (typeof config.CUSTOM_ROUTER_PATH !== 'string') {
      errors.push('CUSTOM_ROUTER_PATH must be a string');
    } else if (!config.CUSTOM_ROUTER_PATH.endsWith('.js')) {
      errors.push('CUSTOM_ROUTER_PATH must end with .js');
    }
  }

  // Validate CLAUDE_PATH
  if (config.CLAUDE_PATH !== undefined && typeof config.CLAUDE_PATH !== 'string') {
    errors.push('CLAUDE_PATH must be a string');
  }

  // Validate NON_INTERACTIVE_MODE
  if (config.NON_INTERACTIVE_MODE !== undefined && typeof config.NON_INTERACTIVE_MODE !== 'boolean') {
    errors.push('NON_INTERACTIVE_MODE must be a boolean');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validates that a log file path is safe to access
 * Prevents path traversal attacks
 * @param requestedPath - The requested file path (can be null/undefined for default)
 * @returns The validated absolute path or null if invalid
 */
function validateLogFilePath(requestedPath: string | null | undefined): string | null {
  const logDir = join(homedir(), ".claude-code-router", "logs");

  // If no path specified, use default
  if (!requestedPath) {
    return join(logDir, "app.log");
  }

  // Resolve the requested path
  let resolvedPath: string;
  if (isAbsolute(requestedPath)) {
    resolvedPath = normalize(requestedPath);
  } else {
    // If relative, join with log directory
    resolvedPath = normalize(join(logDir, requestedPath));
  }

  // Check if resolved path is within log directory
  const relativePath = relative(logDir, resolvedPath);
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    return null; // Path traversal attempt
  }

  // Only allow .log files
  if (!resolvedPath.endsWith('.log')) {
    return null;
  }

  return resolvedPath;
}

export const createServer = (config: any): Server => {
  const server = new Server(config);

  server.app.post("/v1/messages/count_tokens", async (req, reply) => {
    const {messages, tools, system} = req.body;
    const tokenCount = calculateTokenCount(messages, system, tools);
    return { "input_tokens": tokenCount }
  });

  // Add endpoint to read config.json with access control
  server.app.get("/api/config", async (req, reply) => {
    return await readConfigFile();
  });

  server.app.get("/api/transformers", async () => {
    const transformers =
      server.app._server!.transformerService.getAllTransformers();
    const transformerList = Array.from(transformers.entries()).map(
      ([name, transformer]: any) => ({
        name,
        endpoint: transformer.endPoint || null,
      })
    );
    return { transformers: transformerList };
  });

  // Add endpoint to save config.json with access control
  server.app.post("/api/config", async (req, reply) => {
    const newConfig = req.body;

    // Validate config structure
    const validation = validateConfig(newConfig);
    if (!validation.valid) {
      reply.status(400).send({
        error: "Invalid configuration",
        details: validation.errors
      });
      return;
    }

    // Backup existing config file if it exists
    const backupPath = await backupConfigFile();
    if (backupPath) {
      console.log(`Backed up existing configuration file to ${backupPath}`);
    }

    try {
      await writeConfigFile(newConfig);
      return { success: true, message: "Config saved successfully" };
    } catch (error) {
      reply.status(500).send({
        error: "Failed to save config",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Add endpoint to restart the service with access control
  server.app.post("/api/restart", async (req, reply) => {
    reply.send({ success: true, message: "Service restart initiated" });

    // Restart the service after a short delay to allow response to be sent
    setTimeout(() => {
      const { spawn } = require("child_process");
      spawn(process.execPath, [process.argv[1], "restart"], {
        detached: true,
        stdio: "ignore",
      });
    }, 1000);
  });

  // Register static file serving with caching
  server.app.register(fastifyStatic, {
    root: join(__dirname, "..", "dist"),
    prefix: "/ui/",
    maxAge: "1h",
  });

  // Redirect /ui to /ui/ for proper static file serving
  server.app.get("/ui", async (_, reply) => {
    return reply.redirect("/ui/");
  });

  // 版本检查端点
  server.app.get("/api/update/check", async (req, reply) => {
    try {
      // 获取当前版本
      const currentVersion = require("../package.json").version;
      const { hasUpdate, latestVersion, changelog } = await checkForUpdates(currentVersion);

      return {
        hasUpdate,
        latestVersion: hasUpdate ? latestVersion : undefined,
        changelog: hasUpdate ? changelog : undefined
      };
    } catch (error) {
      console.error("Failed to check for updates:", error);
      reply.status(500).send({ error: "Failed to check for updates" });
    }
  });

  // 执行更新端点
  server.app.post("/api/update/perform", async (req, reply) => {
    try {
      // 只允许完全访问权限的用户执行更新
      const accessLevel = (req as any).accessLevel || "restricted";
      if (accessLevel !== "full") {
        reply.status(403).send("Full access required to perform updates");
        return;
      }

      // 执行更新逻辑
      const result = await performUpdate();

      return result;
    } catch (error) {
      console.error("Failed to perform update:", error);
      reply.status(500).send({ error: "Failed to perform update" });
    }
  });

  // 获取日志文件列表端点
  server.app.get("/api/logs/files", async (req, reply) => {
    try {
      const logDir = join(homedir(), ".claude-code-router", "logs");
      const logFiles: Array<{ name: string; path: string; size: number; lastModified: string }> = [];

      if (existsSync(logDir)) {
        const files = readdirSync(logDir);

        for (const file of files) {
          if (file.endsWith('.log')) {
            const filePath = join(logDir, file);
            const stats = statSync(filePath);

            logFiles.push({
              name: file,
              path: filePath,
              size: stats.size,
              lastModified: stats.mtime.toISOString()
            });
          }
        }

        // 按修改时间倒序排列
        logFiles.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
      }

      return logFiles;
    } catch (error) {
      console.error("Failed to get log files:", error);
      reply.status(500).send({ error: "Failed to get log files" });
    }
  });

  // 获取日志内容端点
  server.app.get("/api/logs", async (req, reply) => {
    try {
      const filePath = (req.query as any).file as string;
      const logFilePath = validateLogFilePath(filePath);

      if (!logFilePath) {
        reply.status(400).send({ error: "Invalid log file path" });
        return;
      }

      if (!existsSync(logFilePath)) {
        return [];
      }

      const logContent = readFileSync(logFilePath, 'utf8');
      const logLines = logContent.split('\n').filter(line => line.trim())

      return logLines;
    } catch (error) {
      console.error("Failed to get logs:", error);
      reply.status(500).send({ error: "Failed to get logs" });
    }
  });

  // 清除日志内容端点
  server.app.delete("/api/logs", async (req, reply) => {
    try {
      const filePath = (req.query as any).file as string;
      const logFilePath = validateLogFilePath(filePath);

      if (!logFilePath) {
        reply.status(400).send({ error: "Invalid log file path" });
        return;
      }

      if (existsSync(logFilePath)) {
        writeFileSync(logFilePath, '', 'utf8');
      }

      return { success: true, message: "Logs cleared successfully" };
    } catch (error) {
      console.error("Failed to clear logs:", error);
      reply.status(500).send({ error: "Failed to clear logs" });
    }
  });

  return server;
};
