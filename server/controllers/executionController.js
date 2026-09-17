/**
 * Execution Controller v10.0 — High-Concurrency Rework
 *
 * Architecture:
 *  - Adaptive Multi-Lane Concurrency Queue (Fast Lane vs Strict Compile Lane)
 *  - Dynamic Backpressure (Event-Loop Lag & Memory Headroom Shedding)
 *  - Client Disconnect & AbortSignal Propagation (req.on('close'))
 *  - In-Flight Singleflight Deduplication & 3-Tier Caching (Result + Binary)
 *  - Process Group Tree-Kill (process.kill(-pid, 'SIGKILL')) & Zombie Reaper
 *  - Streaming Output Buffering with Instant 64KB Truncation & Pipe Teardown
 *  - Resilient Judge0 Cloud Runner with Circuit Breaker & Adaptive Polling
 *  - Full Support for All 20 Languages with Local + Cloud Fallback
 *
 * made with <3 by Namish
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { adaptiveQueue } = require('./executionEngine/queue');
const {
  runSandboxedCommand,
  createSandbox,
  cleanupSandbox,
  cleanupAllProcesses,
  getActiveProcessCount,
  getActiveSandboxCount,
  TIMEOUT_MS,
  MAX_OUTPUT,
} = require('./executionEngine/processManager');
const {
  resultCache,
  singleflight,
  compilationCache,
  CACHE_DIR_PREFIX,
} = require('./executionEngine/cache');
const {
  executeCloud,
  JUDGE0_LANGUAGE_MAP,
  circuitBreaker,
} = require('./executionEngine/cloudRunner');

// ─── Constants ─────────────────────────────────────────────────────────
const COMPILE_TIMEOUT_MS = 20000;
const MAX_CODE_SIZE = 100000; // 100KB

// ─── Execution Metrics ─────────────────────────────────────────────────
const metrics = {
  totalExecutions: 0,
  successfulExecutions: 0,
  failedExecutions: 0,
  cacheHits: 0,
  cacheMisses: 0,
  timeouts: 0,
  abortedExecutions: 0,
  averageExecutionMs: 0,
  languageCounts: {},
  startedAt: Date.now(),
};

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
    runner: require('path').resolve(__dirname, '../node_modules/.bin/tsx'),
    runArgs: (f) => [f],
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

// ─── Parallel Local Version Detection ──────────────────────────────────
const versionChecks = [
  { lang: 'javascript', cmd: 'node', args: ['--version'] },
  { lang: 'typescript', cmd: require('path').resolve(__dirname, '../node_modules/.bin/tsx'), args: ['--version'] },
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
          result = await runSandboxedCommand('tclsh', [], { timeout: 5000, stdin: 'puts [info patchlevel]\nexit\n' });
        } else {
          result = await runSandboxedCommand(check.cmd, check.args, { timeout: 10000 });
        }
        if (result.exitCode !== 0) {
          throw new Error(result.stderr || `Exit code ${result.exitCode}`);
        }
        const out = (result.stdout + result.stderr).trim().split('\n')[0];
        if (out.includes('Unable to locate') || out.includes('not found') || out.includes('No Java')) {
          throw new Error('Runtime stub');
        }
        if (LANGUAGES[check.lang]) LANGUAGES[check.lang].version = out;
        return { lang: check.lang, version: out };
      } catch (e) {
        if (LANGUAGES[check.lang]) LANGUAGES[check.lang].local = false;
        throw e;
      }
    })
  );
  const available = results.filter((r) => r.status === 'fulfilled').length;
  const elapsed = Date.now() - startTime;
  console.log(`[Exec v10.0] Detected ${available}/${versionChecks.length} local languages in ${elapsed}ms`);
})();

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

  if (result.stderr) {
    result.stderr = result.stderr.replace(/\/tmp\/collabcode-[a-zA-Z0-9]+\//g, '');
  }

  if (result.stderr && result.exitCode !== 0) {
    result.parsedErrors = parseErrors(result.stderr, language);
  }

  return result;
}

// ─── Structured Error Parsing ──────────────────────────────────────────
function parseErrors(stderr, language) {
  const errors = [];
  const lines = (stderr || '').split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let parsed = null;

    // Python
    if (language === 'python') {
      const fileMatch = line.match(/\s*File\s+"([^"]*)",\s*line\s*(\d+)(?:,\s*in\s+(.+))?/);
      if (fileMatch) {
        parsed = { file: fileMatch[1], line: parseInt(fileMatch[2]), context: fileMatch[3] || '' };
      }
      const errMatch = line.match(/^(\w*Error|\w*Exception|\w*Warning):\s*(.+)/);
      if (errMatch) {
        if (parsed) {
          parsed.type = errMatch[1];
          parsed.message = errMatch[2];
        } else {
          parsed = { type: errMatch[1], message: errMatch[2] };
        }
      }
    }

    // JS / TS
    if (language === 'javascript' || language === 'typescript') {
      const fileMatch = line.match(/^\s*([\w.-]+\.[jt]sx?):(\d+)(?::(\d+))?/);
      if (fileMatch) {
        parsed = { file: fileMatch[1], line: parseInt(fileMatch[2]), column: fileMatch[3] ? parseInt(fileMatch[3]) : undefined };
      }
      const errMatch = line.match(/^\s*(\w*Error|\w*TypeError|\w*RangeError|\w*ReferenceError|\w*SyntaxError):\s*(.+)/);
      if (errMatch) {
        if (parsed) {
          parsed.type = errMatch[1];
          parsed.message = errMatch[2];
        } else {
          parsed = { type: errMatch[1], message: errMatch[2] };
        }
      }
    }

    // C / C++
    if (language === 'c' || language === 'cpp') {
      const gccMatch = line.match(/^([\w.-]+\.\w+):(\d+):(\d+):\s*(error|warning|note|fatal error):\s*(.+)/);
      if (gccMatch) {
        parsed = { file: gccMatch[1], line: parseInt(gccMatch[2]), column: parseInt(gccMatch[3]), type: gccMatch[4], message: gccMatch[5] };
      }
    }

    // Java
    if (language === 'java') {
      const javaMatch = line.match(/^([\w.-]+\.java):(\d+):\s*(error|warning):\s*(.+)/);
      if (javaMatch) {
        parsed = { file: javaMatch[1], line: parseInt(javaMatch[2]), type: javaMatch[3], message: javaMatch[4] };
      }
    }

    // Go
    if (language === 'go') {
      const goMatch = line.match(/^\.?\/?(\w[\w.-]*\.go):(\d+):(\d+):\s*(.+)/);
      if (goMatch) {
        parsed = { file: goMatch[1], line: parseInt(goMatch[2]), column: parseInt(goMatch[3]), message: goMatch[4] };
      }
    }

    // Rust
    if (language === 'rust') {
      const rustErrMatch = line.match(/^(error|warning)\[?(E\d+)?\]?:\s*(.+)/);
      if (rustErrMatch) {
        parsed = { type: rustErrMatch[1], code: rustErrMatch[2] || '', message: rustErrMatch[3] };
      }
      const rustLocMatch = line.match(/-->\s*([\w.-]+):(\d+):(\d+)/);
      if (rustLocMatch) {
        parsed = parsed || {};
        parsed.file = rustLocMatch[1];
        parsed.line = parseInt(rustLocMatch[2]);
        parsed.column = parseInt(rustLocMatch[3]);
      }
    }

    // Ruby
    if (language === 'ruby') {
      const rubyMatch = line.match(/^([\w.-]+\.rb):(\d+)(?::in\s*`(.+)')?:\s*(.+)/);
      if (rubyMatch) {
        parsed = { file: rubyMatch[1], line: parseInt(rubyMatch[2]), context: rubyMatch[3] || '', message: rubyMatch[4] };
      }
    }

    // PHP
    if (language === 'php') {
      const phpMatch = line.match(/(Fatal error|Parse error|Warning|Notice):\s*(.+?)\s+in\s+([\w.-]+\.php)\s+on\s+line\s+(\d+)/);
      if (phpMatch) {
        parsed = { type: phpMatch[1], message: phpMatch[2], file: phpMatch[3], line: parseInt(phpMatch[4]) };
      }
    }

    if (parsed && (parsed.line || parsed.type)) {
      errors.push(parsed);
    }
  }

  return errors;
}

// ─── Execute Locally with Sandbox & Caching ────────────────────────────
async function executeLocal(code, language, stdin, abortSignal) {
  const lang = LANGUAGES[language];
  if (!lang || !lang.local) return null;

  const sanitizeErrors = sanitizeCode(code, language);
  if (sanitizeErrors.length > 0) {
    return {
      success: false,
      stdout: '',
      stderr: sanitizeErrors.join('\n'),
      exitCode: -1,
      executionTime: '0.000s',
      status: 'Security Violation',
      phase: 'sanitize',
      engine: 'local',
      parsedErrors: [],
    };
  }

  const sandbox = createSandbox();
  const filePath = path.join(sandbox, lang.fileName);
  const startTime = process.hrtime.bigint();

  try {
    fs.writeFileSync(filePath, code, 'utf-8');

    // SQLite in-memory execution
    if (language === 'sqlite') {
      try {
        const result = await runSandboxedCommand('sqlite3', [':memory:'], {
          cwd: sandbox,
          timeout: TIMEOUT_MS,
          stdin: code + '\n.quit\n',
          abortSignal,
        });
        const elapsed = Number(process.hrtime.bigint() - startTime) / 1e6;
        const processed = postProcessOutput(result, language);
        return {
          success: processed.exitCode === 0,
          stdout: processed.stdout,
          stderr: processed.stderr,
          exitCode: processed.exitCode,
          executionTime: `${(elapsed / 1000).toFixed(3)}s`,
          status: processed.exitCode === 0 ? 'Success' : `Exit Code: ${processed.exitCode}`,
          phase: 'run',
          engine: 'local',
          parsedErrors: processed.parsedErrors || [],
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
            status: 'Time Limit Exceeded',
            phase: 'run',
            engine: 'local',
            parsedErrors: [],
          };
        }
        throw runErr;
      }
    }

    // Compiled languages
    if (!lang.interpreted && lang.compile) {
      // 1. Check compilation cache
      const cached = compilationCache.get(language, code);
      let binaryPath;
      let wasCached = false;

      if (cached) {
        wasCached = true;
        metrics.cacheHits++;
        const binName = path.basename(cached.binaryPath);
        const destPath = path.join(sandbox, binName);
        try {
          fs.copyFileSync(cached.binaryPath, destPath);
          if (language !== 'java') fs.chmodSync(destPath, 0o755);
          binaryPath = destPath;
        } catch (e) {
          wasCached = false;
        }
      }

      // 2. Compile if not cached (using singleflight compile lock)
      if (!wasCached) {
        metrics.cacheMisses++;
        const compileResult = await compilationCache.lockAndCompile(language, code, async () => {
          if (language === 'nasm') {
            const asm = await runSandboxedCommand('nasm', ['-f', 'elf64', '-o', 'main.o', lang.fileName], {
              cwd: sandbox,
              timeout: COMPILE_TIMEOUT_MS,
              abortSignal,
            });
            if (asm.exitCode !== 0) return { error: true, result: asm, phase: 'compile', status: 'Assembly Error' };

            const link = await runSandboxedCommand('ld', ['-o', 'main', 'main.o'], {
              cwd: sandbox,
              timeout: COMPILE_TIMEOUT_MS,
              abortSignal,
            });
            if (link.exitCode !== 0) return { error: true, result: link, phase: 'compile', status: 'Link Error' };
          } else {
            const compileArgs = lang.compile.args(lang.fileName);
            const comp = await runSandboxedCommand(lang.compile.cmd, compileArgs, {
              cwd: sandbox,
              timeout: COMPILE_TIMEOUT_MS,
              abortSignal,
            });
            if (comp.exitCode !== 0) return { error: true, result: comp, phase: 'compile', status: 'Compilation Error' };
          }

          // Cache the compiled binary in a persistent directory
          const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), CACHE_DIR_PREFIX));
          const binaryName = language === 'java' ? 'Main.class' : 'main';
          const srcBin = path.join(sandbox, binaryName);
          const cacheBin = path.join(cacheDir, binaryName);
          try {
            if (fs.existsSync(srcBin)) {
              fs.copyFileSync(srcBin, cacheBin);
              if (language !== 'java') fs.chmodSync(cacheBin, 0o755);
              compilationCache.set(language, code, cacheBin, cacheDir);
            }
          } catch (e) {
            cleanupSandbox(cacheDir);
          }

          return { error: false, binaryPath: path.join(sandbox, binaryName) };
        });

        if (compileResult.error) {
          const rawStderr = compileResult.result?.stderr || '';
          if (rawStderr.includes('Unable to locate') || rawStderr.includes('not found') || compileResult.result?.exitCode === 127) {
            console.warn(`[Exec v10.0] Compiler missing for ${language}, auto-switching to cloud`);
            lang.local = false;
            return null;
          }
          const elapsed = Number(process.hrtime.bigint() - startTime) / 1e6;
          const processed = postProcessOutput(compileResult.result, language);
          return {
            success: false,
            stdout: processed.stdout,
            stderr: processed.stderr,
            exitCode: processed.exitCode,
            executionTime: `${(elapsed / 1000).toFixed(3)}s`,
            status: compileResult.status,
            phase: compileResult.phase,
            engine: 'local',
            parsedErrors: processed.parsedErrors || [],
          };
        }
        binaryPath = compileResult.binaryPath;
      }

      // 3. Execute compiled binary
      try {
        const runCmd = lang.runCompiled || lang.runner;
        const runArgs = lang.runCompiled ? [] : lang.runArgs();
        const runResult = await runSandboxedCommand(runCmd, runArgs, {
          cwd: sandbox,
          timeout: TIMEOUT_MS,
          stdin,
          abortSignal,
        });
        const elapsed = Number(process.hrtime.bigint() - startTime) / 1e6;
        const processed = postProcessOutput(runResult, language);
        return {
          success: processed.exitCode === 0,
          stdout: processed.stdout,
          stderr: processed.stderr,
          exitCode: processed.exitCode,
          executionTime: `${(elapsed / 1000).toFixed(3)}s`,
          status: processed.exitCode === 0 ? 'Success' : `Exit Code: ${processed.exitCode}`,
          phase: 'run',
          engine: 'local',
          cached: wasCached,
          parsedErrors: processed.parsedErrors || [],
        };
      } catch (err) {
        const elapsed = Number(process.hrtime.bigint() - startTime) / 1e6;
        if (err.message === 'TIME_LIMIT_EXCEEDED') {
          return {
            success: false,
            stdout: '',
            stderr: `Time Limit Exceeded (${TIMEOUT_MS / 1000}s limit)`,
            exitCode: -1,
            executionTime: `${(elapsed / 1000).toFixed(3)}s`,
            status: 'Time Limit Exceeded',
            phase: 'run',
            engine: 'local',
            parsedErrors: [],
          };
        }
        throw err;
      }
    }

    // Interpreted languages
    try {
      const runArgs = lang.runArgs(lang.fileName);
      const result = await runSandboxedCommand(lang.runner, runArgs, {
        cwd: sandbox,
        timeout: TIMEOUT_MS,
        stdin,
        abortSignal,
      });
      const elapsed = Number(process.hrtime.bigint() - startTime) / 1e6;
      const processed = postProcessOutput(result, language);
      return {
        success: processed.exitCode === 0,
        stdout: processed.stdout,
        stderr: processed.stderr,
        exitCode: processed.exitCode,
        executionTime: `${(elapsed / 1000).toFixed(3)}s`,
        status: processed.exitCode === 0 ? 'Success' : `Exit Code: ${processed.exitCode}`,
        phase: 'run',
        engine: 'local',
        parsedErrors: processed.parsedErrors || [],
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
          status: 'Time Limit Exceeded',
          phase: 'run',
          engine: 'local',
          parsedErrors: [],
        };
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

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: true, message: 'Code is required' });
  }
  if (!language || !LANGUAGES[language]) {
    return res.status(400).json({ error: true, message: `Unsupported language. Supported: ${Object.keys(LANGUAGES).join(', ')}` });
  }
  if (code.length > MAX_CODE_SIZE) {
    return res.status(400).json({ error: true, message: `Code exceeds ${Math.round(MAX_CODE_SIZE / 1000)}KB limit` });
  }

  const lang = LANGUAGES[language];
  metrics.totalExecutions++;
  metrics.languageCounts[language] = (metrics.languageCounts[language] || 0) + 1;

  // 1. Check Result Cache for instant response (<1ms)
  const cachedResult = resultCache.get(language, code, stdin);
  if (cachedResult) {
    metrics.cacheHits++;
    metrics.successfulExecutions++;
    return res.json({
      ...cachedResult,
      cached: true,
      language: lang.name,
      version: lang.version || 'Cached',
    });
  }

  // 2. Setup Client Abort Controller
  const abortController = new AbortController();
  req.on('close', () => {
    if (!res.writableEnded) {
      abortController.abort();
    }
  });

  try {
    // 3. In-flight Singleflight Deduplication & Adaptive Queue
    const result = await singleflight.do(language, code, stdin, async () => {
      const isCompiled = !lang.interpreted;
      const lane = isCompiled ? 'compile' : 'fast';

      return await adaptiveQueue.enqueue({
        lane,
        abortSignal: abortController.signal,
        executeFn: async () => {
          let executionResult = null;

          // Attempt local execution first if runtime is available
          if (lang.local !== false) {
            try {
              executionResult = await executeLocal(code, language, stdin, abortController.signal);
              if (executionResult && !executionResult.success && JUDGE0_LANGUAGE_MAP[language]) {
                const errStr = (executionResult.stderr || executionResult.stdout || '');
                if (errStr.includes('Unable to locate') || errStr.includes('not found') || errStr.includes('No Java')) {
                  console.warn(`[Exec v10.0] Runtime not properly installed for ${language}, auto-switching to cloud`);
                  lang.local = false;
                  executionResult = null;
                }
              }
            } catch (localErr) {
              if (localErr.message === 'REQUEST_ABORTED') throw localErr;

              // If local failed due to missing binary on host, mark local=false and fallback to cloud
              if (JUDGE0_LANGUAGE_MAP[language]) {
                console.warn(`[Exec v10.0] Local runner error for ${language} (${localErr.message}), switching to cloud`);
                lang.local = false;
                executionResult = null;
              } else {
                throw localErr;
              }
            }
          }

          // Fallback to Cloud Engine (Judge0)
          if (!executionResult && JUDGE0_LANGUAGE_MAP[language]) {
            executionResult = await executeCloud(code, language, stdin, abortController.signal);
          }

          return executionResult;
        },
      });
    });

    if (result) {
      if (result.success) {
        metrics.successfulExecutions++;
      } else {
        metrics.failedExecutions++;
      }

      const execMs = parseFloat(result.executionTime) * 1000;
      if (!isNaN(execMs)) {
        metrics.averageExecutionMs = (metrics.averageExecutionMs * (metrics.totalExecutions - 1) + execMs) / metrics.totalExecutions;
      }

      const responsePayload = {
        success: result.success,
        output: result.stdout,
        error: result.stderr,
        exitCode: result.exitCode,
        executionTime: result.executionTime,
        status: result.status,
        engine: result.engine || 'local',
        language: lang.name,
        version: lang.version || (result.engine?.includes('cloud') ? 'Cloud 2026' : null),
        phase: result.phase,
        cached: result.cached || false,
        parsedErrors: result.parsedErrors || [],
      };

      if (result.success) {
        resultCache.set(language, code, stdin, responsePayload);
      }

      return res.json(responsePayload);
    }

    return res.status(503).json({
      error: true,
      message: `${lang.name} execution engine is currently unavailable. Please try again.`,
    });
  } catch (err) {
    if (err.message === 'REQUEST_ABORTED') {
      metrics.abortedExecutions++;
      return; // Request was aborted by client, no need to send response
    }

    metrics.failedExecutions++;

    if (err.message === 'SERVER_SATURATED') {
      return res.status(503).json({
        error: true,
        message: 'Server is currently under heavy load. Please retry in a few seconds.',
      });
    }

    if (err.message === 'QUEUE_FULL') {
      return res.status(503).json({
        error: true,
        message: 'Execution queue is full. Server is busy, please try again shortly.',
      });
    }

    if (err.message === 'QUEUE_TIMEOUT') {
      return res.status(503).json({
        error: true,
        message: 'Execution request timed out in queue. Please retry.',
      });
    }

    console.error(`[Exec Error] ${language}:`, err.message);
    return res.status(500).json({ error: true, message: `Execution failed: ${err.message}` });
  }
}

// ─── API Handler: Cloud Proxy ──────────────────────────────────────────
async function executeCloudProxy(req, res) {
  const { code, language, stdin = '' } = req.body;
  if (!code || typeof code !== 'string') return res.status(400).json({ error: true, message: 'Code is required' });
  if (!language) return res.status(400).json({ error: true, message: 'Language is required' });

  const abortController = new AbortController();
  req.on('close', () => {
    if (!res.writableEnded) abortController.abort();
  });

  try {
    const result = await executeCloud(code, language, stdin, abortController.signal);
    if (result) {
      return res.json({
        success: result.success,
        output: result.stdout,
        error: result.stderr,
        exitCode: result.exitCode,
        executionTime: result.executionTime,
        status: result.status,
        engine: result.engine || 'cloud (Judge0)',
        language: LANGUAGES[language]?.name || language,
        version: 'Cloud 2026',
        phase: result.phase,
        parsedErrors: result.parsedErrors || [],
      });
    }
    return res.status(501).json({ error: true, message: `Cloud execution not available for ${language}` });
  } catch (err) {
    return res.status(500).json({ error: true, message: `Cloud execution failed: ${err.message}` });
  }
}

// ─── API Handler: Supported Languages ──────────────────────────────────
function getSupportedLanguages(req, res) {
  const languages = Object.entries(LANGUAGES).map(([id, lang]) => ({
    id,
    name: lang.name,
    version: lang.version || (JUDGE0_LANGUAGE_MAP[id] ? 'Cloud' : null),
    localExecution: lang.local,
    cloudExecution: Boolean(JUDGE0_LANGUAGE_MAP[id]),
    available: Boolean(lang.local || JUDGE0_LANGUAGE_MAP[id]),
    ext: lang.ext,
    template: lang.template,
  }));
  res.json({ languages });
}

// ─── API Handler: Execution Stats ──────────────────────────────────────
function getExecutionStats(req, res) {
  const queueStats = adaptiveQueue.getStats();
  res.json({
    ...metrics,
    queue: queueStats,
    cache: {
      resultCacheSize: resultCache.size,
      compilationCacheSize: compilationCache.size,
      singleflightActive: singleflight.activeCount,
    },
    circuitBreaker: {
      state: circuitBreaker.state,
      failures: circuitBreaker.failures,
      isOpen: circuitBreaker.isOpen,
    },
    activeProcesses: getActiveProcessCount(),
    activeSandboxes: getActiveSandboxCount(),
    uptime: Math.floor((Date.now() - metrics.startedAt) / 1000),
    memoryUsage: process.memoryUsage(),
  });
}

// ─── Cleanup on Server Shutdown ────────────────────────────────────────
function cleanup() {
  adaptiveQueue.clear();
  cleanupAllProcesses();
  resultCache.clear();
  compilationCache.clear();
}

module.exports = {
  executeCode,
  executeCloudProxy,
  getSupportedLanguages,
  getExecutionStats,
  LANGUAGES,
  cleanup,
};
