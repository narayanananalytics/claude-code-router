# Security Review - Claude Code Router

## Executive Summary

This security review identifies **8 security issues** ranging from **High** to **Low** severity. The codebase demonstrates good security practices in many areas (timing-safe comparisons, path traversal prevention, rate limiting) but has several critical vulnerabilities that need attention.

**Critical Issues**: 1
**High Severity**: 2
**Medium Severity**: 3
**Low Severity**: 2

---

## 🔴 Critical Issues

### 1. Command Injection via Process Restart (Critical)
**File**: `src/server.ts:240-246`
**Severity**: Critical

```typescript
setTimeout(() => {
  const { spawn } = require("child_process");
  spawn(process.execPath, [process.argv[1], "restart"], {
    detached: true,
    stdio: "ignore",
  });
}, 1000);
```

**Issue**: The restart endpoint spawns a new process using `process.argv[1]` without validation. If an attacker can control the initial process arguments (e.g., through wrapper scripts), they could potentially inject malicious commands.

**Recommendation**:
```typescript
// Use absolute path instead of process.argv[1]
const cliPath = require('path').resolve(__dirname, 'cli.js');
spawn(process.execPath, [cliPath, "restart"], {
  detached: true,
  stdio: "ignore",
});
```

---

## 🟠 High Severity Issues

### 2. Arbitrary File Read via Path Traversal in Project Configs (High)
**File**: `src/utils/router.ts:119-143`
**Severity**: High

```typescript
const getProjectSpecificRouter = async (req: any) => {
  if (req.sessionId) {
    const project = await searchProjectBySession(req.sessionId);
    if (project) {
      const projectConfigPath = join(HOME_DIR, project, "config.json");
      const sessionConfigPath = join(HOME_DIR, project, `${req.sessionId}.json`);
      // No validation on 'project' variable
      const sessionConfig = await readConfigFile(sessionConfigPath);
```

**Issue**: The `project` variable returned from `searchProjectBySession()` is not validated before being used in path construction. If the function returns a malicious path like `../../etc/passwd`, it could lead to directory traversal.

**PoC**:
- If `searchProjectBySession()` can be manipulated to return `../../../etc`, the path becomes `~/.claude-code-router/../../../etc/config.json`

**Recommendation**:
```typescript
const getProjectSpecificRouter = async (req: any) => {
  if (req.sessionId) {
    const project = await searchProjectBySession(req.sessionId);
    if (project) {
      // Validate project name
      if (!/^[a-zA-Z0-9_-]+$/.test(project)) {
        console.error(`Invalid project name: ${project}`);
        return undefined;
      }
      
      // Ensure the resolved path is still within HOME_DIR
      const projectConfigPath = path.resolve(HOME_DIR, project, "config.json");
      const relativePath = path.relative(HOME_DIR, projectConfigPath);
      
      if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        console.error(`Path traversal attempt detected: ${project}`);
        return undefined;
      }
      
      const sessionConfigPath = path.resolve(HOME_DIR, project, `${req.sessionId}.json`);
      // Continue with validated paths...
```

### 3. ReDoS (Regular Expression Denial of Service) Vulnerability (High)
**File**: `src/utils/logSanitizer.ts:24-30`
**Severity**: High

```typescript
const SENSITIVE_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/g,           // API keys starting with sk-
  /Bearer\s+[a-zA-Z0-9_-]+/g,       // Bearer tokens
  /[a-f0-9]{32,}/g,                 // Long hex strings (likely tokens)
  /AIza[a-zA-Z0-9_-]{35}/g,         // Google API keys
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, // UUIDs
];
```

**Issue**: Several regex patterns use unbounded quantifiers (`{20,}`, `{32,}`, `[a-zA-Z0-9_-]+`) that can cause catastrophic backtracking on maliciously crafted input strings.

**PoC**:
```javascript
// This could freeze the application
const maliciousInput = "sk-" + "a".repeat(10000) + "!";
sanitizeString(maliciousInput);
```

