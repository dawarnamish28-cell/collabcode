/**
 * Execution Controller — Production-Grade Code Runner
 * 
 * ALL 10 LANGUAGES run locally with full stdin/input() support:
 *  - JavaScript (Node.js 20), TypeScript (tsx), Python 3.12
 *  - Java (OpenJDK 11), C (GCC 12), C++ (G++ 12)
 *  - Go 1.19, Rust 1.63, Ruby 3.1, PHP 8.2
 *
 * Security measures:
 *  - Isolated temp directory per execution (auto-cleaned)
 *  - SIGKILL timeout enforcement (10s default)
 *  - stdout/stderr capped at 64KB
 *  - Separate compile + run phases for compiled languages
 *  - stdin piped correctly for input() / scanf() / etc.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ─── Configuration ────────────────────────────────────────────────────
const TIMEOUT_MS = parseInt(process.env.EXEC_TIMEOUT_MS) || 10000;
const MAX_OUTPUT = parseInt(process.env.EXEC_MAX_OUTPUT) || 65536;
const COMPILE_TIMEOUT_MS = 15000;

// ─── Language Definitions (ALL 10 local) ──────────────────────────────
const LANGUAGES = {
  javascript: {
    name: 'JavaScript', ext: '.js', fileName: 'main.js',
    local: true, interpreted: true,
    runner: 'node', runArgs: (f) => [f],
    template: `// JavaScript — CollabCode
// console.log(), process.stdin, readline all work

const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question('Enter your name: ', (name) => {
  console.log(\`Hello, \${name}!\`);
  rl.close();
});
`,
  },
  typescript: {
    name: 'TypeScript', ext: '.ts', fileName: 'main.ts',
    local: true, interpreted: true,
    runner: 'npx', runArgs: (f) => ['--yes', 'tsx', f],
    template: `// TypeScript — CollabCode
const message: string = "Hello from TypeScript!";
console.log(message);
`,
  },
  python: {
    name: 'Python 3', ext: '.py', fileName: 'main.py',
    local: true, interpreted: true,
    runner: 'python3', runArgs: (f) => ['-u', f],
    template: `# Python — CollabCode
# input() works! Provide stdin below.

name = input("Enter your name: ")
age = input("Enter your age: ")
print(f"Hello {name}, you are {age} years old!")
`,
  },
  java: {
    name: 'Java', ext: '.java', fileName: 'Main.java',
    local: true, interpreted: false,
    compile: { cmd: 'javac', args: (f) => [f] },
    runner: 'java', runArgs: () => ['-cp', '.', 'Main'],
    template: `// Java — CollabCode
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        System.out.print("Enter your name: ");
        String name = scanner.nextLine();
        System.out.println("Hello, " + name + "!");
        scanner.close();
    }
}
`,
  },
  c: {
    name: 'C', ext: '.c', fileName: 'main.c',
    local: true, interpreted: false,
    compile: { cmd: 'gcc', args: (f) => ['-o', 'main', f, '-lm', '-lpthread'] },
    runCompiled: './main',
    template: `// C — CollabCode
#include <stdio.h>

int main() {
    char name[100];
    printf("Enter your name: ");
    fgets(name, sizeof(name), stdin);
    printf("Hello, %s", name);
    return 0;
}
`,
  },
  cpp: {
    name: 'C++', ext: '.cpp', fileName: 'main.cpp',
    local: true, interpreted: false,
    compile: { cmd: 'g++', args: (f) => ['-o', 'main', f, '-lm', '-lstdc++', '-lpthread'] },
    runCompiled: './main',
    template: `// C++ — CollabCode
#include <iostream>
#include <string>
using namespace std;

int main() {
    string name;
    cout << "Enter your name: ";
    getline(cin, name);
    cout << "Hello, " << name << "!" << endl;
    return 0;
}
`,
  },
  go: {
    name: 'Go', ext: '.go', fileName: 'main.go',
    local: true, interpreted: false,
    compile: { cmd: 'go', args: (f) => ['build', '-o', 'main', f] },
    runCompiled: './main',
    template: `// Go — CollabCode
package main

import (
    "bufio"
    "fmt"
    "os"
)

func main() {
    reader := bufio.NewReader(os.Stdin)
    fmt.Print("Enter your name: ")
    name, _ := reader.ReadString('\\n')
    fmt.Printf("Hello, %s", name)
}
`,
  },
  rust: {
    name: 'Rust', ext: '.rs', fileName: 'main.rs',
    local: true, interpreted: false,
    compile: { cmd: 'rustc', args: (f) => ['-o', 'main', f] },
    runCompiled: './main',
    template: `// Rust — CollabCode
use std::io;

fn main() {
    let mut name = String::new();
    println!("Enter your name:");
    io::stdin().read_line(&mut name).expect("Failed to read");
    println!("Hello, {}!", name.trim());
}
`,
  },
  ruby: {
    name: 'Ruby', ext: '.rb', fileName: 'main.rb',
    local: true, interpreted: true,
    runner: 'ruby', runArgs: (f) => [f],
    template: `# Ruby — CollabCode
print "Enter your name: "
name = gets.chomp
puts "Hello, #{name}!"
`,
  },
  php: {
    name: 'PHP', ext: '.php', fileName: 'main.php',
    local: true, interpreted: true,
    runner: 'php', runArgs: (f) => [f],
    template: `<?php
// PHP — CollabCode
echo "Enter your name: ";
$name = trim(fgets(STDIN));
echo "Hello, $name!\\n";
`,
  },
};

// ─── Detect local runtime versions at startup ─────────────────────────
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

// ─── Helper: Run a command with timeout + stdin ───────────────────────
function runCommand(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const timeout = opts.timeout || TIMEOUT_MS;
    const cwd = opts.cwd || process.cwd();
    const stdin = opts.stdin || '';

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const env = {
      ...process.env,
      PATH: process.env.PATH,
      HOME: opts.home || cwd,
      TMPDIR: cwd,
      NODE_OPTIONS: '',
      PYTHONUNBUFFERED: '1',   // Python: flush output immediately
      PYTHONDONTWRITEBYTECODE: '1',
    };

    // For Go, set GOPATH and GOCACHE
    if (cmd === 'go') {
      env.GOPATH = path.join(cwd, '.gopath');
      env.GOCACHE = path.join(cwd, '.gocache');
    }

    const child = spawn(cmd, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
      timeout: timeout + 2000,
    });

    const killTimer = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGKILL'); } catch (e) {}
    }, timeout);

    child.stdout.on('data', (data) => {
      stdout += data.toString();
      if (stdout.length > MAX_OUTPUT) {
        stdout = stdout.substring(0, MAX_OUTPUT) + '\n... [output truncated at 64KB]';
        try { child.kill('SIGKILL'); } catch (e) {}
      }
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
      if (stderr.length > MAX_OUTPUT) {
        stderr = stderr.substring(0, MAX_OUTPUT) + '\n... [stderr truncated]';
      }
    });

    // Write stdin and close — this makes input() / scanf() / gets() work
    if (stdin) {
      child.stdin.write(stdin);
    }
    child.stdin.end();

    child.on('close', (code, signal) => {
      clearTimeout(killTimer);
      if (timedOut) {
        reject(new Error('TIME_LIMIT_EXCEEDED'));
      } else {
        resolve({ stdout, stderr, exitCode: code, signal });
      }
    });

    child.on('error', (err) => {
      clearTimeout(killTimer);
      reject(err);
    });
  });
}

// ─── Create / cleanup isolated temp directory ─────────────────────────
function createSandbox() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'collabcode-'));
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
  if (!lang || !lang.local) return null;

  const sandbox = createSandbox();
  const filePath = path.join(sandbox, lang.fileName);
  const startTime = process.hrtime.bigint();

  try {
    fs.writeFileSync(filePath, code, 'utf-8');

    // ── COMPILED LANGUAGES (C, C++, Go, Rust, Java) ──
    if (!lang.interpreted && lang.compile) {
      // Phase 1: Compile
      let compileResult;
      const compileArgs = lang.compile.args(lang.fileName);
      try {
        compileResult = await runCommand(lang.compile.cmd, compileArgs, {
          cwd: sandbox, timeout: COMPILE_TIMEOUT_MS,
        });
      } catch (compileErr) {
        const elapsed = Number(process.hrtime.bigint() - startTime) / 1e6;
        if (compileErr.message === 'TIME_LIMIT_EXCEEDED') {
          return { success: false, stdout: '', stderr: 'Compilation timed out (15s limit)', exitCode: -1, executionTime: `${(elapsed / 1000).toFixed(3)}s`, status: 'Compilation Timeout', phase: 'compile' };
        }
        throw compileErr;
      }

      if (compileResult.exitCode !== 0) {
        const elapsed = Number(process.hrtime.bigint() - startTime) / 1e6;
        return { success: false, stdout: compileResult.stdout, stderr: compileResult.stderr, exitCode: compileResult.exitCode, executionTime: `${(elapsed / 1000).toFixed(3)}s`, status: 'Compilation Error', phase: 'compile' };
      }

      // Phase 2: Run compiled binary (or java)
      const runCmd = lang.runCompiled || lang.runner;
      const runArgs = lang.runCompiled ? [] : lang.runArgs();
      try {
        const runResult = await runCommand(runCmd, runArgs, { cwd: sandbox, timeout: TIMEOUT_MS, stdin });
        const elapsed = Number(process.hrtime.bigint() - startTime) / 1e6;
        return { success: runResult.exitCode === 0, stdout: runResult.stdout, stderr: runResult.stderr, exitCode: runResult.exitCode, executionTime: `${(elapsed / 1000).toFixed(3)}s`, status: runResult.exitCode === 0 ? 'Success' : `Exit Code: ${runResult.exitCode}`, phase: 'run' };
      } catch (runErr) {
        const elapsed = Number(process.hrtime.bigint() - startTime) / 1e6;
        if (runErr.message === 'TIME_LIMIT_EXCEEDED') {
          return { success: false, stdout: '', stderr: `Time Limit Exceeded (${TIMEOUT_MS / 1000}s limit)`, exitCode: -1, executionTime: `${(elapsed / 1000).toFixed(3)}s`, status: 'Time Limit Exceeded', phase: 'run' };
        }
        throw runErr;
      }
    }

    // ── INTERPRETED LANGUAGES (JS, TS, Python, Ruby, PHP) ──
    const runArgs = lang.runArgs(lang.fileName);
    try {
      const result = await runCommand(lang.runner, runArgs, { cwd: sandbox, timeout: TIMEOUT_MS, stdin });
      const elapsed = Number(process.hrtime.bigint() - startTime) / 1e6;
      return { success: result.exitCode === 0, stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode, executionTime: `${(elapsed / 1000).toFixed(3)}s`, status: result.exitCode === 0 ? 'Success' : `Exit Code: ${result.exitCode}`, phase: 'run' };
    } catch (runErr) {
      const elapsed = Number(process.hrtime.bigint() - startTime) / 1e6;
      if (runErr.message === 'TIME_LIMIT_EXCEEDED') {
        return { success: false, stdout: '', stderr: `Time Limit Exceeded (${TIMEOUT_MS / 1000}s limit)`, exitCode: -1, executionTime: `${(elapsed / 1000).toFixed(3)}s`, status: 'Time Limit Exceeded', phase: 'run' };
      }
      throw runErr;
    }
  } finally {
    cleanupSandbox(sandbox);
  }
}

// ─── MAIN EXECUTION HANDLER ───────────────────────────────────────────
async function executeCode(req, res) {
  const { code, language, stdin = '' } = req.body;

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: true, message: 'Code is required' });
  }
  if (!language || !LANGUAGES[language]) {
    return res.status(400).json({ error: true, message: `Unsupported language. Supported: ${Object.keys(LANGUAGES).join(', ')}` });
  }
  if (code.length > 100000) {
    return res.status(400).json({ error: true, message: 'Code exceeds 100KB limit' });
  }

  const lang = LANGUAGES[language];
  console.log(`[Exec] ${language} | ${code.length} chars | stdin=${stdin.length} chars`);

  try {
    const result = await executeLocal(code, language, stdin);
    if (result) {
      return res.json({
        success: result.success,
        output: result.stdout,
        error: result.stderr,
        exitCode: result.exitCode,
        executionTime: result.executionTime,
        status: result.status,
        engine: 'local',
        language: lang.name,
        version: lang.version,
        phase: result.phase,
      });
    }

    return res.status(501).json({
      error: true,
      message: `${lang.name} runtime is not available on this server.`,
    });
  } catch (err) {
    console.error(`[Exec] Error:`, err.message);
    return res.status(500).json({
      error: true,
      message: `Execution failed: ${err.message}`,
    });
  }
}

// ─── LANGUAGE LIST ENDPOINT ───────────────────────────────────────────
function getSupportedLanguages(req, res) {
  const languages = Object.entries(LANGUAGES).map(([id, lang]) => ({
    id, name: lang.name, version: lang.version || null,
    localExecution: lang.local, ext: lang.ext, template: lang.template,
  }));

  res.json({ languages });
}

module.exports = { executeCode, getSupportedLanguages, LANGUAGES };
