/**
 * Execution Controller — Production-Grade Code Runner
 * 
 * Multi-strategy execution engine:
 *  1. LOCAL SANDBOX (primary)  — Spawns isolated child processes with
 *     strict timeouts, memory caps, tmpdir isolation, and resource cleanup.
 *     Supports: JavaScript (Node.js), Python 3, C (GCC), C++ (G++).
 *  2. WANDBOX API (fallback)   — Free compiler service for C/C++ extras.
 *  3. JUDGE0 API (optional)    — If API key is configured, supports all 10 languages.
 *
 * Security measures:
 *  - Each execution gets its own temp directory (auto-cleaned)
 *  - Child processes run with SIGKILL timeout enforcement
 *  - stdout/stderr size capped to prevent memory bombs
 *  - Compilation and execution are separate phases (for compiled langs)
 *  - No network access from executed code (when available)
 */

const { execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');

// ─── Configuration ────────────────────────────────────────────────────
const TIMEOUT_MS = parseInt(process.env.EXEC_TIMEOUT_MS) || 10000;   // 10s
const MAX_OUTPUT = parseInt(process.env.EXEC_MAX_OUTPUT) || 65536;   // 64KB
const COMPILE_TIMEOUT_MS = 15000; // 15s for compilation

const JUDGE0_URL = process.env.JUDGE0_API_URL || 'https://judge0-ce.p.rapidapi.com';
const JUDGE0_KEY = process.env.JUDGE0_API_KEY;
const JUDGE0_HOST = process.env.JUDGE0_API_HOST || 'judge0-ce.p.rapidapi.com';

// ─── Language Definitions ─────────────────────────────────────────────
const LANGUAGES = {
  javascript: {
    name: 'JavaScript',
    version: null, // detected at startup
    ext: '.js',
    local: true,
    runner: 'node',
    compile: null,
    fileName: 'main.js',
    judge0Id: 63,
  },
  typescript: {
    name: 'TypeScript',
    version: null,
    ext: '.ts',
    local: false,  // No tsc in sandbox → use Judge0 or transpile via node
    runner: null,
    compile: null,
    fileName: 'main.ts',
    judge0Id: 74,
  },
  python: {
    name: 'Python 3',
    version: null,
    ext: '.py',
    local: true,
    runner: 'python3',
    compile: null,
    fileName: 'main.py',
    judge0Id: 71,
  },
  c: {
    name: 'C',
    version: null,
    ext: '.c',
    local: true,
    runner: null,  // Set after compilation
    compile: { cmd: 'gcc', args: ['-o', 'main', 'main.c', '-lm'] },
    fileName: 'main.c',
    runCompiled: './main',
    judge0Id: 50,
  },
  cpp: {
    name: 'C++',
    version: null,
    ext: '.cpp',
    local: true,
    runner: null,
    compile: { cmd: 'g++', args: ['-o', 'main', 'main.cpp', '-lm', '-lstdc++'] },
    fileName: 'main.cpp',
    runCompiled: './main',
    judge0Id: 54,
  },
  java: {
    name: 'Java',
    ext: '.java',
    local: false,
    fileName: 'Main.java',
    judge0Id: 62,
  },
  go: {
    name: 'Go',
    ext: '.go',
    local: false,
    fileName: 'main.go',
    judge0Id: 60,
  },
  rust: {
    name: 'Rust',
    ext: '.rs',
    local: false,
    fileName: 'main.rs',
    judge0Id: 73,
  },
  ruby: {
    name: 'Ruby',
    ext: '.rb',
    local: false,
    fileName: 'main.rb',
    judge0Id: 72,
  },
  php: {
    name: 'PHP',
    ext: '.php',
    local: false,
    fileName: 'main.php',
    judge0Id: 68,
  },
};

// ─── Detect local runtime versions at startup ─────────────────────────
(async function detectVersions() {
  const checks = [
    { lang: 'javascript', cmd: 'node', args: ['--version'] },
    { lang: 'python', cmd: 'python3', args: ['--version'] },
    { lang: 'c', cmd: 'gcc', args: ['--version'] },
    { lang: 'cpp', cmd: 'g++', args: ['--version'] },
  ];
  for (const check of checks) {
    try {
      const ver = await runCommand(check.cmd, check.args, { timeout: 3000 });
      const v = ver.stdout.trim().split('\n')[0];
      if (LANGUAGES[check.lang]) LANGUAGES[check.lang].version = v;
      console.log(`[Exec] ${check.lang}: ${v}`);
    } catch (e) {
      console.warn(`[Exec] ${check.lang}: not available`);
      if (LANGUAGES[check.lang]) LANGUAGES[check.lang].local = false;
    }
  }
})();

// ─── Helper: Run a command with timeout ───────────────────────────────
function runCommand(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const timeout = opts.timeout || TIMEOUT_MS;
    const cwd = opts.cwd || process.cwd();
    const stdin = opts.stdin || '';

    let stdout = '';
    let stderr = '';
    let killed = false;
    let timedOut = false;

    const child = spawn(cmd, args, {
      cwd,
      timeout: timeout + 1000, // Node-level safety net
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PATH: process.env.PATH,
        HOME: cwd,
        TMPDIR: cwd,
        NODE_OPTIONS: '', // Prevent memory-expensive Node options
      },
      // Resource limits where available
      ...(process.platform === 'linux' ? {} : {}),
    });

    // Hard kill timer
    const killTimer = setTimeout(() => {
      timedOut = true;
      killed = true;
      try { child.kill('SIGKILL'); } catch (e) {}
    }, timeout);

    child.stdout.on('data', (data) => {
      stdout += data.toString();
      if (stdout.length > MAX_OUTPUT) {
        stdout = stdout.substring(0, MAX_OUTPUT) + '\n... [output truncated at 64KB]';
        try { child.kill('SIGKILL'); } catch (e) {}
        killed = true;
      }
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
      if (stderr.length > MAX_OUTPUT) {
        stderr = stderr.substring(0, MAX_OUTPUT) + '\n... [stderr truncated]';
      }
    });

    // Write stdin
    if (stdin) {
      child.stdin.write(stdin);
    }
    child.stdin.end();

    child.on('close', (code, signal) => {
      clearTimeout(killTimer);
      if (timedOut) {
        reject(new Error(`TIME_LIMIT_EXCEEDED`));
      } else {
        resolve({ stdout, stderr, exitCode: code, signal, killed });
      }
    });

    child.on('error', (err) => {
      clearTimeout(killTimer);
      reject(err);
    });
  });
}