**Recommendation**:
```typescript
const SENSITIVE_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,100}/g,        // Add upper bound
  /Bearer\s+[a-zA-Z0-9_-]{1,500}/g, // Add upper bound
  /[a-f0-9]{32,256}/g,              // Add upper bound
  /AIza[a-zA-Z0-9_-]{35}/g,         // Already bounded - OK
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, // OK
];

// Also add timeout protection:
function sanitizeString(str: string): string {
  if (str.length > 100000) { // Reject excessively long strings
    return '***REDACTED_OVERSIZED***';
  }
  let sanitized = str;
  // ... rest of function
}
```

---

## 🟡 Medium Severity Issues

### 4. Unsafe Dynamic Require of Custom Router (Medium)
**File**: `src/utils/router.ts:249-270`
**Severity**: Medium

```typescript
const customRouter = require(config.CUSTOM_ROUTER_PATH);
```

**Issue**: While `validateRouterPath()` restricts custom routers to `~/.claude-code-router/routers/`, Node.js's `require()` executes the code with full process privileges. A malicious router file could execute arbitrary code.

**Additional Concerns**:
- No code signing or integrity verification
- Router code runs in the same process as the server
- Timeout protection (5s) doesn't prevent malicious code from spawning child processes

**Recommendation**:
1. **Add VM sandbox** (limited protection):
```typescript
const vm = require('vm');
const fs = require('fs');

const code = fs.readFileSync(config.CUSTOM_ROUTER_PATH, 'utf8');
const sandbox = {
  module: { exports: {} },
  require: () => { throw new Error('require not allowed'); },
  process: undefined,
  console: console, // Allow logging only
};

vm.runInNewContext(`(function(module) { ${code} })(module)`, sandbox, {
  timeout: 5000,
  filename: config.CUSTOM_ROUTER_PATH
});

const customRouter = sandbox.module.exports;
```

2. **Better approach**: Use Worker Threads for isolation:
```typescript
const { Worker } = require('worker_threads');
// Run router in separate worker thread with limited capabilities
```

### 5. Missing Input Validation on sessionId (Medium)
**File**: `src/utils/router.ts:224-228`
**Severity**: Medium

```typescript
if (req.body.metadata?.user_id) {
  const parts = req.body.metadata.user_id.split("_session_");
  if (parts.length > 1) {
    req.sessionId = parts[1]; // No validation
  }
}
```

**Issue**: The `sessionId` extracted from user input is used directly in file system operations without validation. This could enable path traversal attacks if the sessionId contains malicious characters like `../`.

**Recommendation**:
```typescript
if (req.body.metadata?.user_id) {
  const parts = req.body.metadata.user_id.split("_session_");
  if (parts.length > 1) {
    const sessionId = parts[1];
    
    // Validate sessionId format (UUID-like or alphanumeric)
    if (!/^[a-zA-Z0-9-]{1,128}$/.test(sessionId)) {
      req.log.warn(`Invalid sessionId format: ${sessionId}`);
      return;
    }
    
    req.sessionId = sessionId;
  }
}
```

### 6. Host Header Injection Potential (Medium)
**File**: `src/middleware/auth.ts:26-33`
**Severity**: Medium

```typescript
const publicEndpoints = ["/", "/health"];
const isPublicEndpoint = publicEndpoints.includes(req.url);
const isUIEndpoint = req.url.startsWith("/ui") && !req.url.startsWith("/ui/api");
```

**Issue**: The code validates `req.url` but doesn't validate the `Host` header. An attacker could craft requests with malicious `Host` headers that might be reflected in redirects or error messages, leading to potential phishing attacks.

**Recommendation**:
```typescript
// Add Host header validation
const allowedHosts = ['127.0.0.1', 'localhost'];
const host = req.headers.host?.split(':')[0]; // Remove port

if (host && !allowedHosts.includes(host)) {
  reply.status(400).send('Invalid Host header');
  return;
}
```

---

## 🟢 Low Severity Issues

### 7. Weak Admin Token Generation Entropy (Low)
**File**: `src/index.ts:212-213`
**Severity**: Low

```typescript
const crypto = await import("crypto");
const ADMIN_TOKEN = crypto.randomBytes(32).toString('hex');
```

