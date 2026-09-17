/**
 * Process Manager v10.0 — Robust Process Group Tree-Kill & Sandbox Isolation
 *
 * Features:
 *  - Process Group Spawning & Tree-Kill (process.kill(-pid, 'SIGKILL')):
 *      Kills not only the child, but any subprocesses spawned by it (e.g. bash subshells,
 *      multiprocess python, fork bombs).
 *  - Streaming Output Accumulator:
 *      Strict memory cap (64KB). Truncates instantly and destroys streams to prevent
 *      kernel pipe buffer blowouts and V8 heap bloat.
 *  - Graceful Stdin Pipe:
 *      Catches EPIPE silently if child terminates before consuming input.
 *  - Sandbox Auto-Lifecycle & Periodic Leak Sweeper:
 *      Tracks temp dirs, cleans on finish, sweeps stale dirs periodically.
 *  - Zombie Reaper:
 *      Tracks all active PIDs and forcibly reaps any hung orphans.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const TIMEOUT_MS = parseInt(process.env.EXEC_TIMEOUT_MS) || 10000;
const MAX_OUTPUT = parseInt(process.env.EXEC_MAX_OUTPUT) || 65536;
const SANDBOX_PREFIX = 'collabcode-';
const ZOMBIE_REAPER_INTERVAL_MS = 30000;
const SANDBOX_SWEEP_INTERVAL_MS = 60000;
const STALE_SANDBOX_AGE_MS = 600000; // 10 minutes

// Active tracking
const activeChildren = new Map(); // pid -> { child, pgid, startTime, cmd }
const activeSandboxes = new Set(); // dir path

/**
 * Kill an entire process group safely
 * @param {number} pid
 * @param {string} [signal='SIGTERM']
 */
function killProcessGroup(pid, signal = 'SIGTERM') {
  if (!pid) return;

  // 1. Try killing process group (-pid)
  try {
    process.kill(-pid, signal);
  } catch (e) {
    // 2. Fallback to direct PID if group kill fails (e.g. ESRCH or permission)
    try {
      process.kill(pid, signal);
    } catch (e2) {}
  }
}

/**
 * Forcibly kill process group with SIGTERM then SIGKILL
 * @param {number} pid
 */
function terminateProcessTree(pid) {
  if (!pid) return;
  killProcessGroup(pid, 'SIGTERM');
  setTimeout(() => {
    killProcessGroup(pid, 'SIGKILL');
  }, 1000);
}

/**
 * Run a command inside an isolated sandbox with strict resource limits
 * @param {string} cmd
 * @param {string[]} args
 * @param {Object} opts
 * @param {string} [opts.cwd]
 * @param {string} [opts.stdin]
 * @param {number} [opts.timeout]
 * @param {Object} [opts.env]
 * @param {AbortSignal} [opts.abortSignal]
 * @returns {Promise<{ stdout: string, stderr: string, exitCode: number, signal: string }>}
 */
function runSandboxedCommand(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const timeout = opts.timeout || TIMEOUT_MS;
    const cwd = opts.cwd || process.cwd();
    const stdin = opts.stdin || '';
    const abortSignal = opts.abortSignal || null;

    let stdoutChunks = [];
    let stderrChunks = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let timedOut = false;
    let aborted = false;
    let settled = false;

    const env = {
      ...process.env,
      HOME: cwd,
      TMPDIR: cwd,
      NODE_OPTIONS: '--max-old-space-size=128',
      PYTHONUNBUFFERED: '1',
      PYTHONDONTWRITEBYTECODE: '1',
      PYTHONIOENCODING: 'utf-8',
      PYTHONHASHSEED: '0',
      ...(opts.env || {}),
    };

    if (cmd === 'go') {
      env.GOPATH = path.join(cwd, '.gopath');
      env.GOCACHE = path.join(cwd, '.gocache');
    }

    let child;
    try {
      // Spawn as a new process group leader on POSIX
      const isWindows = process.platform === 'win32';
      child = spawn(cmd, args, {
        cwd,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: !isWindows,
      });
    } catch (spawnErr) {
      return reject(new Error(`SPAWN_FAILED: ${spawnErr.message}`));
    }

    const pid = child.pid;
    if (pid) {
      activeChildren.set(pid, { child, startTime: Date.now(), cmd });
    }

    // Abort listener
    let abortListener = null;
    if (abortSignal) {
      if (abortSignal.aborted) {
        terminateProcessTree(pid);
        activeChildren.delete(pid);
        return reject(new Error('REQUEST_ABORTED'));
      }
      abortListener = () => {
        aborted = true;
        terminateProcessTree(pid);
      };
      abortSignal.addEventListener('abort', abortListener, { once: true });
    }

    // Timeout kill timer
    const killTimer = setTimeout(() => {
      timedOut = true;
      terminateProcessTree(pid);
    }, timeout);

    // Stdout accumulator
    child.stdout.on('data', (chunk) => {
      if (stdoutTruncated) return;
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_OUTPUT) {
        stdoutTruncated = true;
        const allowed = chunk.length - (stdoutBytes - MAX_OUTPUT);
        if (allowed > 0) stdoutChunks.push(chunk.slice(0, allowed));
        stdoutChunks.push(Buffer.from('\n... [output truncated at 64KB]'));
        // Destroy stream and kill runaway loop
        try { child.stdout.destroy(); } catch (e) {}
        terminateProcessTree(pid);
      } else {
        stdoutChunks.push(chunk);
      }
    });

    // Stderr accumulator
    child.stderr.on('data', (chunk) => {
      if (stderrTruncated) return;
      stderrBytes += chunk.length;
      if (stderrBytes > MAX_OUTPUT) {
        stderrTruncated = true;
        const allowed = chunk.length - (stderrBytes - MAX_OUTPUT);
        if (allowed > 0) stderrChunks.push(chunk.slice(0, allowed));
        stderrChunks.push(Buffer.from('\n... [stderr truncated]'));
        try { child.stderr.destroy(); } catch (e) {}
      } else {
        stderrChunks.push(chunk);
      }
    });

    // Stdin handling with EPIPE protection
    if (stdin) {
      child.stdin.on('error', () => {}); // swallow EPIPE
      try {
        child.stdin.write(stdin);
      } catch (e) {}
    }
    try {
      child.stdin.end();
    } catch (e) {}

    // Cleanup & Resolution
    function cleanupAndFinish(code, signal, error) {
      if (settled) return;
      settled = true;

      clearTimeout(killTimer);
      if (abortSignal && abortListener) {
        abortSignal.removeEventListener('abort', abortListener);
      }
      if (pid) activeChildren.delete(pid);

      if (aborted) {
        return reject(new Error('REQUEST_ABORTED'));
      }
      if (timedOut) {
        return reject(new Error('TIME_LIMIT_EXCEEDED'));
      }
      if (error) {
        return reject(error);
      }

      const stdout = Buffer.concat(stdoutChunks).toString('utf8');
      const stderr = Buffer.concat(stderrChunks).toString('utf8');
      resolve({ stdout, stderr, exitCode: code !== null ? code : 1, signal });
    }

    child.on('close', (code, signal) => cleanupAndFinish(code, signal, null));
    child.on('error', (err) => cleanupAndFinish(null, null, err));
  });
}