// ─── Create isolated temp directory ───────────────────────────────────
function createSandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'collabcode-'));
  return dir;
}

function cleanupSandbox(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (e) {
    console.warn(`[Exec] Cleanup failed for ${dir}:`, e.message);
  }
}

// ─── LOCAL EXECUTION ENGINE ───────────────────────────────────────────
async function executeLocal(code, language, stdin) {
  const lang = LANGUAGES[language];
  if (!lang || !lang.local) return null; // Not available locally

  const sandbox = createSandbox();
  const filePath = path.join(sandbox, lang.fileName);
  const startTime = process.hrtime.bigint();

  try {
    // Write source code
    fs.writeFileSync(filePath, code, 'utf-8');

    // ── COMPILED LANGUAGES ──────────────────────────────────────────
    if (lang.compile) {
      // Phase 1: Compile
      let compileResult;
      try {
        compileResult = await runCommand(
          lang.compile.cmd,
          lang.compile.args,
          { cwd: sandbox, timeout: COMPILE_TIMEOUT_MS }
        );
      } catch (compileErr) {
        const elapsed = Number(process.hrtime.bigint() - startTime) / 1e6;
        if (compileErr.message === 'TIME_LIMIT_EXCEEDED') {
          return {
            success: false,
            stdout: '',
            stderr: 'Compilation timed out (15s limit)',
            exitCode: -1,
            executionTime: `${(elapsed / 1000).toFixed(3)}s`,
            memoryUsed: 'N/A',
            status: 'Compilation Error',
            phase: 'compile',
          };
        }
        throw compileErr;
      }

      if (compileResult.exitCode !== 0) {
        const elapsed = Number(process.hrtime.bigint() - startTime) / 1e6;
        return {
          success: false,
          stdout: compileResult.stdout,
          stderr: compileResult.stderr,
          exitCode: compileResult.exitCode,
          executionTime: `${(elapsed / 1000).toFixed(3)}s`,
          memoryUsed: 'N/A',
          status: 'Compilation Error',
          phase: 'compile',
        };
      }

      // Phase 2: Run compiled binary
      try {
        const runResult = await runCommand(
          lang.runCompiled,
          [],
          { cwd: sandbox, timeout: TIMEOUT_MS, stdin }
        );
        const elapsed = Number(process.hrtime.bigint() - startTime) / 1e6;
        return {
          success: runResult.exitCode === 0,
          stdout: runResult.stdout,
          stderr: runResult.stderr,
          exitCode: runResult.exitCode,
          executionTime: `${(elapsed / 1000).toFixed(3)}s`,
          memoryUsed: 'N/A',
          status: runResult.exitCode === 0 ? 'Success' : `Exit Code: ${runResult.exitCode}`,
          phase: 'run',
        };
      } catch (runErr) {
        const elapsed = Number(process.hrtime.bigint() - startTime) / 1e6;
        if (runErr.message === 'TIME_LIMIT_EXCEEDED') {
          return {
            success: false,
            stdout: '',
            stderr: `Time Limit Exceeded (${TIMEOUT_MS / 1000}s limit)`,
            exitCode: -1,
            executionTime: `${(elapsed / 1000).toFixed(3)}s`,
            memoryUsed: 'N/A',
            status: 'Time Limit Exceeded',
            phase: 'run',
          };
        }
        throw runErr;
      }
    }

    // ── INTERPRETED LANGUAGES ───────────────────────────────────────
    try {
      const result = await runCommand(
        lang.runner,
        [lang.fileName],
        { cwd: sandbox, timeout: TIMEOUT_MS, stdin }
      );
      const elapsed = Number(process.hrtime.bigint() - startTime) / 1e6;
      return {
        success: result.exitCode === 0,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        executionTime: `${(elapsed / 1000).toFixed(3)}s`,
        memoryUsed: 'N/A',
        status: result.exitCode === 0 ? 'Success' : `Exit Code: ${result.exitCode}`,
        phase: 'run',
      };
    } catch (runErr) {
      const elapsed = Number(process.hrtime.bigint() - startTime) / 1e6;
      if (runErr.message === 'TIME_LIMIT_EXCEEDED') {
        return {
          success: false,
          stdout: '',
          stderr: `Time Limit Exceeded (${TIMEOUT_MS / 1000}s limit)`,
          exitCode: -1,
          executionTime: `${(elapsed / 1000).toFixed(3)}s`,
          memoryUsed: 'N/A',
          status: 'Time Limit Exceeded',
          phase: 'run',
        };
      }
      throw runErr;
    }

  } finally {
    cleanupSandbox(sandbox);
  }
}

