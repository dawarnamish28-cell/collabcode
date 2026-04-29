/**
 * Security Sandbox v6.0 — Process isolation & code sanitization
 * 
 * Features:
 *  - Dangerous pattern detection for each language
 *  - Resource limits (memory, CPU, file descriptors)
 *  - Network access blocking
 *  - Temp directory isolation per execution
 *  - Process group killing for clean teardown
 *  - Compilation cache for repeated builds
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

// ─── Dangerous Pattern Detection ────────────────────────────────────
const DANGEROUS_PATTERNS = {
  // System-level dangers (applies to all languages)
  universal: [
    { pattern: /rm\s+(-rf?|--recursive)\s+\//i, message: 'Recursive delete of root filesystem not allowed' },
    { pattern: /:(){ :\|:& };:/i, message: 'Fork bombs not allowed' },
    { pattern: />\s*\/dev\/sd[a-z]/i, message: 'Direct disk writes not allowed' },
    { pattern: /dd\s+if=.*of=\/dev/i, message: 'Raw disk operations not allowed' },
    { pattern: /mkfs\./i, message: 'Filesystem creation not allowed' },
    { pattern: /shutdown|reboot|halt|poweroff/i, message: 'System commands not allowed' },
  ],
  
  // Python-specific
  python: [
    { pattern: /import\s+subprocess/i, message: 'subprocess module is restricted', severity: 'warn' },
    { pattern: /os\.system\s*\(/i, message: 'os.system() is restricted', severity: 'warn' },
    { pattern: /os\.popen\s*\(/i, message: 'os.popen() is restricted', severity: 'warn' },
    { pattern: /os\.exec[lv]p?\s*\(/i, message: 'os.exec() variants are restricted', severity: 'warn' },
    { pattern: /__import__\s*\(\s*['"]ctypes/i, message: 'ctypes is restricted' },
    { pattern: /open\s*\(\s*['"]\/etc\/(passwd|shadow)/i, message: 'System file access not allowed' },
  ],

  // JavaScript/TypeScript
  javascript: [
    { pattern: /child_process/i, message: 'child_process is restricted', severity: 'warn' },
    { pattern: /require\s*\(\s*['"]fs['"]\s*\)\.unlinkSync\s*\(\s*['"]\//, message: 'System file deletion not allowed' },
    { pattern: /process\.exit\s*\(/i, message: 'process.exit() is restricted', severity: 'warn' },
  ],

  // Shell/Bash
  bash: [
    { pattern: /curl.*\|\s*(ba)?sh/i, message: 'Pipe-to-shell execution not allowed' },
    { pattern: /wget.*\|\s*(ba)?sh/i, message: 'Pipe-to-shell execution not allowed' },
    { pattern: /nc\s+-[elp]/i, message: 'Netcat listeners not allowed' },
    { pattern: />\s*\/etc\//i, message: 'Writing to /etc not allowed' },
    { pattern: /chmod\s+[0-7]*777\s+\//i, message: 'World-writable root permissions not allowed' },
  ],

  // C/C++
  c: [
    { pattern: /\bfork\s*\(\s*\)/i, message: 'fork() is monitored', severity: 'warn' },
    { pattern: /\bexecve?\s*\(/i, message: 'exec() is monitored', severity: 'warn' },
    { pattern: /system\s*\(\s*"(rm|dd|mkfs|shutdown)/i, message: 'Dangerous system() call not allowed' },
    { pattern: /#include\s*<sys\/ptrace\.h>/i, message: 'ptrace is not allowed' },
  ],

  // Go
  go: [
    { pattern: /syscall\.Exec/i, message: 'syscall.Exec is monitored', severity: 'warn' },
    { pattern: /os\/exec/i, message: 'os/exec is monitored', severity: 'warn' },
  ],

  // Rust
  rust: [
    { pattern: /std::process::Command/i, message: 'Process spawning is monitored', severity: 'warn' },
    { pattern: /unsafe\s*\{[\s\S]*libc::fork/i, message: 'Unsafe fork not allowed' },
  ],
};

// Alias patterns
DANGEROUS_PATTERNS.typescript = DANGEROUS_PATTERNS.javascript;
DANGEROUS_PATTERNS.cpp = DANGEROUS_PATTERNS.c;
DANGEROUS_PATTERNS.shell = DANGEROUS_PATTERNS.bash;

/**
 * Scan code for dangerous patterns
 * @returns {{ safe: boolean, warnings: string[], blocked: string[] }}
 */
function scanCode(code, language) {
  const warnings = [];
  const blocked = [];
  
  // Check universal patterns
  for (const rule of DANGEROUS_PATTERNS.universal) {
    if (rule.pattern.test(code)) {
      blocked.push(rule.message);
    }
  }

  // Check language-specific patterns
  const langPatterns = DANGEROUS_PATTERNS[language] || [];
  for (const rule of langPatterns) {
    if (rule.pattern.test(code)) {
      if (rule.severity === 'warn') {
        warnings.push(rule.message);
      } else {
        blocked.push(rule.message);
      }
    }
  }

  return {
    safe: blocked.length === 0,
    warnings,
    blocked,
  };
}