/**
 * Create an isolated sandbox temporary directory
 */
function createSandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), SANDBOX_PREFIX));
  activeSandboxes.add(dir);
  return dir;
}

/**
 * Remove sandbox directory safely
 */
function cleanupSandbox(dir) {
  if (!dir) return;
  activeSandboxes.delete(dir);
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  } catch (e) {
    // Ignore cleanup errors
  }
}

// ─── Zombie Process Reaper ─────────────────────────────────────────────
const reaperInterval = setInterval(() => {
  const now = Date.now();
  for (const [pid, info] of activeChildren) {
    // If process has been alive longer than 45s (max allowed exec is 20s), kill it
    if (now - info.startTime > 45000) {
      console.warn(`[Zombie Reaper] Killing orphaned process PID ${pid} (${info.cmd})`);
      terminateProcessTree(pid);
      activeChildren.delete(pid);
    } else {
      try {
        // Probe if process still exists
        process.kill(pid, 0);
      } catch (e) {
        // Process is dead, remove from tracking
        activeChildren.delete(pid);
      }
    }
  }
}, ZOMBIE_REAPER_INTERVAL_MS);
if (reaperInterval.unref) reaperInterval.unref();

// ─── Stale Sandbox Directory Cleaner ───────────────────────────────────
function sweepStaleSandboxes() {
  try {
    const tmpDir = os.tmpdir();
    const entries = fs.readdirSync(tmpDir);
    const now = Date.now();
    let cleaned = 0;

    for (const entry of entries) {
      if (entry.startsWith(SANDBOX_PREFIX) || entry.startsWith('collabcache-')) {
        const fullPath = path.join(tmpDir, entry);
        try {
          const stat = fs.statSync(fullPath);
          if (now - stat.mtimeMs > STALE_SANDBOX_AGE_MS) {
            fs.rmSync(fullPath, { recursive: true, force: true });
            activeSandboxes.delete(fullPath);
            cleaned++;
          }
        } catch (e) {}
      }
    }
    if (cleaned > 0) {
      console.log(`[Sandbox Sweeper] Cleaned ${cleaned} stale sandbox directories`);
    }
  } catch (e) {}
}

const sweepInterval = setInterval(sweepStaleSandboxes, SANDBOX_SWEEP_INTERVAL_MS);
if (sweepInterval.unref) sweepInterval.unref();

// Run startup sweep
sweepStaleSandboxes();

/**
 * Full engine teardown on server shutdown
 */
function cleanupAllProcesses() {
  clearInterval(reaperInterval);
  clearInterval(sweepInterval);

  for (const [pid] of activeChildren) {
    terminateProcessTree(pid);
  }
  activeChildren.clear();

  for (const dir of activeSandboxes) {
    cleanupSandbox(dir);
  }
  activeSandboxes.clear();
}

module.exports = {
  runSandboxedCommand,
  createSandbox,
  cleanupSandbox,
  terminateProcessTree,
  cleanupAllProcesses,
  getActiveProcessCount: () => activeChildren.size,
  getActiveSandboxCount: () => activeSandboxes.size,
  TIMEOUT_MS,
  MAX_OUTPUT,
};
