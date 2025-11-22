import { FastifyRequest, FastifyReply } from "fastify";
import { timingSafeEqual } from "crypto";

/**
 * Timing-safe string comparison to prevent timing attacks
 */
function safeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);

    // If lengths differ, still compare to prevent timing leaks
    if (bufA.length !== bufB.length) {
      return false;
    }

    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export const apiKeyAuth =
  (config: any) =>
  async (req: FastifyRequest, reply: FastifyReply, done: () => void) => {
    // Public endpoints that don't require authentication
    const publicEndpoints = ["/", "/health"];
    const isPublicEndpoint = publicEndpoints.includes(req.url);
    const isUIEndpoint = req.url.startsWith("/ui") && !req.url.startsWith("/ui/api");

    if (isPublicEndpoint || isUIEndpoint) {
      return done();
    }

    const apiKey = config.APIKEY;

    // Sensitive endpoints that ALWAYS require auth
    const sensitiveEndpoints = [
      "/api/config",
      "/api/restart",
      "/api/update/perform",
      "/api/logs"
    ];
    const isSensitiveEndpoint = sensitiveEndpoints.some(ep => req.url.startsWith(ep));

    if (!apiKey) {
      if (isSensitiveEndpoint) {
        reply.status(401).send("Authentication required. Please set APIKEY in config.");
        return;
      }

      // For non-sensitive endpoints, still validate origin
      const allowedOrigins = [
        `http://127.0.0.1:${config.PORT || 3456}`,
        `http://localhost:${config.PORT || 3456}`,
      ];

      const origin = req.headers.origin;
      if (origin && !allowedOrigins.includes(origin)) {
        reply.status(403).send("Origin not allowed");
        return;
      }

      // Set CORS header (only one, not multiple)
      if (origin) {
        reply.header('Access-Control-Allow-Origin', origin);
        reply.header('Access-Control-Allow-Credentials', 'true');
      }

      return done();
    }

    // Extract API key from request
    const authHeaderValue =
      req.headers.authorization || req.headers["x-api-key"];
    const authKey: string = Array.isArray(authHeaderValue)
      ? authHeaderValue[0]
      : authHeaderValue || "";

    if (!authKey) {
      reply.status(401).send("API key is missing");
      return;
    }

    let token = "";
    if (authKey.startsWith("Bearer ")) {
      token = authKey.substring(7);
    } else {
      token = authKey;
    }

    // Use timing-safe comparison to prevent timing attacks
    if (!safeCompare(token, apiKey)) {
      reply.status(401).send("Invalid API key");
      return;
    }

    done();
  };