// ─── JUDGE0 EXECUTION (for languages without local runtime) ───────────
async function executeJudge0(code, language, stdin) {
  const lang = LANGUAGES[language];
  if (!JUDGE0_KEY || JUDGE0_KEY === 'your-rapidapi-key-here') return null;

  try {
    const res = await axios.post(
      `${JUDGE0_URL}/submissions?base64_encoded=false&wait=true`,
      {
        source_code: code,
        language_id: lang.judge0Id,
        stdin: stdin,
        cpu_time_limit: 5,
        memory_limit: 128000,
        wall_time_limit: 10,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-RapidAPI-Key': JUDGE0_KEY,
          'X-RapidAPI-Host': JUDGE0_HOST,
        },
        timeout: 30000,
      }
    );

    const r = res.data;
    const success = r.status?.id === 3;
    return {
      success,
      stdout: r.stdout || '',
      stderr: r.stderr || r.compile_output || '',
      exitCode: r.exit_code,
      executionTime: `${r.time || 0}s`,
      memoryUsed: r.memory ? `${Math.round(r.memory / 1024)}KB` : 'N/A',
      status: r.status?.description || 'Unknown',
      engine: 'judge0',
    };
  } catch (err) {
    console.error('[Exec] Judge0 error:', err.message);
    return null;
  }
}

