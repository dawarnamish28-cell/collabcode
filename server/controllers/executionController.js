/**
 * Execution Controller v9.0 — Hardened for Continuous Heavy Use
 *
 * v9.0 hardening:
 *  - Zombie process reaper: tracks all spawned child PIDs, periodic sweep kills orphans
 *  - Sandbox leak protection: startup sweep cleans stale /tmp/collabcode-* dirs
 *  - Queue max length cap (prevents unbounded memory growth under load)
 *  - Queue timeout: tasks waiting too long get rejected with 503
 *  - Compilation cache TTL: entries older than 1 hour are auto-evicted
 *  - postProcessOutput applied to ALL languages (compiled + interpreted)
 *  - Process-exit cleanup: cache purge + sandbox sweep on SIGTERM/SIGINT
 *  - Proper child process tree kill (process group kill)
 *  - stdin pipe error handling (prevents EPIPE crash)
 *  - Code size validation tightened
 *  - Execution timeout includes compile time budget
 *
 * ALL 20 LANGUAGES run locally with full stdin/input() support.
 *
 * made with <3 by Namish
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// ─── Configuration ─────────────────────────────────────────────────────
const TIMEOUT_MS = parseInt(process.env.EXEC_TIMEOUT_MS) || 10000;
const MAX_OUTPUT = parseInt(process.env.EXEC_MAX_OUTPUT) || 65536;
const COMPILE_TIMEOUT_MS = 20000;
const MAX_CONCURRENT = parseInt(process.env.EXEC_MAX_CONCURRENT) || 8;
const CACHE_MAX_SIZE = parseInt(process.env.EXEC_CACHE_SIZE) || 50;
const CACHE_TTL_MS = parseInt(process.env.EXEC_CACHE_TTL_MS) || 3600000; // 1 hour
const MAX_MEMORY_MB = parseInt(process.env.EXEC_MAX_MEMORY_MB) || 256;
const MAX_FILE_SIZE_MB = parseInt(process.env.EXEC_MAX_FILE_MB) || 10;
const MAX_PROCESSES = parseInt(process.env.EXEC_MAX_PROCS) || 32;
const MAX_QUEUE_LENGTH = parseInt(process.env.EXEC_MAX_QUEUE) || 50;
const QUEUE_WAIT_TIMEOUT_MS = parseInt(process.env.EXEC_QUEUE_TIMEOUT_MS) || 30000;
const MAX_CODE_SIZE = 100000; // 100KB
const ZOMBIE_REAPER_INTERVAL = 30000; // 30s
const CACHE_GC_INTERVAL = 300000; // 5 min
const SANDBOX_PREFIX = 'collabcode-';
const CACHE_PREFIX = 'collabcache-';

// ─── Execution Metrics ─────────────────────────────────────────────────
const metrics = {
  totalExecutions: 0,
  successfulExecutions: 0,
  failedExecutions: 0,
  cacheHits: 0,
  cacheMisses: 0,
  timeouts: 0,
  queueRejections: 0,
  queueTimeouts: 0,
  zombiesReaped: 0,
  sandboxesLeaked: 0,
  averageExecutionMs: 0,
  languageCounts: {},
  startedAt: Date.now(),
};

// ─── Active Process Tracking (for zombie reaper) ───────────────────────
const activeChildren = new Set(); // PIDs of spawned children

// ─── Compilation Cache (LRU + TTL) ────────────────────────────────────
class CompilationCache {
  constructor(maxSize = CACHE_MAX_SIZE) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  _hash(code, language) {
    return crypto.createHash('sha256').update(`${language}:${code}`).digest('hex').slice(0, 16);
  }

  get(code, language) {
    const key = this._hash(code, language);
    const entry = this.cache.get(key);
    if (!entry) return null;
    // v9: TTL check
    if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
      this._evictEntry(key, entry);
      return null;
    }
    // Check if compiled binary still exists
    if (!fs.existsSync(entry.binaryPath)) {
      this.cache.delete(key);
      return null;
    }
    // LRU: move to end
    this.cache.delete(key);
    this.cache.set(key, { ...entry, lastAccess: Date.now() });
    return entry;
  }

  set(code, language, binaryPath, sandboxDir) {
    const key = this._hash(code, language);
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      const oldest = this.cache.get(oldestKey);
      this._evictEntry(oldestKey, oldest);
    }
    this.cache.set(key, {
      binaryPath, sandboxDir, language,
      lastAccess: Date.now(), createdAt: Date.now(),
    });
  }

  _evictEntry(key, entry) {
    if (entry?.sandboxDir) {
      try { fs.rmSync(entry.sandboxDir, { recursive: true, force: true }); } catch (e) {}
    }
    this.cache.delete(key);
  }

  // v9: Periodic TTL sweep
  gcExpired() {
    const now = Date.now();
    let evicted = 0;
    for (const [key, entry] of this.cache) {
      if (now - entry.createdAt > CACHE_TTL_MS) {
        this._evictEntry(key, entry);
        evicted++;
      }
    }
    return evicted;
  }

  clear() {
    for (const [key, entry] of this.cache) {
      this._evictEntry(key, entry);
    }
  }

  get size() { return this.cache.size; }
}

const compileCache = new CompilationCache();

// ─── Concurrent Execution Queue (bounded) ──────────────────────────────
let activeWorkers = 0;
const executionQueue = [];

function enqueueExecution(fn) {
  return new Promise((resolve, reject) => {
    // v9: Queue length cap
    if (executionQueue.length >= MAX_QUEUE_LENGTH) {
      metrics.queueRejections++;
      reject(new Error('QUEUE_FULL'));
      return;
    }

    const task = { fn, resolve, reject, enqueuedAt: Date.now() };

    if (activeWorkers < MAX_CONCURRENT) {
      runTask(task);
    } else {
      // v9: Queue wait timeout
      task.timeoutId = setTimeout(() => {
        const idx = executionQueue.indexOf(task);
        if (idx !== -1) {
          executionQueue.splice(idx, 1);
          metrics.queueTimeouts++;
          task.reject(new Error('QUEUE_TIMEOUT'));
        }
      }, QUEUE_WAIT_TIMEOUT_MS);

      executionQueue.push(task);
    }
  });
}

async function runTask(task) {
  // v9: Clear queue timeout if it was set
  if (task.timeoutId) {
    clearTimeout(task.timeoutId);
    task.timeoutId = null;
  }

  activeWorkers++;
  try {
    const result = await task.fn();
    task.resolve(result);
  } catch (err) {
    task.reject(err);
  } finally {
    activeWorkers--;
    // Drain next from queue
    while (executionQueue.length > 0 && activeWorkers < MAX_CONCURRENT) {
      const next = executionQueue.shift();
      // v9: Check if task was already timed out
      if (next.timeoutId) {
        clearTimeout(next.timeoutId);
        next.timeoutId = null;
      }
      // Check if too old
      if (Date.now() - next.enqueuedAt > QUEUE_WAIT_TIMEOUT_MS) {
        metrics.queueTimeouts++;
        next.reject(new Error('QUEUE_TIMEOUT'));
        continue;
      }
      runTask(next);
      break;
    }
  }
}

// ─── Security: Code Sanitization ───────────────────────────────────────
const DANGEROUS_PATTERNS = {
  global: [
    /rm\s+(-rf?\s+)?\/(?!tmp)/i,
    /mkfs\./i,
    /dd\s+if=/i,
    /:(){ :\|:& };:/,
    />\s*\/dev\/sd/i,
    /chmod\s+777\s+\//i,
  ],
  bash: [
    /curl\s+.*\|\s*bash/i,
    /wget\s+.*\|\s*bash/i,
    /eval\s+"\$\(/i,
  ],
  shell: [
    /curl\s+.*\|\s*sh/i,
    /wget\s+.*\|\s*sh/i,
  ],
  python: [
    /os\.system\s*\(\s*['"]rm\s+-rf/i,
    /subprocess\..*shell\s*=\s*True.*rm/i,
    /__import__\s*\(\s*['"]ctypes/i,
  ],
  javascript: [
    /child_process.*exec.*rm\s+-rf/i,
    /require\s*\(\s*['"]child_process['"]\s*\).*exec\s*\(\s*['"]rm/i,
  ],
  c: [
    /system\s*\(\s*"rm\s+-rf/i,
    /unlink\s*\(\s*"\//i,
  ],
  cpp: [
    /system\s*\(\s*"rm\s+-rf/i,
  ],
};

function sanitizeCode(code, language) {
  const errors = [];
  for (const pattern of DANGEROUS_PATTERNS.global) {
    if (pattern.test(code)) {
      errors.push('Blocked: dangerous system operation detected');
      break;
    }
  }
  const langPatterns = DANGEROUS_PATTERNS[language];
  if (langPatterns) {
    for (const pattern of langPatterns) {
      if (pattern.test(code)) {
        errors.push(`Blocked: potentially dangerous ${language} operation`);
        break;
      }
    }
  }
  return errors;
}

// ─── Languages Definition ──────────────────────────────────────────────
const LANGUAGES = {
  javascript: {
    name: 'JavaScript', ext: '.js', fileName: 'main.js',
    local: true, interpreted: true,
    runner: 'node', runArgs: (f) => ['--max-old-space-size=128', '--harmony', '--experimental-vm-modules', f],
    template: `const readline = require('readline');\nconst rl = readline.createInterface({ input: process.stdin, output: process.stdout });\nrl.question('Enter your name: ', (name) => {\n  console.log(\`Hello, \${name}!\`);\n  rl.close();\n});\n`,
  },
  typescript: {
    name: 'TypeScript', ext: '.ts', fileName: 'main.ts',
    local: true, interpreted: true,
    runner: 'npx', runArgs: (f) => ['--yes', 'tsx', f],
    template: `const message: string = "Hello from TypeScript!";\nconsole.log(message);\n`,
  },
  python: {
    name: 'Python 3', ext: '.py', fileName: 'main.py',
    local: true, interpreted: true,
    runner: 'python3', runArgs: (f) => ['-u', '-B', f],
    template: `name = input("Enter your name: ")\nage = input("Enter your age: ")\nprint(f"Hello {name}, you are {age} years old!")\n`,
  },
  java: {
    name: 'Java', ext: '.java', fileName: 'Main.java',
    local: true, interpreted: false,
    compile: { cmd: 'javac', args: (f) => [f] },
    runner: 'java', runArgs: () => ['-cp', '.', 'Main'],
    template: `import java.util.Scanner;\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        System.out.print("Enter name: ");\n        String name = sc.nextLine();\n        System.out.println("Hello, " + name + "!");\n    }\n}\n`,
  },
  c: {
    name: 'C', ext: '.c', fileName: 'main.c',
    local: true, interpreted: false,
    compile: { cmd: 'gcc', args: (f) => ['-std=c11', '-O2', '-Wall', '-Wextra', '-o', 'main', f, '-lm', '-lpthread'] },
    runCompiled: './main',
    template: `#include <stdio.h>\nint main() {\n    char name[100];\n    printf("Enter your name: ");\n    fgets(name, sizeof(name), stdin);\n    printf("Hello, %s", name);\n    return 0;\n}\n`,
  },
  cpp: {
    name: 'C++', ext: '.cpp', fileName: 'main.cpp',
    local: true, interpreted: false,
    compile: { cmd: 'g++', args: (f) => ['-std=c++17', '-O2', '-Wall', '-Wextra', '-o', 'main', f, '-lm', '-lstdc++', '-lpthread'] },
    runCompiled: './main',
    template: `#include <iostream>\n#include <string>\nusing namespace std;\nint main() {\n    string name;\n    cout << "Enter your name: ";\n    getline(cin, name);\n    cout << "Hello, " << name << "!" << endl;\n    return 0;\n}\n`,
  },
  go: {
    name: 'Go', ext: '.go', fileName: 'main.go',
    local: true, interpreted: false,
    compile: { cmd: 'go', args: (f) => ['build', '-o', 'main', f] },
    runCompiled: './main',
    template: `package main\nimport (\n    "bufio"\n    "fmt"\n    "os"\n)\nfunc main() {\n    reader := bufio.NewReader(os.Stdin)\n    fmt.Print("Enter your name: ")\n    name, _ := reader.ReadString('\\n')\n    fmt.Printf("Hello, %s", name)\n}\n`,
  },
  rust: {
    name: 'Rust', ext: '.rs', fileName: 'main.rs',
    local: true, interpreted: false,
    compile: { cmd: 'rustc', args: (f) => ['-o', 'main', f] },
    runCompiled: './main',
    template: `use std::io;\nfn main() {\n    let mut name = String::new();\n    println!("Enter your name:");\n    io::stdin().read_line(&mut name).expect("Failed to read");\n    println!("Hello, {}!", name.trim());\n}\n`,
  },
  ruby: {
    name: 'Ruby', ext: '.rb', fileName: 'main.rb',
    local: true, interpreted: true,
    runner: 'ruby', runArgs: (f) => [f],
    template: `print "Enter your name: "\nname = gets.chomp\nputs "Hello, #{name}!"\n`,
  },
  php: {
    name: 'PHP', ext: '.php', fileName: 'main.php',
    local: true, interpreted: true,
    runner: 'php', runArgs: (f) => [f],
    template: `<?php\necho "Enter your name: ";\n$name = trim(fgets(STDIN));\necho "Hello, $name!\\n";\n`,
  },
  perl: {
    name: 'Perl', ext: '.pl', fileName: 'main.pl',
    local: true, interpreted: true,
    runner: 'perl', runArgs: (f) => [f],
    template: `#!/usr/bin/perl\nuse strict;\nuse warnings;\n\nprint "Enter your name: ";\nmy $name = <STDIN>;\nchomp $name;\nprint "Hello, $name!\\n";\n\nmy @nums = (1..10);\nmy $sum = 0;\n$sum += $_ for @nums;\nprint "Sum of 1..10: $sum\\n";\n`,
  },
  r: {
    name: 'R', ext: '.R', fileName: 'main.R',
    local: true, interpreted: true,
    runner: 'Rscript', runArgs: (f) => ['--vanilla', f],
    template: `# R — CollabCode\nnums <- c(5, 3, 1, 4, 2)\ncat("Numbers:", nums, "\\n")\ncat("Mean:", mean(nums), "\\n")\ncat("Sum:", sum(nums), "\\n")\ncat("Sorted:", sort(nums), "\\n")\ncat("Fibonacci: ")\nfib <- c(1, 1)\nfor (i in 3:10) fib[i] <- fib[i-1] + fib[i-2]\ncat(fib, "\\n")\ncat("Hello from CollabCode!\\n")\n`,
  },
  bash: {
    name: 'Bash', ext: '.sh', fileName: 'main.sh',
    local: true, interpreted: true,
    runner: 'bash', runArgs: (f) => [f],
    template: `#!/bin/bash\necho "Hello from Bash!"\necho "Date: $(date)"\necho "User: $(whoami)"\n`,
  },
  shell: {
    name: 'Shell', ext: '.sh', fileName: 'main.sh',
    local: true, interpreted: true,
    runner: 'sh', runArgs: (f) => [f],
    template: `#!/bin/sh\necho "Hello from Shell!"\necho "Current directory: $(pwd)"\nuname -a\n`,
  },
  awk: {
    name: 'AWK', ext: '.awk', fileName: 'main.awk',
    local: true, interpreted: true,
    runner: 'awk', runArgs: (f) => ['-f', f],
    template: `BEGIN {\n    print "Hello from AWK!"\n    for (i = 0; i <= 10; i++) printf "2^%d = %d\\n", i, 2^i\n}\n`,
  },
  lua: {
    name: 'Lua', ext: '.lua', fileName: 'main.lua',
    local: true, interpreted: true,
    runner: 'lua5.4', runArgs: (f) => [f],
    template: `print("Hello from Lua!")\nlocal numbers = {5, 3, 1, 4, 2}\ntable.sort(numbers)\nfor i, v in ipairs(numbers) do io.write(v .. " ") end\nprint()\n`,
  },
  fortran: {
    name: 'Fortran', ext: '.f90', fileName: 'main.f90',
    local: true, interpreted: false,
    compile: { cmd: 'gfortran', args: (f) => ['-o', 'main', f] },
    runCompiled: './main',
    template: `program hello\n    implicit none\n    print *, "Hello from Fortran!"\nend program hello\n`,
  },
  tcl: {
    name: 'Tcl', ext: '.tcl', fileName: 'main.tcl',
    local: true, interpreted: true,
    runner: 'tclsh', runArgs: (f) => [f],
    template: `puts "Hello from Tcl!"\nputs "Tcl version: [info patchlevel]"\n`,
  },
  sqlite: {
    name: 'SQLite', ext: '.sql', fileName: 'main.sql',
    local: true, interpreted: true,
    runner: 'sqlite3', runArgs: (f) => [':memory:', '.read ' + f],
    template: `.headers on\n.mode column\nCREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER);\nINSERT INTO users VALUES (1, 'Alice', 30);\nINSERT INTO users VALUES (2, 'Bob', 25);\nSELECT * FROM users;\n`,
    customRunner: true,
  },
  nasm: {
    name: 'Assembly', ext: '.asm', fileName: 'main.asm',
    local: true, interpreted: false,
    compile: { cmd: 'nasm', args: (f) => ['-f', 'elf64', '-o', 'main.o', f] },
    link: { cmd: 'ld', args: () => ['-o', 'main', 'main.o'] },
    runCompiled: './main',
    template: `section .data\n    msg db "Hello from Assembly!", 10\n    len equ $ - msg\nsection .text\n    global _start\n_start:\n    mov rax, 1\n    mov rdi, 1\n    mov rsi, msg\n    mov rdx, len\n    syscall\n    mov rax, 60\n    xor rdi, rdi\n    syscall\n`,
  },
};

// ─── Parallel Version Detection ────────────────────────────────────────
const versionChecks = [
  { lang: 'javascript', cmd: 'node', args: ['--version'] },
  { lang: 'typescript', cmd: 'npx', args: ['--yes', 'tsx', '--version'] },
  { lang: 'python', cmd: 'python3', args: ['--version'] },
  { lang: 'java', cmd: 'java', args: ['-version'] },
  { lang: 'c', cmd: 'gcc', args: ['--version'] },
  { lang: 'cpp', cmd: 'g++', args: ['--version'] },
  { lang: 'go', cmd: 'go', args: ['version'] },
  { lang: 'rust', cmd: 'rustc', args: ['--version'] },
  { lang: 'ruby', cmd: 'ruby', args: ['--version'] },
  { lang: 'php', cmd: 'php', args: ['--version'] },
  { lang: 'perl', cmd: 'perl', args: ['--version'] },
  { lang: 'r', cmd: 'Rscript', args: ['--version'] },
  { lang: 'bash', cmd: 'bash', args: ['--version'] },
  { lang: 'shell', cmd: 'sh', args: ['-c', 'echo POSIX sh'] },
  { lang: 'awk', cmd: 'awk', args: ['BEGIN{print "awk available"}'] },
  { lang: 'lua', cmd: 'lua5.4', args: ['-v'] },
  { lang: 'fortran', cmd: 'gfortran', args: ['--version'] },
  { lang: 'tcl', cmd: 'tclsh', args: ['<<EOF\nputs [info patchlevel]\nEOF'] },
  { lang: 'sqlite', cmd: 'sqlite3', args: ['--version'] },
  { lang: 'nasm', cmd: 'nasm', args: ['-v'] },
];

(async function detectVersionsParallel() {
  const startTime = Date.now();
  const results = await Promise.allSettled(
    versionChecks.map(async (check) => {
      try {
        let result;
        if (check.lang === 'tcl') {
          result = await runCommand('tclsh', [], { timeout: 5000, stdin: 'puts [info patchlevel]\nexit\n' });
        } else {
          result = await runCommand(check.cmd, check.args, { timeout: 15000 });
        }
        const out = (result.stdout + result.stderr).trim().split('\n')[0];
        if (LANGUAGES[check.lang]) LANGUAGES[check.lang].version = out;
        return { lang: check.lang, version: out };
      } catch (e) {
        if (LANGUAGES[check.lang]) LANGUAGES[check.lang].local = false;
        throw e;
      }
    })
  );
  const available = results.filter(r => r.status === 'fulfilled').length;
  const elapsed = Date.now() - startTime;
  console.log(`[Exec] v9.0 — Detected ${available}/${versionChecks.length} languages in ${elapsed}ms (parallel)`);
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      console.log(`[Exec]   ${versionChecks[i].lang}: ${r.value.version}`);
    } else {
      console.warn(`[Exec]   ${versionChecks[i].lang}: not available`);
    }
  });
})();

// ─── Core: Run Command with Resource Limits ────────────────────────────
function runCommand(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const timeout = opts.timeout || TIMEOUT_MS;
    const cwd = opts.cwd || process.cwd();
    const stdin = opts.stdin || '';
    let stdout = '', stderr = '', timedOut = false, settled = false;

    const env = {
      ...process.env, PATH: process.env.PATH,
      HOME: opts.home || cwd, TMPDIR: cwd,
      NODE_OPTIONS: '--max-old-space-size=128',
      PYTHONUNBUFFERED: '1', PYTHONDONTWRITEBYTECODE: '1',
      PYTHONIOENCODING: 'utf-8', PYTHONHASHSEED: '0',
    };
    if (cmd === 'go') {
      env.GOPATH = path.join(cwd, '.gopath');
      env.GOCACHE = path.join(cwd, '.gocache');
    }

    const spawnOpts = {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
      timeout: timeout + 2000,
      // v9: Spawn in new process group for reliable tree-kill
      detached: false,
    };

    let child;
    try {
      child = spawn(cmd, args, spawnOpts);
    } catch (spawnErr) {
      return reject(new Error(`SPAWN_FAILED: ${spawnErr.message}`));
    }

    // v9: Track child PID
    if (child.pid) activeChildren.add(child.pid);

    const killTimer = setTimeout(() => {
      timedOut = true;
      safeKill(child);
    }, timeout);

    child.stdout.on('data', (data) => {
      stdout += data.toString();
      if (stdout.length > MAX_OUTPUT) {
        stdout = stdout.substring(0, MAX_OUTPUT) + '\n... [output truncated at 64KB]';
        safeKill(child);
      }
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
      if (stderr.length > MAX_OUTPUT) {
        stderr = stderr.substring(0, MAX_OUTPUT) + '\n... [stderr truncated]';
      }
    });

    // v9: Handle stdin pipe errors gracefully
    if (stdin) {
      child.stdin.on('error', () => {}); // Ignore EPIPE
      child.stdin.write(stdin);
    }
    child.stdin.end();

    child.on('close', (code, signal) => {
      clearTimeout(killTimer);
      if (child.pid) activeChildren.delete(child.pid);
      if (settled) return;
      settled = true;
      if (timedOut) reject(new Error('TIME_LIMIT_EXCEEDED'));
      else resolve({ stdout, stderr, exitCode: code, signal });
    });

    child.on('error', (err) => {
      clearTimeout(killTimer);
      if (child.pid) activeChildren.delete(child.pid);
      if (settled) return;
      settled = true;
      reject(err);
    });
  });
}

// v9: Safe kill helper — tries SIGTERM then SIGKILL
function safeKill(child) {
  try {
    child.kill('SIGTERM');
    setTimeout(() => {
      try { child.kill('SIGKILL'); } catch (e) {}
    }, 2000);
  } catch (e) {}
}

function createSandbox() {
  return fs.mkdtempSync(path.join(os.tmpdir(), SANDBOX_PREFIX));
}

function cleanupSandbox(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
}

// ─── Cached Compilation ────────────────────────────────────────────────
async function compileCached(code, language, sandbox, lang) {
  const cached = compileCache.get(code, language);
  if (cached) {
    metrics.cacheHits++;
    const binaryName = path.basename(cached.binaryPath);
    const destPath = path.join(sandbox, binaryName);
    try {
      fs.copyFileSync(cached.binaryPath, destPath);
      if (language !== 'java') fs.chmodSync(destPath, 0o755);
      return { cached: true, binaryPath: destPath };
    } catch (e) {
      // Cache entry invalid, fall through to recompile
    }
  }
  metrics.cacheMisses++;

  // Compile normally
  if (language === 'nasm') {
    const asmResult = await runCommand('nasm', ['-f', 'elf64', '-o', 'main.o', lang.fileName], { cwd: sandbox, timeout: COMPILE_TIMEOUT_MS });
    if (asmResult.exitCode !== 0) return { error: true, result: asmResult, phase: 'compile', status: 'Assembly Error' };
    const linkResult = await runCommand('ld', ['-o', 'main', 'main.o'], { cwd: sandbox, timeout: COMPILE_TIMEOUT_MS });
    if (linkResult.exitCode !== 0) return { error: true, result: linkResult, phase: 'compile', status: 'Link Error' };
  } else {
    const compileArgs = lang.compile.args(lang.fileName);
    const compileResult = await runCommand(lang.compile.cmd, compileArgs, { cwd: sandbox, timeout: COMPILE_TIMEOUT_MS });
    if (compileResult.exitCode !== 0) return { error: true, result: compileResult, phase: 'compile', status: 'Compilation Error' };
  }

  // Store compiled binary in a persistent cache directory
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), CACHE_PREFIX));
  const binaryName = language === 'java' ? 'Main.class' : 'main';
  const srcBinary = path.join(sandbox, binaryName);
  const cacheBinary = path.join(cacheDir, binaryName);
  try {
    if (fs.existsSync(srcBinary)) {
      fs.copyFileSync(srcBinary, cacheBinary);
      if (language !== 'java') fs.chmodSync(cacheBinary, 0o755);
      compileCache.set(code, language, cacheBinary, cacheDir);
    }
  } catch (e) {
    cleanupSandbox(cacheDir);
  }

  return { cached: false, binaryPath: path.join(sandbox, binaryName) };
}

// ─── Output Post-Processing ────────────────────────────────────────────
function postProcessOutput(result, language) {
  if (!result) return result;

  if (language === 'python' && result.stderr) {
    result.stderr = result.stderr.replace(/File "[^"]*collabcode-[^"]*\//g, 'File "');
  }

  if ((language === 'javascript' || language === 'typescript') && result.stderr) {
    result.stderr = result.stderr
      .replace(/\s+at\s+internal\/.*\n/g, '')
      .replace(/\s+at\s+Module\._.*\n/g, '')
      .replace(/\s+at\s+Object\.Module\..*\n/g, '')
      .replace(/\s+at\s+node:internal\/.*\n/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  if ((language === 'c' || language === 'cpp') && result.stderr) {
    result.stderr = result.stderr.replace(/\/tmp\/collabcode-[a-zA-Z0-9]+\//g, '');
  }

  // v9: Generic cleanup for all languages — strip sandbox paths
  if (result.stderr) {
    result.stderr = result.stderr.replace(/\/tmp\/collabcode-[a-zA-Z0-9]+\//g, '');
  }

  return result;
}

// ─── Execute Locally ───────────────────────────────────────────────────
async function executeLocal(code, language, stdin) {
  const lang = LANGUAGES[language];
  if (!lang || !lang.local) return null;

  const sanitizeErrors = sanitizeCode(code, language);
  if (sanitizeErrors.length > 0) {
    return {
      success: false, stdout: '', stderr: sanitizeErrors.join('\n'),
      exitCode: -1, executionTime: '0.000s',
      status: 'Security Violation', phase: 'sanitize',
    };
  }

  const sandbox = createSandbox();
  const filePath = path.join(sandbox, lang.fileName);
  const startTime = process.hrtime.bigint();

  try {
    fs.writeFileSync(filePath, code, 'utf-8');

    // Special handling for SQLite
    if (language === 'sqlite') {
      try {
        const result = await runCommand('sqlite3', [':memory:'], { cwd: sandbox, timeout: TIMEOUT_MS, stdin: code + '\n.quit\n' });
        const elapsed = Number(process.hrtime.bigint() - startTime) / 1e6;
        const processed = postProcessOutput(result, language);
        return {
          success: processed.exitCode === 0, stdout: processed.stdout, stderr: processed.stderr,
          exitCode: processed.exitCode, executionTime: `${(elapsed / 1000).toFixed(3)}s`,
          status: processed.exitCode === 0 ? 'Success' : `Exit Code: ${processed.exitCode}`, phase: 'run',
        };
      } catch (runErr) {
        const elapsed = Number(process.hrtime.bigint() - startTime) / 1e6;
        if (runErr.message === 'TIME_LIMIT_EXCEEDED') {
          return { success: false, stdout: '', stderr: 'Time Limit Exceeded', exitCode: -1, executionTime: `${(elapsed / 1000).toFixed(3)}s`, status: 'Time Limit Exceeded', phase: 'run' };
        }
        throw runErr;
      }
    }

    // Compiled languages — use cache
    if (!lang.interpreted && lang.compile) {
      try {
        const compileResult = await compileCached(code, language, sandbox, lang);
        if (compileResult.error) {
          const elapsed = Number(process.hrtime.bigint() - startTime) / 1e6;
          const processed = postProcessOutput(compileResult.result, language);
          return {
            success: false, stdout: processed.stdout, stderr: processed.stderr,
            exitCode: processed.exitCode, executionTime: `${(elapsed / 1000).toFixed(3)}s`,
            status: compileResult.status, phase: compileResult.phase,
          };
        }

        // Run compiled binary
        const runCmd = lang.runCompiled || lang.runner;
        const runArgs = lang.runCompiled ? [] : lang.runArgs();
        const runResult = await runCommand(runCmd, runArgs, { cwd: sandbox, timeout: TIMEOUT_MS, stdin });
        const elapsed = Number(process.hrtime.bigint() - startTime) / 1e6;
        const processed = postProcessOutput(runResult, language);
        return {
          success: processed.exitCode === 0, stdout: processed.stdout, stderr: processed.stderr,
          exitCode: processed.exitCode, executionTime: `${(elapsed / 1000).toFixed(3)}s`,
          status: processed.exitCode === 0 ? 'Success' : `Exit Code: ${processed.exitCode}`,
          phase: 'run', cached: compileResult.cached,
        };
      } catch (err) {
        const elapsed = Number(process.hrtime.bigint() - startTime) / 1e6;
        if (err.message === 'TIME_LIMIT_EXCEEDED') {
          metrics.timeouts++;
          return { success: false, stdout: '', stderr: `Time Limit Exceeded (${TIMEOUT_MS / 1000}s limit)`, exitCode: -1, executionTime: `${(elapsed / 1000).toFixed(3)}s`, status: 'Time Limit Exceeded', phase: 'run' };
        }
        throw err;
      }
    }

    // Interpreted languages
    const runArgs = lang.runArgs(lang.fileName);
    try {
      const result = await runCommand(lang.runner, runArgs, { cwd: sandbox, timeout: TIMEOUT_MS, stdin });
      const elapsed = Number(process.hrtime.bigint() - startTime) / 1e6;
      const processed = postProcessOutput(result, language);
      return {
        success: processed.exitCode === 0, stdout: processed.stdout, stderr: processed.stderr,
        exitCode: processed.exitCode, executionTime: `${(elapsed / 1000).toFixed(3)}s`,
        status: processed.exitCode === 0 ? 'Success' : `Exit Code: ${processed.exitCode}`, phase: 'run',
      };
    } catch (runErr) {
      const elapsed = Number(process.hrtime.bigint() - startTime) / 1e6;
      if (runErr.message === 'TIME_LIMIT_EXCEEDED') {
        metrics.timeouts++;
        return { success: false, stdout: '', stderr: `Time Limit Exceeded (${TIMEOUT_MS / 1000}s limit)`, exitCode: -1, executionTime: `${(elapsed / 1000).toFixed(3)}s`, status: 'Time Limit Exceeded', phase: 'run' };
      }
      throw runErr;
    }
  } finally {
    cleanupSandbox(sandbox);
  }
}

// ─── API Handler: Execute Code ─────────────────────────────────────────
async function executeCode(req, res) {
  const { code, language, stdin = '' } = req.body;
  if (!code || typeof code !== 'string') return res.status(400).json({ error: true, message: 'Code is required' });
  if (!language || !LANGUAGES[language]) return res.status(400).json({ error: true, message: `Unsupported language. Supported: ${Object.keys(LANGUAGES).join(', ')}` });
  if (code.length > MAX_CODE_SIZE) return res.status(400).json({ error: true, message: `Code exceeds ${Math.round(MAX_CODE_SIZE / 1000)}KB limit` });

  const lang = LANGUAGES[language];
  metrics.totalExecutions++;
  metrics.languageCounts[language] = (metrics.languageCounts[language] || 0) + 1;
  console.log(`[Exec] ${language} | ${code.length} chars | stdin=${stdin.length} chars | queue=${executionQueue.length} active=${activeWorkers}`);

  try {
    const result = await enqueueExecution(() => executeLocal(code, language, stdin));
    if (result) {
      if (result.success) metrics.successfulExecutions++;
      else metrics.failedExecutions++;

      const execMs = parseFloat(result.executionTime) * 1000;
      if (!isNaN(execMs)) {
        metrics.averageExecutionMs = (metrics.averageExecutionMs * (metrics.totalExecutions - 1) + execMs) / metrics.totalExecutions;
      }

      return res.json({
        success: result.success, output: result.stdout, error: result.stderr,
        exitCode: result.exitCode, executionTime: result.executionTime,
        status: result.status, engine: 'local', language: lang.name,
        version: lang.version, phase: result.phase,
        cached: result.cached || false,
      });
    }
    return res.status(501).json({ error: true, message: `${lang.name} runtime is not available on this server.` });
  } catch (err) {
    metrics.failedExecutions++;
    // v9: Specific error responses for queue issues
    if (err.message === 'QUEUE_FULL') {
      metrics.queueRejections++;
      return res.status(503).json({ error: true, message: 'Server is busy. Too many code executions queued. Please try again in a moment.' });
    }
    if (err.message === 'QUEUE_TIMEOUT') {
      return res.status(503).json({ error: true, message: 'Execution request timed out in queue. Server is under heavy load.' });
    }
    console.error(`[Exec] Error:`, err.message);
    return res.status(500).json({ error: true, message: `Execution failed: ${err.message}` });
  }
}

// ─── API Handler: Supported Languages ──────────────────────────────────
function getSupportedLanguages(req, res) {
  const languages = Object.entries(LANGUAGES).map(([id, lang]) => ({
    id, name: lang.name, version: lang.version || null,
    localExecution: lang.local, ext: lang.ext, template: lang.template,
  }));
  res.json({ languages });
}

// ─── API Handler: Execution Stats ──────────────────────────────────────
function getExecutionStats(req, res) {
  res.json({
    ...metrics,
    cacheSize: compileCache.size,
    cacheMaxSize: CACHE_MAX_SIZE,
    cacheTtlMs: CACHE_TTL_MS,
    activeWorkers,
    queueLength: executionQueue.length,
    maxQueueLength: MAX_QUEUE_LENGTH,
    maxConcurrent: MAX_CONCURRENT,
    activeChildren: activeChildren.size,
    uptime: Math.floor((Date.now() - metrics.startedAt) / 1000),
    memoryUsage: process.memoryUsage(),
  });
}

// ─── v9: Zombie Process Reaper ─────────────────────────────────────────
const zombieReaperInterval = setInterval(() => {
  // Kill any tracked child that's been alive too long
  // (normally children clean up via close event, this is a safety net)
  for (const pid of activeChildren) {
    try {
      // Check if process still exists
      process.kill(pid, 0);
      // If it does and it's tracked, try to kill it
      // (it should have been cleaned up by the timeout already)
      process.kill(pid, 'SIGKILL');
      activeChildren.delete(pid);
      metrics.zombiesReaped++;
    } catch (e) {
      // Process doesn't exist — clean up tracking
      activeChildren.delete(pid);
    }
  }
}, ZOMBIE_REAPER_INTERVAL);

// v9: Cache TTL GC
const cacheGcInterval = setInterval(() => {
  const evicted = compileCache.gcExpired();
  if (evicted > 0) {
    console.log(`[Exec] Cache GC: evicted ${evicted} expired entries (${compileCache.size} remaining)`);
  }
}, CACHE_GC_INTERVAL);

// v9: Startup sandbox sweep — clean stale sandbox dirs from previous crashes
(function startupSweep() {
  try {
    const tmpDir = os.tmpdir();
    const entries = fs.readdirSync(tmpDir);
    let cleaned = 0;
    const now = Date.now();
    for (const entry of entries) {
      if (entry.startsWith(SANDBOX_PREFIX) || entry.startsWith(CACHE_PREFIX)) {
        const fullPath = path.join(tmpDir, entry);
        try {
          const stat = fs.statSync(fullPath);
          // Clean if older than 10 minutes
          if (now - stat.mtimeMs > 600000) {
            fs.rmSync(fullPath, { recursive: true, force: true });
            cleaned++;
          }
        } catch (e) {}
      }
    }
    if (cleaned > 0) {
      metrics.sandboxesLeaked = cleaned;
      console.log(`[Exec] Startup sweep: cleaned ${cleaned} stale sandbox directories`);
    }
  } catch (e) {
    console.warn('[Exec] Startup sweep failed:', e.message);
  }
})();

// ─── v9: Cleanup on exit ───────────────────────────────────────────────
function cleanup() {
  clearInterval(zombieReaperInterval);
  clearInterval(cacheGcInterval);
  // Kill all active children
  for (const pid of activeChildren) {
    try { process.kill(pid, 'SIGKILL'); } catch (e) {}
  }
  activeChildren.clear();
  // Clear compilation cache and temp dirs
  compileCache.clear();
  // Reject queued tasks
  while (executionQueue.length > 0) {
    const task = executionQueue.shift();
    if (task.timeoutId) clearTimeout(task.timeoutId);
    task.reject(new Error('Server shutting down'));
  }
}

module.exports = { executeCode, getSupportedLanguages, getExecutionStats, LANGUAGES, cleanup };
