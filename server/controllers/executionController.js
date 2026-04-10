/**
 * Execution Controller v5.0 — 15 Languages
 * 
 * ALL 15 LANGUAGES run locally with full stdin/input() support:
 *  - JavaScript (Node.js), TypeScript (tsx), Python 3
 *  - Java (OpenJDK), C (GCC), C++ (G++), Go, Rust, Ruby, PHP
 *  - NEW: Perl, R, Bash, Shell (sh), AWK
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const TIMEOUT_MS = parseInt(process.env.EXEC_TIMEOUT_MS) || 10000;
const MAX_OUTPUT = parseInt(process.env.EXEC_MAX_OUTPUT) || 65536;
const COMPILE_TIMEOUT_MS = 15000;

const LANGUAGES = {
  javascript: {
    name: 'JavaScript', ext: '.js', fileName: 'main.js',
    local: true, interpreted: true,
    runner: 'node', runArgs: (f) => [f],
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
    runner: 'python3', runArgs: (f) => ['-u', f],
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
    compile: { cmd: 'gcc', args: (f) => ['-o', 'main', f, '-lm', '-lpthread'] },
    runCompiled: './main',
    template: `#include <stdio.h>\nint main() {\n    char name[100];\n    printf("Enter your name: ");\n    fgets(name, sizeof(name), stdin);\n    printf("Hello, %s", name);\n    return 0;\n}\n`,
  },
  cpp: {
    name: 'C++', ext: '.cpp', fileName: 'main.cpp',
    local: true, interpreted: false,
    compile: { cmd: 'g++', args: (f) => ['-o', 'main', f, '-lm', '-lstdc++', '-lpthread'] },
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
  // ─── 5 NEW LANGUAGES ──────────────────────────────────────────────
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
    template: `#!/bin/bash\n# Bash — CollabCode\n\necho "Hello from Bash!"\necho "Date: $(date)"\necho "User: $(whoami)"\n\n# Arrays\nnums=(5 3 1 4 2)\necho "Numbers: \${nums[@]}"\n\n# Sorting\nsorted=($(echo "\${nums[@]}" | tr ' ' '\\n' | sort -n))\necho "Sorted: \${sorted[@]}"\n\n# Sum\nsum=0\nfor n in "\${nums[@]}"; do sum=$((sum + n)); done\necho "Sum: $sum"\n`,
  },
  shell: {
    name: 'Shell', ext: '.sh', fileName: 'main.sh',
    local: true, interpreted: true,
    runner: 'sh', runArgs: (f) => [f],
    template: `#!/bin/sh\n# Shell (POSIX sh) — CollabCode\n\necho "Hello from Shell!"\necho "Current directory: $(pwd)"\necho "Files in /tmp:"\nls /tmp | head -5\necho "\\nSystem info:"\nuname -a\n`,
  },
  awk: {
    name: 'AWK', ext: '.awk', fileName: 'main.awk',
    local: true, interpreted: true,
    runner: 'awk', runArgs: (f) => ['-f', f],
    template: `# AWK — CollabCode\n# Pipe data via stdin, or this runs with empty input\n\nBEGIN {\n    print "Hello from AWK!"\n    print "Fibonacci sequence:"\n    a = 0; b = 1\n    for (i = 1; i <= 10; i++) {\n        printf "%d ", b\n        c = a + b; a = b; b = c\n    }\n    print ""\n    print "Powers of 2:"\n    for (i = 0; i <= 10; i++) {\n        printf "2^%d = %d\\n", i, 2^i\n    }\n}\n`,
  },
};

// Version checks for all 15 languages
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
];

(async function detectVersions() {
  for (const check of versionChecks) {
    try {
      const ver = await runCommand(check.cmd, check.args, { timeout: 15000 });
      const out = (ver.stdout + ver.stderr).trim().split('\n')[0];
      if (LANGUAGES[check.lang]) LANGUAGES[check.lang].version = out;
      console.log(`[Exec] ${check.lang}: ${out}`);
    } catch (e) {
      console.warn(`[Exec] ${check.lang}: not available (${e.message})`);
      if (LANGUAGES[check.lang]) LANGUAGES[check.lang].local = false;
    }
  }
})();

function runCommand(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const timeout = opts.timeout || TIMEOUT_MS;
    const cwd = opts.cwd || process.cwd();
    const stdin = opts.stdin || '';
    let stdout = '', stderr = '', timedOut = false;
    const env = {
      ...process.env, PATH: process.env.PATH,
      HOME: opts.home || cwd, TMPDIR: cwd,
      NODE_OPTIONS: '', PYTHONUNBUFFERED: '1', PYTHONDONTWRITEBYTECODE: '1',
    };
    if (cmd === 'go') {
      env.GOPATH = path.join(cwd, '.gopath');
      env.GOCACHE = path.join(cwd, '.gocache');
    }
    const child = spawn(cmd, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], env, timeout: timeout + 2000 });
    const killTimer = setTimeout(() => { timedOut = true; try { child.kill('SIGKILL'); } catch (e) {} }, timeout);
    child.stdout.on('data', (data) => {
      stdout += data.toString();
      if (stdout.length > MAX_OUTPUT) { stdout = stdout.substring(0, MAX_OUTPUT) + '\n... [output truncated at 64KB]'; try { child.kill('SIGKILL'); } catch (e) {} }
    });
    child.stderr.on('data', (data) => {
      stderr += data.toString();
      if (stderr.length > MAX_OUTPUT) stderr = stderr.substring(0, MAX_OUTPUT) + '\n... [stderr truncated]';
    });
    if (stdin) child.stdin.write(stdin);
    child.stdin.end();
    child.on('close', (code, signal) => { clearTimeout(killTimer); if (timedOut) reject(new Error('TIME_LIMIT_EXCEEDED')); else resolve({ stdout, stderr, exitCode: code, signal }); });
    child.on('error', (err) => { clearTimeout(killTimer); reject(err); });
  });
}

function createSandbox() { return fs.mkdtempSync(path.join(os.tmpdir(), 'collabcode-')); }
function cleanupSandbox(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} }

async function executeLocal(code, language, stdin) {
  const lang = LANGUAGES[language];
  if (!lang || !lang.local) return null;
  const sandbox = createSandbox();
  const filePath = path.join(sandbox, lang.fileName);
  const startTime = process.hrtime.bigint();
  try {
    fs.writeFileSync(filePath, code, 'utf-8');
    if (!lang.interpreted && lang.compile) {
      const compileArgs = lang.compile.args(lang.fileName);
      let compileResult;
      try { compileResult = await runCommand(lang.compile.cmd, compileArgs, { cwd: sandbox, timeout: COMPILE_TIMEOUT_MS }); }
      catch (compileErr) {
        const elapsed = Number(process.hrtime.bigint() - startTime) / 1e6;
        if (compileErr.message === 'TIME_LIMIT_EXCEEDED') return { success: false, stdout: '', stderr: 'Compilation timed out (15s limit)', exitCode: -1, executionTime: `${(elapsed / 1000).toFixed(3)}s`, status: 'Compilation Timeout', phase: 'compile' };
        throw compileErr;
      }
      if (compileResult.exitCode !== 0) {
        const elapsed = Number(process.hrtime.bigint() - startTime) / 1e6;
        return { success: false, stdout: compileResult.stdout, stderr: compileResult.stderr, exitCode: compileResult.exitCode, executionTime: `${(elapsed / 1000).toFixed(3)}s`, status: 'Compilation Error', phase: 'compile' };
      }
      const runCmd = lang.runCompiled || lang.runner;
      const runArgs = lang.runCompiled ? [] : lang.runArgs();
      try {
        const runResult = await runCommand(runCmd, runArgs, { cwd: sandbox, timeout: TIMEOUT_MS, stdin });
        const elapsed = Number(process.hrtime.bigint() - startTime) / 1e6;
        return { success: runResult.exitCode === 0, stdout: runResult.stdout, stderr: runResult.stderr, exitCode: runResult.exitCode, executionTime: `${(elapsed / 1000).toFixed(3)}s`, status: runResult.exitCode === 0 ? 'Success' : `Exit Code: ${runResult.exitCode}`, phase: 'run' };
      } catch (runErr) {
        const elapsed = Number(process.hrtime.bigint() - startTime) / 1e6;
        if (runErr.message === 'TIME_LIMIT_EXCEEDED') return { success: false, stdout: '', stderr: `Time Limit Exceeded (${TIMEOUT_MS / 1000}s limit)`, exitCode: -1, executionTime: `${(elapsed / 1000).toFixed(3)}s`, status: 'Time Limit Exceeded', phase: 'run' };
        throw runErr;
      }
    }
    const runArgs = lang.runArgs(lang.fileName);
    try {
      const result = await runCommand(lang.runner, runArgs, { cwd: sandbox, timeout: TIMEOUT_MS, stdin });
      const elapsed = Number(process.hrtime.bigint() - startTime) / 1e6;
      return { success: result.exitCode === 0, stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode, executionTime: `${(elapsed / 1000).toFixed(3)}s`, status: result.exitCode === 0 ? 'Success' : `Exit Code: ${result.exitCode}`, phase: 'run' };
    } catch (runErr) {
      const elapsed = Number(process.hrtime.bigint() - startTime) / 1e6;
      if (runErr.message === 'TIME_LIMIT_EXCEEDED') return { success: false, stdout: '', stderr: `Time Limit Exceeded (${TIMEOUT_MS / 1000}s limit)`, exitCode: -1, executionTime: `${(elapsed / 1000).toFixed(3)}s`, status: 'Time Limit Exceeded', phase: 'run' };
      throw runErr;
    }
  } finally { cleanupSandbox(sandbox); }
}

async function executeCode(req, res) {
  const { code, language, stdin = '' } = req.body;
  if (!code || typeof code !== 'string') return res.status(400).json({ error: true, message: 'Code is required' });
  if (!language || !LANGUAGES[language]) return res.status(400).json({ error: true, message: `Unsupported language. Supported: ${Object.keys(LANGUAGES).join(', ')}` });
  if (code.length > 100000) return res.status(400).json({ error: true, message: 'Code exceeds 100KB limit' });
  const lang = LANGUAGES[language];
  console.log(`[Exec] ${language} | ${code.length} chars | stdin=${stdin.length} chars`);
  try {
    const result = await executeLocal(code, language, stdin);
    if (result) return res.json({ success: result.success, output: result.stdout, error: result.stderr, exitCode: result.exitCode, executionTime: result.executionTime, status: result.status, engine: 'local', language: lang.name, version: lang.version, phase: result.phase });
    return res.status(501).json({ error: true, message: `${lang.name} runtime is not available on this server.` });
  } catch (err) {
    console.error(`[Exec] Error:`, err.message);
    return res.status(500).json({ error: true, message: `Execution failed: ${err.message}` });
  }
}

function getSupportedLanguages(req, res) {
  const languages = Object.entries(LANGUAGES).map(([id, lang]) => ({
    id, name: lang.name, version: lang.version || null,
    localExecution: lang.local, ext: lang.ext, template: lang.template,
  }));
  res.json({ languages });
}

module.exports = { executeCode, getSupportedLanguages, LANGUAGES };