**Issue**: While `crypto.randomBytes(32)` provides good entropy, the token is only valid for the current session and is logged to console. This is acceptable for local development but could be problematic if logs are exposed.

**Recommendation**:
1. Consider using a longer token (64 bytes) for additional security margin
2. Add option to read admin token from environment variable for production deployments
3. Ensure admin token is sanitized from all log outputs

```typescript
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 
  crypto.randomBytes(64).toString('hex');

if (!process.env.ADMIN_TOKEN && config.LOG !== false) {
  console.log(`\n🔐 Admin token for this session: ${ADMIN_TOKEN}`);
  console.log('Set ADMIN_TOKEN env var to use a persistent token\n');
}
```

### 8. Environment Variable Whitelist Could Be Too Restrictive (Low)
**File**: `src/utils/index.ts:13-46`
**Severity**: Low (Information)

```typescript
const ALLOWED_ENV_VARS = new Set([
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  // ... only specific variables allowed
]);
```

**Issue**: While this is a good security practice, it might prevent legitimate use cases where users want to reference custom environment variables in their configuration.

**Recommendation**:
Consider adding a configuration option to allow additional environment variables:
```typescript
// In config.json
{
  "ALLOWED_CUSTOM_ENV_VARS": ["MY_CUSTOM_API_KEY", "MY_SERVICE_URL"]
}

// In code
const ALLOWED_ENV_VARS = new Set([
  ...DEFAULT_ALLOWED_VARS,
  ...(config.ALLOWED_CUSTOM_ENV_VARS || [])
]);
```

---

## ✅ Security Best Practices Already Implemented

1. **Timing-Safe Comparison** (`src/middleware/auth.ts:7-21`): Uses `timingSafeEqual` to prevent timing attacks on API key validation.

2. **Path Traversal Protection** (`src/server.ts:133-162`): `validateLogFilePath()` properly validates log file paths using `path.relative()`.

3. **Rate Limiting** (`src/index.ts:180-199`): Implements rate limiting with configurable limits per endpoint.

4. **Log Sanitization** (`src/utils/logSanitizer.ts`): Actively removes sensitive data from logs.

5. **Port Validation** (`src/index.ts:78-82`): Restricts ports to safe range (1024-65535).

6. **CORS Controls** (`src/middleware/auth.ts:53-68`): Implements origin validation when APIKEY is not set.

7. **Config Validation** (`src/server.ts:16-125`): Validates all configuration inputs before use.

8. **No Shell Injection in Code Command** (`src/utils/codeCommand.ts:115`): Uses `shell: false` when spawning claude process.

9. **URL Validation Before Opening** (`src/cli.ts:263-275`): Validates URL protocol and hostname before opening browser.

---

## Priority Recommendations

### Immediate Action Required:
1. **Fix Critical Issue #1**: Validate process arguments in restart endpoint
2. **Fix High Issue #2**: Add path traversal protection to project config loading
3. **Fix High Issue #3**: Add bounds to regex patterns to prevent ReDoS

### Short-term (Within 1 Week):
4. Fix Medium issues #4-6: Improve custom router isolation, validate sessionId, add Host header validation

### Long-term Improvements:
5. Consider implementing CSP headers for the web UI
6. Add security headers (X-Frame-Options, X-Content-Type-Options, etc.)
7. Implement request signing for API endpoints
8. Add audit logging for sensitive operations
9. Consider implementing certificate pinning for upstream LLM providers
10. Add automated security scanning to CI/CD pipeline

---

## Testing Recommendations

1. **Add Security Tests**:
   - Path traversal attack tests
   - ReDoS vulnerability tests
   - Command injection tests
   - Rate limiting bypass tests

2. **Penetration Testing**:
   - Consider hiring a security professional for a full audit
   - Test in isolated environment before production deployment

3. **Regular Updates**:
   - Keep dependencies updated (run `npm audit` regularly)
   - Monitor security advisories for used packages

---

## Conclusion

The codebase shows good security awareness with multiple defense layers, but the identified issues could lead to serious vulnerabilities in production environments. The critical and high-severity issues should be addressed immediately before any production deployment.

The development team has implemented many security best practices, and with these fixes, the application will have a strong security posture.