// ─── Resource Limits ────────────────────────────────────────────────
const RESOURCE_LIMITS = {
  maxMemoryMB: parseInt(process.env.SANDBOX_MAX_MEMORY_MB) || 256,
  maxCpuSeconds: parseInt(process.env.SANDBOX_MAX_CPU_SECONDS) || 10,
  maxOutputBytes: parseInt(process.env.SANDBOX_MAX_OUTPUT) || 65536,
  maxFileSize: parseInt(process.env.SANDBOX_MAX_FILE_SIZE) || 1048576, // 1MB
  maxProcesses: parseInt(process.env.SANDBOX_MAX_PROCESSES) || 32,
  maxOpenFiles: parseInt(process.env.SANDBOX_MAX_OPEN_FILES) || 64,
};

/**
 * Get ulimit flags for resource restriction
 */
function getResourceLimitArgs() {
  const limits = [];
  // Virtual memory limit
  limits.push(`ulimit -v ${RESOURCE_LIMITS.maxMemoryMB * 1024} 2>/dev/null;`);
  // CPU time limit
  limits.push(`ulimit -t ${RESOURCE_LIMITS.maxCpuSeconds} 2>/dev/null;`);
  // Max file size
  limits.push(`ulimit -f ${Math.floor(RESOURCE_LIMITS.maxFileSize / 1024)} 2>/dev/null;`);
  // Max processes
  limits.push(`ulimit -u ${RESOURCE_LIMITS.maxProcesses} 2>/dev/null;`);
  // Max open files
  limits.push(`ulimit -n ${RESOURCE_LIMITS.maxOpenFiles} 2>/dev/null;`);
  return limits.join(' ');
}

/**
 * Get environment variables that restrict network access
 */
function getSandboxEnv() {
  return {
    ...process.env,
    // Restrict network
    http_proxy: 'http://127.0.0.1:0',
    https_proxy: 'http://127.0.0.1:0',
    no_proxy: '',
    // Restrict HOME
    HOME: '/tmp',
    // Clear sensitive env vars
    MONGODB_URI: '',
    JWT_SECRET: '',
    JUDGE0_API_KEY: '',
    // Set safe PATH
    PATH: '/usr/local/bin:/usr/bin:/bin',
  };
}

// ─── Compilation Cache ──────────────────────────────────────────────
const compilationCache = new Map();
const CACHE_MAX_SIZE = 100;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Generate cache key from code + language
 */
function getCacheKey(code, language) {
  const hash = crypto.createHash('md5').update(`${language}:${code}`).digest('hex');
  return hash;
}

/**
 * Get cached compilation result
 */
function getCachedCompilation(code, language) {
  const key = getCacheKey(code, language);
  const cached = compilationCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > CACHE_TTL) {
    compilationCache.delete(key);
    return null;
  }
  return cached;
}

/**
 * Cache a compilation result
 */
function setCachedCompilation(code, language, binaryPath, originalDir) {
  // Evict oldest if full
  if (compilationCache.size >= CACHE_MAX_SIZE) {
    const oldest = compilationCache.keys().next().value;
    const old = compilationCache.get(oldest);
    // Clean up old binary
    try { if (old?.binaryPath) fs.unlinkSync(old.binaryPath); } catch (e) {}
    compilationCache.delete(oldest);
  }
  const key = getCacheKey(code, language);
  compilationCache.set(key, {
    binaryPath,
    originalDir,
    timestamp: Date.now(),
  });
}

/**
 * Clean expired cache entries
 */
function cleanCache() {
  const now = Date.now();
  for (const [key, entry] of compilationCache) {
    if (now - entry.timestamp > CACHE_TTL) {
      try { if (entry.binaryPath) fs.unlinkSync(entry.binaryPath); } catch (e) {}
      compilationCache.delete(key);
    }
  }
}

// Run cache cleanup every 2 minutes
setInterval(cleanCache, 2 * 60 * 1000);

// ─── Execution Sandbox ──────────────────────────────────────────────

/**
 * Create an isolated temp directory for code execution
 */
function createSandboxDir() {
  const id = crypto.randomBytes(8).toString('hex');
  const dir = path.join(os.tmpdir(), `collabcode-${id}`);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

/**
 * Cleanup a sandbox directory
 */
function cleanupSandboxDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 2 });
  } catch (e) {
    // Best effort cleanup
    console.warn(`[Sandbox] Failed to cleanup ${dir}: ${e.message}`);
  }
}

/**
 * Express middleware that validates code before execution
 */
function sandboxMiddleware(req, res, next) {
  const { code, language } = req.body;
  
  if (!code || !language) {
    return next(); // Let the controller handle validation
  }

  const scan = scanCode(code, language);
  
  if (!scan.safe) {
    return res.status(403).json({
      error: true,
      message: 'Code blocked by security scanner',
      blocked: scan.blocked,
      warnings: scan.warnings,
    });
  }

  // Attach warnings to request for the controller to include in response
  req.sandboxWarnings = scan.warnings;
  next();
}

module.exports = {
  scanCode,
  sandboxMiddleware,
  getResourceLimitArgs,
  getSandboxEnv,
  RESOURCE_LIMITS,
  getCachedCompilation,
  setCachedCompilation,
  createSandboxDir,
  cleanupSandboxDir,
  DANGEROUS_PATTERNS,
};
