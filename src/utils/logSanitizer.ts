/**
 * Log sanitization utility to prevent sensitive data from being logged
 */

// Sensitive keys that should be redacted from logs
const SENSITIVE_KEYS = [
  'api_key',
  'apikey',
  'password',
  'secret',
  'token',
  'authorization',
  'x-api-key',
  'x-admin-token',
  'admin_token',
  'auth',
  'bearer',
  'credential',
  'private_key',
  'access_token',
  'refresh_token',
];

// Patterns to detect and redact sensitive values
// All patterns have upper bounds to prevent ReDoS attacks
const SENSITIVE_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,100}/g,         // API keys starting with sk- (bounded)
  /Bearer\s+[a-zA-Z0-9_-]{1,500}/g,  // Bearer tokens (bounded)
  /[a-f0-9]{32,256}/g,               // Long hex strings (bounded)
  /AIza[a-zA-Z0-9_-]{35}/g,          // Google API keys (already bounded)
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, // UUIDs
];

/**
 * Sanitizes a string by redacting sensitive patterns
 * @param str - The string to sanitize
 * @returns Sanitized string with sensitive data redacted
 */
function sanitizeString(str: string): string {
  // Reject excessively long strings to prevent ReDoS
  if (str.length > 100000) {
    return '***REDACTED_OVERSIZED***';
  }

  let sanitized = str;

  // Redact common API key patterns
  SENSITIVE_PATTERNS.forEach(pattern => {
    sanitized = sanitized.replace(pattern, '***REDACTED***');
  });

  return sanitized;
}

/**
 * Sanitizes log data by redacting sensitive information
 * @param data - The data to sanitize (can be any type)
 * @returns Sanitized data safe for logging
 */
export function sanitizeLogData(data: any): any {
  if (typeof data === 'string') {
    return sanitizeString(data);
  }

  if (Array.isArray(data)) {
    return data.map(sanitizeLogData);
  }

  if (data !== null && typeof data === 'object') {
    const sanitized: any = {};

    for (const [key, value] of Object.entries(data)) {
      const keyLower = key.toLowerCase();

      // Check if key is sensitive
      const isSensitiveKey = SENSITIVE_KEYS.some(sk => keyLower.includes(sk));

      if (isSensitiveKey) {
        sanitized[key] = '***REDACTED***';
      } else if (typeof value === 'string') {
        sanitized[key] = sanitizeString(value);
      } else {
        sanitized[key] = sanitizeLogData(value);
      }
    }

    return sanitized;
  }

  return data;
}

/**
 * Creates a sanitized version of request headers safe for logging
 * @param headers - Request headers object
 * @returns Sanitized headers
 */
export function sanitizeHeaders(headers: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(headers)) {
    const keyLower = key.toLowerCase();

    if (SENSITIVE_KEYS.some(sk => keyLower.includes(sk))) {
      sanitized[key] = '***REDACTED***';
    } else if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Sanitizes URL parameters that might contain sensitive data
 * @param url - The URL to sanitize
 * @returns Sanitized URL
 */
export function sanitizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);

    // Redact password if present
    if (urlObj.password) {
      urlObj.password = '***REDACTED***';
    }

    // Redact sensitive query parameters
    urlObj.searchParams.forEach((value, key) => {
      const keyLower = key.toLowerCase();
      if (SENSITIVE_KEYS.some(sk => keyLower.includes(sk))) {
        urlObj.searchParams.set(key, '***REDACTED***');
      }
    });

    return urlObj.toString();
  } catch {
    // If URL parsing fails, just sanitize as string
    return sanitizeString(url);
  }
}
