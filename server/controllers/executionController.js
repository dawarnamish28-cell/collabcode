/**
 * Execution Controller v6.0 — 20 Languages
 * 
 * ALL 20 LANGUAGES run locally with full stdin/input() support:
 *  - JavaScript (Node.js), TypeScript (tsx), Python 3
 *  - Java (OpenJDK), C (GCC), C++ (G++), Go, Rust, Ruby, PHP
 *  - Perl, R, Bash, Shell (sh), AWK
 *  - NEW: Lua, Fortran (gfortran), Tcl, SQLite, x86-64 Assembly (NASM)
 *
 * made with <3 by Namish
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
    template: `#!/bin/bash\n# Bash — CollabCode\n\necho "Hello from Bash!"\necho "Date: $(date)"\necho "User: $(whoami)"\n\nnums=(5 3 1 4 2)\necho "Numbers: \${nums[@]}"\n\nsorted=($(echo "\${nums[@]}" | tr ' ' '\\n' | sort -n))\necho "Sorted: \${sorted[@]}"\n\nsum=0\nfor n in "\${nums[@]}"; do sum=$((sum + n)); done\necho "Sum: $sum"\n`,
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
    template: `# AWK — CollabCode\nBEGIN {\n    print "Hello from AWK!"\n    print "Fibonacci sequence:"\n    a = 0; b = 1\n    for (i = 1; i <= 10; i++) {\n        printf "%d ", b\n        c = a + b; a = b; b = c\n    }\n    print ""\n    print "Powers of 2:"\n    for (i = 0; i <= 10; i++) {\n        printf "2^%d = %d\\n", i, 2^i\n    }\n}\n`,
  },
  // ─── 5 NEW LANGUAGES v6.0 ─────────────────────────────────────────
  lua: {
    name: 'Lua', ext: '.lua', fileName: 'main.lua',
    local: true, interpreted: true,
    runner: 'lua5.4', runArgs: (f) => [f],
    template: `-- Lua — CollabCode\nprint("Hello from Lua!")\n\nlocal numbers = {5, 3, 1, 4, 2}\ntable.sort(numbers)\nio.write("Sorted: ")\nfor i, v in ipairs(numbers) do\n    io.write(v .. " ")\nend\nprint()\n\nlocal sum = 0\nfor _, v in ipairs(numbers) do sum = sum + v end\nprint("Sum: " .. sum)\n\n-- Fibonacci\nlocal a, b = 0, 1\nio.write("Fibonacci: ")\nfor i = 1, 10 do\n    io.write(b .. " ")\n    a, b = b, a + b\nend\nprint()\n`,
  },
  fortran: {
    name: 'Fortran', ext: '.f90', fileName: 'main.f90',
    local: true, interpreted: false,
    compile: { cmd: 'gfortran', args: (f) => ['-o', 'main', f] },
    runCompiled: './main',
    template: `! Fortran — CollabCode\nprogram hello\n    implicit none\n    integer :: i, sum_val, a, b, c\n    \n    print *, "Hello from Fortran!"\n    \n    sum_val = 0\n    do i = 1, 10\n        sum_val = sum_val + i\n    end do\n    print '(A,I4)', " Sum 1..10: ", sum_val\n    \n    ! Fibonacci\n    a = 0; b = 1\n    write(*, '(A)', advance='no') " Fibonacci: "\n    do i = 1, 10\n        write(*, '(I6)', advance='no') b\n        c = a + b; a = b; b = c\n    end do\n    print *\nend program hello\n`,
  },
  tcl: {
    name: 'Tcl', ext: '.tcl', fileName: 'main.tcl',
    local: true, interpreted: true,
    runner: 'tclsh', runArgs: (f) => [f],
    template: `# Tcl — CollabCode\nputs "Hello from Tcl!"\n\nset numbers {5 3 1 4 2}\nset sorted [lsort -integer $numbers]\nputs "Sorted: $sorted"\n\nset sum 0\nforeach n $numbers { incr sum $n }\nputs "Sum: $sum"\n\n# Fibonacci\nset a 0; set b 1\nset fib {}\nfor {set i 0} {$i < 10} {incr i} {\n    lappend fib $b\n    set c [expr {$a + $b}]\n    set a $b; set b $c\n}\nputs "Fibonacci: $fib"\nputs "Tcl version: [info patchlevel]"\n`,
  },
  sqlite: {
    name: 'SQLite', ext: '.sql', fileName: 'main.sql',
    local: true, interpreted: true,
    runner: 'sqlite3', runArgs: (f) => [':memory:', '.read ' + f],
    // SQLite needs special handling - we'll use a wrapper
    template: `.headers on\n.mode column\n\nCREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER);\n\nINSERT INTO users VALUES (1, 'Alice', 30);\nINSERT INTO users VALUES (2, 'Bob', 25);\nINSERT INTO users VALUES (3, 'Charlie', 35);\n\nSELECT * FROM users;\nSELECT 'Average age: ' || CAST(AVG(age) AS TEXT) AS result FROM users;\nSELECT 'Total: ' || COUNT(*) AS result FROM users;\n`,
    customRunner: true,
  },
  nasm: {
    name: 'Assembly', ext: '.asm', fileName: 'main.asm',
    local: true, interpreted: false,
    compile: {
      cmd: 'nasm',
      args: (f) => ['-f', 'elf64', '-o', 'main.o', f],
    },
    link: { cmd: 'ld', args: () => ['-o', 'main', 'main.o'] },
    runCompiled: './main',
    template: `; x86-64 Assembly (NASM) — CollabCode\n; Prints "Hello from Assembly!"\n\nsection .data\n    msg db "Hello from Assembly!", 10\n    len equ $ - msg\n\nsection .text\n    global _start\n\n_start:\n    ; sys_write(1, msg, len)\n    mov rax, 1\n    mov rdi, 1\n    mov rsi, msg\n    mov rdx, len\n    syscall\n\n    ; sys_exit(0)\n    mov rax, 60\n    xor rdi, rdi\n    syscall\n`,
  },
};

// Version checks for all 20 languages
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

(async function detectVersions() {
  for (const check of versionChecks) {
    try {
      let result;
      // Tcl version check needs special handling
      if (check.lang === 'tcl') {
        result = await runCommand('tclsh', [], { timeout: 5000, stdin: 'puts [info patchlevel]\nexit\n' });
      } else {
        result = await runCommand(check.cmd, check.args, { timeout: 15000 });
      }
      const out = (result.stdout + result.stderr).trim().split('\n')[0];
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

    // Special handling for SQLite
    if (language === 'sqlite') {
      try {
        const result = await runCommand('sqlite3', [':memory:'], {
          cwd: sandbox,
          timeout: TIMEOUT_MS,
          stdin: code + '\n.quit\n',
        });
        const elapsed = Number(process.hrtime.bigint() - startTime) / 1e6;
        return {
          success: result.exitCode === 0,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          executionTime: `${(elapsed / 1000).toFixed(3)}s`,
          status: result.exitCode === 0 ? 'Success' : `Exit Code: ${result.exitCode}`,
          phase: 'run',
        };
      } catch (runErr) {
        const elapsed = Number(process.hrtime.bigint() - startTime) / 1e6;
        if (runErr.message === 'TIME_LIMIT_EXCEEDED') return { success: false, stdout: '', stderr: `Time Limit Exceeded`, exitCode: -1, executionTime: `${(elapsed / 1000).toFixed(3)}s`, status: 'Time Limit Exceeded', phase: 'run' };
        throw runErr;
      }
    }

    // Special handling for NASM (assemble + link)
    if (language === 'nasm') {
      // Assemble
      try {
        const asmResult = await runCommand('nasm', ['-f', 'elf64', '-o', 'main.o', lang.fileName], { cwd: sandbox, timeout: COMPILE_TIMEOUT_MS });
        if (asmResult.exitCode !== 0) {
          const elapsed = Number(process.hrtime.bigint() - startTime) / 1e6;
          return { success: false, stdout: asmResult.stdout, stderr: asmResult.stderr, exitCode: asmResult.exitCode, executionTime: `${(elapsed / 1000).toFixed(3)}s`, status: 'Assembly Error', phase: 'compile' };
        }
      } catch (e) {
        const elapsed = Number(process.hrtime.bigint() - startTime) / 1e6;
        if (e.message === 'TIME_LIMIT_EXCEEDED') return { success: false, stdout: '', stderr: 'Assembly timed out', exitCode: -1, executionTime: `${(elapsed / 1000).toFixed(3)}s`, status: 'Assembly Timeout', phase: 'compile' };
        throw e;
      }
      // Link
      try {
        const linkResult = await runCommand('ld', ['-o', 'main', 'main.o'], { cwd: sandbox, timeout: COMPILE_TIMEOUT_MS });
        if (linkResult.exitCode !== 0) {
          const elapsed = Number(process.hrtime.bigint() - startTime) / 1e6;
          return { success: false, stdout: linkResult.stdout, stderr: linkResult.stderr, exitCode: linkResult.exitCode, executionTime: `${(elapsed / 1000).toFixed(3)}s`, status: 'Link Error', phase: 'compile' };
        }
      } catch (e) {
        const elapsed = Number(process.hrtime.bigint() - startTime) / 1e6;
        if (e.message === 'TIME_LIMIT_EXCEEDED') return { success: false, stdout: '', stderr: 'Linking timed out', exitCode: -1, executionTime: `${(elapsed / 1000).toFixed(3)}s`, status: 'Link Timeout', phase: 'compile' };
        throw e;
      }
      // Run
      try {
        const runResult = await runCommand('./main', [], { cwd: sandbox, timeout: TIMEOUT_MS, stdin });
        const elapsed = Number(process.hrtime.bigint() - startTime) / 1e6;
        return { success: runResult.exitCode === 0, stdout: runResult.stdout, stderr: runResult.stderr, exitCode: runResult.exitCode, executionTime: `${(elapsed / 1000).toFixed(3)}s`, status: runResult.exitCode === 0 ? 'Success' : `Exit Code: ${runResult.exitCode}`, phase: 'run' };
      } catch (runErr) {
        const elapsed = Number(process.hrtime.bigint() - startTime) / 1e6;
        if (runErr.message === 'TIME_LIMIT_EXCEEDED') return { success: false, stdout: '', stderr: `Time Limit Exceeded`, exitCode: -1, executionTime: `${(elapsed / 1000).toFixed(3)}s`, status: 'Time Limit Exceeded', phase: 'run' };
        throw runErr;
      }
    }

    // Standard compiled languages
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

    // Interpreted languages
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