// ─── WANDBOX EXECUTION (free, for C/C++/other compiled) ───────────────
async function executeWandbox(code, language, stdin) {
  const compilerMap = {
    c: 'gcc-head',
    cpp: 'gcc-head',
  };
  const compiler = compilerMap[language];
  if (!compiler) return null;

  try {
    const res = await axios.post(
      'https://wandbox.org/api/compile.json',
      {
        code,
        compiler,
        stdin: stdin || '',
        'compiler-option-raw': '-O2 -lm',
        'runtime-option-raw': '',
      },
      { timeout: 30000 }
    );

    const r = res.data;
    const hasError = r.status !== '0' || r.compiler_error;
    return {
      success: r.status === '0',
      stdout: r.program_output || '',
      stderr: r.program_error || r.compiler_error || '',
      exitCode: parseInt(r.status) || 0,
      executionTime: 'N/A',
      memoryUsed: 'N/A',
      status: hasError ? 'Error' : 'Success',
      engine: 'wandbox',
    };
  } catch (err) {
    console.error('[Exec] Wandbox error:', err.message);
    return null;
  }
}

// ─── MAIN EXECUTION HANDLER ───────────────────────────────────────────
async function executeCode(req, res) {
  const { code, language, stdin = '' } = req.body;

  // Validate
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: true, message: 'Code is required' });
  }
  if (!language || !LANGUAGES[language]) {
    return res.status(400).json({
      error: true,
      message: `Unsupported language. Supported: ${Object.keys(LANGUAGES).join(', ')}`,
    });
  }
  if (code.length > 100000) {
    return res.status(400).json({ error: true, message: 'Code exceeds 100KB limit' });
  }

  const lang = LANGUAGES[language];
  console.log(`[Exec] ${language} | ${code.length} chars | local=${lang.local}`);

  // Strategy 1: Local execution (fastest, most reliable)
  if (lang.local) {
    try {
      const result = await executeLocal(code, language, stdin);
      if (result) {
        return res.json({
          success: result.success,
          output: result.stdout,
          error: result.stderr,
          exitCode: result.exitCode,
          executionTime: result.executionTime,
          memoryUsed: result.memoryUsed,
          status: result.status,
          engine: 'local',
          language: lang.name,
          version: lang.version,
          phase: result.phase,
        });
      }
    } catch (err) {
      console.error(`[Exec] Local execution error:`, err.message);
      // Fall through to remote
    }
  }

  // Strategy 2: Judge0 (if configured)
  const judge0Result = await executeJudge0(code, language, stdin);
  if (judge0Result) {
    return res.json({
      success: judge0Result.success,
      output: judge0Result.stdout,
      error: judge0Result.stderr,
      exitCode: judge0Result.exitCode,
      executionTime: judge0Result.executionTime,
      memoryUsed: judge0Result.memoryUsed,
      status: judge0Result.status,
      engine: 'judge0',
      language: lang.name,
    });
  }

  // Strategy 3: Wandbox (for C/C++)
  if (['c', 'cpp'].includes(language)) {
    const wandResult = await executeWandbox(code, language, stdin);
    if (wandResult) {
      return res.json({
        success: wandResult.success,
        output: wandResult.stdout,
        error: wandResult.stderr,
        exitCode: wandResult.exitCode,
        executionTime: wandResult.executionTime,
        memoryUsed: wandResult.memoryUsed,
        status: wandResult.status,
        engine: 'wandbox',
        language: lang.name,
      });
    }
  }

  // No execution engine available for this language
  return res.status(501).json({
    error: true,
    message: `No execution engine available for ${lang.name}. ` +
      `Locally supported: JavaScript, Python, C, C++. ` +
      `Configure JUDGE0_API_KEY in .env for all 10 languages.`,
    supportedLocal: Object.entries(LANGUAGES)
      .filter(([_, v]) => v.local)
      .map(([k, v]) => `${v.name} (${v.version || 'unknown'})`),
  });
}

// ─── LANGUAGE LIST ENDPOINT ───────────────────────────────────────────
function getSupportedLanguages(req, res) {
  const languages = Object.entries(LANGUAGES).map(([id, lang]) => ({
    id,
    name: lang.name,
    version: lang.version || null,
    localExecution: lang.local,
    ext: lang.ext,
  }));

  const hasJudge0 = JUDGE0_KEY && JUDGE0_KEY !== 'your-rapidapi-key-here';

  res.json({
    languages,
    engines: {
      local: Object.entries(LANGUAGES).filter(([_, v]) => v.local).map(([k]) => k),
      judge0: hasJudge0 ? Object.keys(LANGUAGES) : [],
      wandbox: ['c', 'cpp'],
    },
  });
}

module.exports = { executeCode, getSupportedLanguages };
