/**
 * LLM Request/Response Logger
 *
 * Logs all LLM provider requests and responses in JSON Lines format
 * for later analysis with tools like DuckDB
 */

import { createWriteStream, WriteStream, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { HOME_DIR } from '../constants';
import { sanitizeLogData } from './logSanitizer';
import { budgetTracker } from './budgetTracker';
import type { FastifyRequest, FastifyReply } from 'fastify';

interface LLMRequestLog {
  timestamp: string;
  reqId: string;
  sessionId?: string;
  type: 'request' | 'response' | 'error';
  provider?: string;
  model?: string;
  requestBody?: any;
  responseBody?: any;
  error?: any;
  duration?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

class LLMRequestLogger {
  private logStream: WriteStream | null = null;
  private logDir: string;
  private logFile: string;

  constructor() {
    this.logDir = join(HOME_DIR, 'logs');
    this.logFile = join(this.logDir, 'llm-requests.jsonl');
    this.initializeStream();
  }

  private initializeStream() {
    try {
      // Ensure log directory exists
      if (!existsSync(this.logDir)) {
        mkdirSync(this.logDir, { recursive: true });
      }

      // Create append stream for JSON Lines format
      this.logStream = createWriteStream(this.logFile, {
        flags: 'a', // append mode
        encoding: 'utf8'
      });

      this.logStream.on('error', (error) => {
        console.error('LLM Request Logger stream error:', error);
      });
    } catch (error) {
      console.error('Failed to initialize LLM request logger:', error);
    }
  }

  /**
   * Logs an LLM request
   */
  logRequest(req: FastifyRequest, provider?: string, model?: string) {
    try {
      const reqId = (req as any).id || 'unknown';
      const sessionId = (req as any).sessionId;

      const logEntry: LLMRequestLog = {
        timestamp: new Date().toISOString(),
        reqId,
        sessionId,
        type: 'request',
        provider,
        model,
        requestBody: sanitizeLogData(req.body),
      };

      this.writeLog(logEntry);
    } catch (error) {
      console.error('Failed to log LLM request:', error);
    }
  }

  /**
   * Logs an LLM response
   */
  logResponse(
    req: FastifyRequest,
    responseBody: any,
    duration: number,
    provider?: string,
    model?: string
  ) {
    try {
      const reqId = (req as any).id || 'unknown';
      const sessionId = (req as any).sessionId;

      // Extract usage information if available
      const usage = responseBody?.usage ? {
        input_tokens: responseBody.usage.input_tokens,
        output_tokens: responseBody.usage.output_tokens,
      } : undefined;

      const logEntry: LLMRequestLog = {
        timestamp: new Date().toISOString(),
        reqId,
        sessionId,
        type: 'response',
        provider,
        model,
        responseBody: sanitizeLogData(responseBody),
        duration,
        usage,
      };

      this.writeLog(logEntry);

      // Record usage for budget tracking
      if (usage && model) {
        budgetTracker.recordUsage(
          model,
          usage.input_tokens || 0,
          usage.output_tokens || 0
        );
      }
    } catch (error) {
      console.error('Failed to log LLM response:', error);
    }
  }

  /**
   * Logs an LLM request error
   */
  logError(req: FastifyRequest, error: any, provider?: string, model?: string) {
    try {
      const reqId = (req as any).id || 'unknown';
      const sessionId = (req as any).sessionId;

      const logEntry: LLMRequestLog = {
        timestamp: new Date().toISOString(),
        reqId,
        sessionId,
        type: 'error',
        provider,
        model,
        error: sanitizeLogData({
          message: error.message || error,
          stack: error.stack,
        }),
      };

      this.writeLog(logEntry);
    } catch (err) {
      console.error('Failed to log LLM error:', err);
    }
  }

  /**
   * Writes a log entry in JSON Lines format
   */
  private writeLog(entry: LLMRequestLog) {
    if (!this.logStream) {
      console.warn('LLM logger stream not initialized');
      return;
    }

    try {
      // Write as a single line of JSON followed by newline (JSON Lines format)
      const logLine = JSON.stringify(entry) + '\n';
      this.logStream.write(logLine);
    } catch (error) {
      console.error('Failed to write LLM log entry:', error);
    }
  }

  /**
   * Closes the log stream (for cleanup)
   */
  close() {
    if (this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }
  }
}

// Export singleton instance
export const llmRequestLogger = new LLMRequestLogger();
